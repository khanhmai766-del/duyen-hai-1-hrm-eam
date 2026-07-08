// Xuất PDF bằng @react-pdf/renderer (thuần JS, KHÔNG cần Chromium → nhẹ CPU cho VPS).
// Mỗi tổ máy 1 trang A4 ngang, bố cục giống bản Excel.

import * as React from "react";
import {
  Document, Page, View, Text, StyleSheet, Font, renderToBuffer,
} from "@react-pdf/renderer";
import { type UnitReport, type ReportCell } from "@/lib/voi-dot/report-model";
import type { DisplayStatus } from "@/lib/burner-status";

// Helvetica mặc định KHÔNG đủ dấu tiếng Việt → dùng font Việt đặt tại public/fonts/
// (file đặt tên Roboto-*.ttf, nội dung Be Vietnam Pro — đủ dấu tiếng Việt).
Font.register({
  family: "Roboto",
  fonts: [
    { src: `${process.cwd()}/public/fonts/Roboto-Regular.ttf` },
    { src: `${process.cwd()}/public/fonts/Roboto-Bold.ttf`, fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((w) => [w]); // không tự cắt từ tiếng Việt

const C = {
  hdr:     { available: "#70AD47", defect: "#FFC000", unavailable: "#C00000" } as Record<DisplayStatus, string>,
  hdrText: { available: "#FFFFFF", defect: "#000000", unavailable: "#FFFFFF" } as Record<DisplayStatus, string>,
  tint:    { available: "#E2EFDA", defect: "#FFF2CC", unavailable: "#FCE4D6" } as Record<DisplayStatus, string>,
  label: "#C00000", chamber: "#2F5496", border: "#BFBFBF",
};

const s = StyleSheet.create({
  page: { padding: 14, fontFamily: "Roboto", fontSize: 7, color: "#000" },
  title: { fontSize: 12, fontWeight: 700, textAlign: "center", marginBottom: 6 },
  body: { flexDirection: "row" },
  grid: { flex: 1 },
  row: { flexDirection: "row" },
  labelCell: {
    width: 58, backgroundColor: C.label, color: "#fff", fontWeight: 700, fontSize: 7,
    padding: 2, textAlign: "center", alignItems: "center", justifyContent: "center",
    borderWidth: 0.5, borderColor: C.border,
  },
  cell: { flex: 1, borderWidth: 0.5, borderColor: C.border, padding: 2 },
  hdrCell: {
    flex: 1, borderWidth: 0.5, borderColor: C.border, padding: 2,
    alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 8,
  },
  chamber: {
    flex: 1, backgroundColor: C.chamber, color: "#fff", fontWeight: 700, fontSize: 12,
    alignItems: "center", justifyContent: "center", borderWidth: 0.5, borderColor: C.border,
  },
  notes: { width: 150, marginLeft: 4, borderWidth: 0.5, borderColor: C.border, padding: 4, fontSize: 8 },
  legend: { flexDirection: "row", marginTop: 6 },
  legendItem: { paddingVertical: 3, paddingHorizontal: 6, marginRight: 4, fontSize: 7, fontWeight: 700 },
});

const H = { hdr: 16, oil: 92, coal: 54, chamber: 30 };

function HeaderRow({ cells }: { cells: ReportCell[] }) {
  return (
    <View style={[s.row, { minHeight: H.hdr }]}>
      <View style={s.labelCell}><Text>Vòi dầu</Text></View>
      {cells.map((c) => (
        <View key={c.code} style={[s.hdrCell, { backgroundColor: C.hdr[c.status] }]}>
          <Text style={{ color: C.hdrText[c.status] }}>{c.code}{c.force ? " (Force)" : ""}</Text>
        </View>
      ))}
    </View>
  );
}

function DefectRow({ cells, kind }: { cells: ReportCell[]; kind: "oil" | "coal" }) {
  const h = kind === "oil" ? H.oil : H.coal;
  return (
    <View style={[s.row, { minHeight: h }]}>
      <View style={s.labelCell}>
        <Text>{kind === "oil" ? "Khiếm khuyết vòi dầu" : "Khiếm khuyết vòi than"}</Text>
      </View>
      {cells.map((c) => {
        const val = kind === "oil" ? c.oilText : c.coalText;
        const bg = kind === "oil" ? C.tint[c.status] : C.tint[c.coalStatus];
        return (
          <View key={c.code} style={[s.cell, { backgroundColor: bg, minHeight: h }]}>
            <Text>{val}</Text>
          </View>
        );
      })}
    </View>
  );
}

function UnitPage({ rep }: { rep: UnitReport }) {
  return (
    <Page size="A4" orientation="landscape" style={s.page}>
      <Text style={s.title}>KHIẾM KHUYẾT HỆ THỐNG VÒI ĐỐT HFO — TỔ MÁY {rep.unit} — DH1</Text>
      <View style={s.body}>
        <View style={s.grid}>
          <HeaderRow cells={rep.back} />
          <DefectRow cells={rep.back} kind="oil" />
          <DefectRow cells={rep.back} kind="coal" />
          <View style={[s.row, { minHeight: H.chamber }]}>
            <View style={[s.labelCell, { backgroundColor: C.chamber }]}><Text> </Text></View>
            <View style={s.chamber}><Text>BUỒNG ĐỐT {rep.unit}</Text></View>
          </View>
          <DefectRow cells={rep.front} kind="oil" />
          <DefectRow cells={rep.front} kind="coal" />
          <HeaderRow cells={rep.front} />
        </View>
        <View style={s.notes}><Text>{rep.note}</Text></View>
      </View>
      <View style={s.legend}>
        <View style={[s.legendItem, { backgroundColor: "#70AD47", color: "#fff" }]}><Text>Khả dụng</Text></View>
        <View style={[s.legendItem, { backgroundColor: "#FFC000", color: "#000" }]}><Text>Có khiếm khuyết</Text></View>
        <View style={[s.legendItem, { backgroundColor: "#C00000", color: "#fff" }]}><Text>Không khả dụng</Text></View>
        <View style={[s.legendItem, { borderWidth: 0.5, borderColor: C.label, color: C.label }]}>
          <Text>(Force) Cần force tín hiệu lửa</Text>
        </View>
      </View>
    </Page>
  );
}

/** Render toàn bộ tổ máy thành 1 file PDF, trả về Buffer. */
export async function renderBurnerPdf(units: UnitReport[]): Promise<Buffer> {
  return renderToBuffer(
    <Document creator="DH1 Digital Operations" title="Sơ đồ khả dụng vòi đốt">
      {units.map((u) => <UnitPage key={u.unit} rep={u} />)}
    </Document>
  );
}
