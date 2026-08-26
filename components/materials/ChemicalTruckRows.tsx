"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, Check, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { MAX_VEHICLE_NUMBER_LENGTH } from "@/lib/chemical-inventory/constants";

/**
 * Bảng các chuyến xe hóa chất của một phiếu vật tư.
 *
 * Hóa chất về theo ĐỢT NHIỀU XE — đề xuất định kỳ 2–3 ngày một lần, xe về rải rác —
 * nên bước xác nhận lãnh phải là một bảng chứ không phải ba ô đơn.
 *
 * Ba trường của mỗi chuyến (ngày · biển số · khối lượng theo phiếu cân) được ghi thẳng
 * sang sổ tồn kho hóa chất, không lưu bản sao ở phiếu. Chuyến nào nhật ký ngày đã ghi trước thì
 * máy chủ GẮN vào bản ghi đó chứ không tạo dòng thứ hai.
 *
 * Lượng đề xuất trên phiếu chỉ là số tham khảo — cố ý KHÔNG so với lượng nhập.
 */

export type TruckRow = {
  key: string;
  receivedAt: string;
  vehicleNumber: string;
  /** Dòng "Trọng lượng hàng" trên phiếu cân xe của nhà máy — đã trừ bì. */
  plantWeight: string;
  note: string;
};

let seq = 0;
export const emptyTruck = (receivedAt = ""): TruckRow => ({
  key: `truck-${++seq}`,
  receivedAt,
  vehicleNumber: "",
  plantWeight: "",
  note: "",
});

const toNum = (text: string): number | null => {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Khối lượng được công nhận của một chuyến.
 *
 * Ở bước này CHỈ có một con số: dòng "Trọng lượng hàng" trên phiếu cân xe của nhà
 * máy (đã trừ bì xe). Không có số cân thứ hai để đối chứng nên không lấy MIN như
 * sổ Excel cũ — sổ đó ghi cả số cân của nhà thầu, còn VHV lúc nhận hàng chỉ cầm
 * đúng một tờ phiếu cân.
 */
export function acceptedOf(row: TruckRow): number | null {
  return toNum(row.plantWeight);
}

export function truckRowError(row: TruckRow): string | null {
  if (!row.receivedAt) return "Chưa chọn ngày nhập";
  const plant = toNum(row.plantWeight);
  if (plant === null) return "Chưa nhập khối lượng hàng theo phiếu cân";
  if (plant <= 0) return "Khối lượng hàng phải lớn hơn 0";
  const plate = row.vehicleNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (plate.length > MAX_VEHICLE_NUMBER_LENGTH) return `Biển số tối đa ${MAX_VEHICLE_NUMBER_LENGTH} ký tự`;
  return null;
}

export function trucksToPayload(rows: TruckRow[]) {
  return rows.map((row) => ({
    receivedAt: row.receivedAt,
    vehicleNumber: row.vehicleNumber || null,
    plantWeight: toNum(row.plantWeight),
    note: row.note.trim() || null,
  }));
}

const CELL: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  padding: "5px 7px",
  fontSize: 13,
  width: "100%",
  background: "#fff",
};
const NUM_CELL: React.CSSProperties = { ...CELL, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const HEAD: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  color: "#64748b",
  padding: "0 2px 4px",
  textAlign: "left",
};

export function ChemicalTruckRows({
  rows,
  onChange,
  unit,
  disabled,
}: {
  rows: TruckRow[];
  onChange: (rows: TruckRow[]) => void;
  unit?: string;
  disabled?: boolean;
}) {
  const total = useMemo(() => rows.reduce((sum, row) => sum + (acceptedOf(row) ?? 0), 0), [rows]);

  const patch = (key: string, field: keyof TruckRow, value: string) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)));

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 560, borderCollapse: "separate", borderSpacing: "4px 3px" }}>
          <thead>
            <tr>
              <th style={{ ...HEAD, width: 26 }}>#</th>
              <th style={{ ...HEAD, minWidth: 132 }}>Ngày nhập *</th>
              <th style={{ ...HEAD, minWidth: 116 }}>Biển số xe</th>
              <th style={{ ...HEAD, minWidth: 132, textAlign: "right" }}>Khối lượng hàng *</th>
              <th style={{ ...HEAD, width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const accepted = acceptedOf(row);
              const error = truckRowError(row);
              return (
                <tr key={row.key}>
                  <td style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>{index + 1}</td>
                  <td>
                    <input
                      type="date"
                      value={row.receivedAt}
                      disabled={disabled}
                      onChange={(e) => patch(row.key, "receivedAt", e.target.value)}
                      style={CELL}
                      aria-label={`Ngày nhập chuyến ${index + 1}`}
                    />
                  </td>
                  <td>
                    <input
                      value={row.vehicleNumber}
                      disabled={disabled}
                      placeholder="51C-214.77"
                      maxLength={12}
                      onChange={(e) => patch(row.key, "vehicleNumber", e.target.value)}
                      style={{ ...CELL, fontVariantNumeric: "tabular-nums" }}
                      aria-label={`Biển số chuyến ${index + 1}`}
                    />
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      value={row.plantWeight}
                      disabled={disabled}
                      onChange={(e) => patch(row.key, "plantWeight", e.target.value)}
                      style={NUM_CELL}
                      aria-label={`Khối lượng hàng chuyến ${index + 1}`}
                      title="Dòng “Trọng lượng hàng” trên phiếu cân xe — đã trừ bì"
                    />
                  </td>
                  <td>
                    {!disabled && rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                        title="Xóa dòng"
                        aria-label={`Xóa chuyến ${index + 1}`}
                        style={{ border: 0, background: "transparent", color: "#94a3b8", cursor: "pointer", padding: 3 }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                  {error && (
                    <td colSpan={5} style={{ padding: 0 }}>
                      <span style={{ display: "block", fontSize: 11, color: "#b91c1c", paddingLeft: 34 }}>{error}</span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        {!disabled && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => onChange([...rows, emptyTruck(rows[rows.length - 1]?.receivedAt ?? "")])}
          >
            <Plus size={14} /> Thêm xe
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 13 }}>
          Tổng {rows.length} chuyến ·{" "}
          <b style={{ fontVariantNumeric: "tabular-nums" }}>
            {total.toLocaleString("vi-VN", { maximumFractionDigits: 3 })}
            {unit ? ` ${unit}` : ""}
          </b>
        </span>
      </div>
    </div>
  );
}

/**
 * Khối ghi chuyến xe dùng tại bước VHV xác nhận khối lượng lãnh của NH3, hoặc để
 * bổ sung dữ liệu cho phiếu hóa chất thường đã hoàn tất nhưng chưa có chuyến xe.
 */
export function ChemicalTruckPanel({
  initialRows,
  unit,
  canEdit,
  pending,
  submitLabel = "Lưu chuyến xe vào sổ hóa chất",
  onSubmit,
}: {
  initialRows: TruckRow[];
  unit?: string;
  canEdit: boolean;
  pending: boolean;
  submitLabel?: string;
  onSubmit: (rows: TruckRow[]) => void | Promise<void>;
}) {
  const [rows, setRows] = useState<TruckRow[]>(initialRows.length ? initialRows : [emptyTruck()]);
  const firstError = rows.map(truckRowError).find(Boolean) ?? null;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          background: "#f0f9ff",
          border: "1px solid #bae6fd",
          borderRadius: 8,
          padding: "8px 10px",
          fontSize: 12.5,
          color: "#075985",
        }}
      >
        <Check size={14} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          Ghi từng chuyến xe đã về. Khối lượng lấy đúng dòng <b>“Trọng lượng hàng”</b> trên phiếu cân
          xe của nhà máy (đã trừ bì xe). Số liệu chạy thẳng sang sổ <b>Tồn kho hóa chất</b>; chuyến nào
          nhật ký ngày đã ghi trước thì hệ thống gắn vào bản ghi đó, không tạo phiếu trùng.
        </span>
      </div>

      <ChemicalTruckRows rows={rows} onChange={setRows} unit={unit} disabled={!canEdit || pending} />

      {firstError && (
        <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "#b91c1c" }}>
          <AlertTriangle size={13} /> {firstError}
        </span>
      )}

      {canEdit && (
        <button
          type="button"
          className="btn primary"
          disabled={pending || Boolean(firstError)}
          onClick={() => void onSubmit(rows)}
        >
          {pending ? <Loader2 className="spin" size={14} /> : <Check size={14} />} {submitLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Bảng CHỈ ĐỌC của các chuyến xe đã chốt.
 *
 * Ghi xong là số liệu đã chạy sang sổ Tồn kho hóa chất và phiếu đã hoàn tất. Từ đó
 * phiếu vật tư chỉ còn soi lại; muốn sửa thì sang sổ — nhật ký NH3 hoặc tab Phiếu
 * nhập. Cố ý KHÔNG có nút mở khóa tại chỗ: hai cửa cùng sửa một con số là mời hai
 * người ghi đè nhau, mà chỉ sổ mới có ràng buộc kỳ, chống trùng và tính lại tồn cuối.
 */
export function ChemicalTruckLockedTable({
  trucks,
  unit,
}: {
  trucks: Array<{
    id: string;
    receivedAt: string;
    vehicleNumber: string | null;
    acceptedWeight: number;
    note: string | null;
    fromDailyLog: boolean;
  }>;
  unit?: string;
}) {
  const total = trucks.reduce((sum, row) => sum + row.acceptedWeight, 0);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
          borderRadius: 8,
          padding: "8px 10px",
          fontSize: 12.5,
          color: "#14532d",
        }}
      >
        <Lock size={14} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          Đã chốt <b>{trucks.length} chuyến</b> vào sổ <b>Tồn kho hóa chất</b> và hoàn tất đề xuất.
          Số liệu khóa tại đây để tồn kho không lệch. Cần sửa hoặc xóa thì làm ở sổ —
          nhật ký NH3 hoặc tab <b>Phiếu nhập</b> — sửa xong phiếu này tự cập nhật theo.
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 520, borderCollapse: "separate", borderSpacing: "4px 3px" }}>
          <thead>
            <tr>
              <th style={{ ...HEAD, width: 26 }}>#</th>
              <th style={{ ...HEAD, minWidth: 116 }}>Ngày nhập</th>
              <th style={{ ...HEAD, minWidth: 108 }}>Biển số xe</th>
              <th style={{ ...HEAD, minWidth: 124, textAlign: "right" }}>Khối lượng hàng</th>
              <th style={{ ...HEAD }}>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {trucks.map((row, index) => (
              <tr key={row.id}>
                <td style={{ fontSize: 12, color: "#94a3b8" }}>{index + 1}</td>
                <td style={{ fontSize: 13 }}>{row.receivedAt.split("-").reverse().join("/")}</td>
                <td style={{ fontSize: 13 }}>{row.vehicleNumber || "—"}</td>
                <td style={{ fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {row.acceptedWeight.toLocaleString("vi-VN", { maximumFractionDigits: 3 })}
                </td>
                <td style={{ fontSize: 12.5, color: "#64748b" }}>
                  {row.fromDailyLog ? "Gắn vào bản ghi có sẵn của nhật ký ngày" : row.note || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12.5, color: "#475569" }}>
          Tổng {trucks.length} chuyến ·{" "}
          <b style={{ fontVariantNumeric: "tabular-nums" }}>
            {total.toLocaleString("vi-VN", { maximumFractionDigits: 3 })}
            {unit ? ` ${unit}` : ""}
          </b>
        </span>
        <a
          href="/chemical-inventory"
          className="btn"
          style={{ textDecoration: "none" }}
        >
          Sửa ở Tịnh kho hóa chất <ArrowUpRight size={14} />
        </a>
      </div>
    </div>
  );
}
