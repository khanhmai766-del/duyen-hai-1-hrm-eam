"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CHUNG_LOAI_OPTIONS, VALVE_LOAI_OPTIONS } from "@/lib/pccc-status";
import type { PositionOption } from "@/hooks/usePccc";

export type PcccCreateKind = "EXTINGUISHER" | "CABINET" | "FIRE_CONTROL_CABINET" | "BULK" | "FM200_PANEL" | "ALARM_BUTTON" | "VALVE" | "EMERGENCY_LIGHT";

const LABELS: Record<PcccCreateKind, string> = {
  EXTINGUISHER: "bình chữa cháy",
  CABINET: "tủ chữa cháy",
  FIRE_CONTROL_CABINET: "tủ điều khiển chữa cháy",
  BULK: "thiết bị Foam · CO2 · Diesel",
  FM200_PANEL: "bảng thông số FM200",
  ALARM_BUTTON: "nút nhấn báo cháy",
  VALVE: "van chữa cháy",
  EMERGENCY_LIGHT: "đèn sự cố",
};

type Form = Record<string, string>;

function Field({ label, required, children, span }: { label: string; required?: boolean; children: React.ReactNode; span?: boolean }) {
  return <div className={span ? "grid gap-1.5 sm:col-span-2" : "grid gap-1.5"}><Label className="text-xs font-semibold text-slate-600">{label}{required && <span className="ml-0.5 text-rose-500">*</span>}</Label>{children}</div>;
}

const control = "h-10 w-full rounded-xl border border-input bg-white px-3 text-[13px] outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

export function PcccCreateDialog({ open, onOpenChange, kind, period, positions, defaultPosition, defaultMachine = "COMMON", lightLoai = "EXIT", pending, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: PcccCreateKind;
  period: string;
  positions: PositionOption[];
  defaultPosition?: string;
  defaultMachine?: string;
  lightLoai?: "EXIT" | "CSSC";
  pending?: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const initial = useMemo<Form>(() => ({ cuongViCode: defaultPosition === "ALL" ? "" : defaultPosition ?? "", machine: defaultMachine === "ALL" ? "COMMON" : defaultMachine, sl: "1", dvt: kind === "EXTINGUISHER" ? "Bình" : kind === "CABINET" ? "Tủ" : "%", chungLoai: CHUNG_LOAI_OPTIONS[0], loaiVan: VALVE_LOAI_OPTIONS[0], loai: lightLoai, ten: "Bồn Foam", panelKey: "KICH_TU", binhLabels: "1, 2, 3, 4" }), [defaultMachine, defaultPosition, kind, lightLoai]);
  const [form, setForm] = useState<Form>(initial);
  useEffect(() => { if (open) setForm(initial); }, [open, initial]);
  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Plus className="size-5" /></span>Thêm {LABELS[kind]}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-[12px] text-sky-900"><ShieldCheck className="size-4 shrink-0" />Thiết bị được thêm vào kỳ <b>{period}</b> và áp dụng đúng phạm vi cương vị của bạn.</div>
        <div className="grid gap-3 py-1 sm:grid-cols-2">
          {kind === "EXTINGUISHER" && <><Field label="Mã thiết bị" required><input className={control} value={form.ma ?? ""} onChange={set("ma")} placeholder="VH1/BCC/…" /></Field><Field label="Chủng loại" required><select className={control} value={form.chungLoai} onChange={set("chungLoai")}>{CHUNG_LOAI_OPTIONS.map((x) => <option key={x}>{x}</option>)}</select></Field><Field label="Vị trí lắp đặt" span><input className={control} value={form.viTri ?? ""} onChange={set("viTri")} /></Field><Field label="Nguồn gốc / nhà sản xuất"><input className={control} value={form.nguonGoc ?? ""} onChange={set("nguonGoc")} /></Field><Field label="Số lượng"><input type="number" min="0" className={control} value={form.sl} onChange={set("sl")} /></Field></>}
          {kind === "CABINET" && <><Field label="Mã thiết bị" required><input className={control} value={form.ma ?? ""} onChange={set("ma")} placeholder="VH1/TCC/…" /></Field><Field label="Loại tủ" required><select className={control} value={form.ten ?? "Tủ chữa cháy INDOOR"} onChange={set("ten")}><option>Tủ chữa cháy INDOOR</option><option>Tủ chữa cháy OUTDOOR</option></select></Field><Field label="Vị trí lắp đặt" span><input className={control} value={form.viTri ?? ""} onChange={set("viTri")} /></Field><Field label="Số lượng"><input type="number" min="0" className={control} value={form.sl} onChange={set("sl")} /></Field></>}
          {kind === "FIRE_CONTROL_CABINET" && <><Field label="Mã thiết bị" required><input className={control} value={form.ma ?? ""} onChange={set("ma")} /></Field><Field label="Hệ thống" required><select className={control} value={form.heThong ?? "FM200"} onChange={set("heThong")}><option>FM200</option><option>CO2</option></select></Field><Field label="Vị trí lắp đặt" span><input className={control} value={form.viTri ?? ""} onChange={set("viTri")} /></Field></>}
          {kind === "BULK" && <><Field label="Loại thiết bị" required><select className={control} value={form.ten} onChange={set("ten")}><option>Bồn Foam</option><option>Bồn CO2</option><option>Mức dầu DO bơm chữa cháy Diesel</option></select></Field><Field label="Đơn vị tính"><input className={control} value={form.dvt} onChange={set("dvt")} /></Field><Field label="Khối lượng / mức thiết kế"><input type="number" className={control} value={form.khoiLuongThietKe ?? ""} onChange={set("khoiLuongThietKe")} /></Field><Field label="Khối lượng / mức hiện tại"><input type="number" className={control} value={form.khoiLuongHienTai ?? ""} onChange={set("khoiLuongHienTai")} /></Field><Field label="Vị trí" span><input className={control} value={form.viTri ?? ""} onChange={set("viTri")} /></Field></>}
          {kind === "FM200_PANEL" && <><Field label="Mã bảng" required><select className={control} value={form.panelKey} onChange={set("panelKey")}><option value="KICH_TU">Phòng kích từ</option><option value="DKTT">Nhà điều khiển trung tâm</option></select></Field><Field label="Tên bảng" required><input className={control} value={form.title ?? ""} onChange={set("title")} placeholder="THEO DÕI THÔNG SỐ HỆ THỐNG FM200…" /></Field><Field label="Danh sách nhãn bình" required span><input className={control} value={form.binhLabels} onChange={set("binhLabels")} placeholder="1A, 2A, 3A…" /></Field><Field label="Mức FM200 tối thiểu"><input type="number" className={control} value={form.mucMin ?? ""} onChange={set("mucMin")} /></Field><Field label="Mức FM200 tối đa"><input type="number" className={control} value={form.mucMax ?? ""} onChange={set("mucMax")} /></Field><Field label="Áp suất N2 tối thiểu"><input type="number" className={control} value={form.apMin ?? ""} onChange={set("apMin")} /></Field><Field label="Áp suất N2 tối đa"><input type="number" className={control} value={form.apMax ?? ""} onChange={set("apMax")} /></Field></>}
          {kind === "ALARM_BUTTON" && <><Field label="Mã KKS" required><input className={control} value={form.maKks ?? ""} onChange={set("maKks")} /></Field><Field label="Tên khu vực Layout"><input className={control} value={form.tenKhuVuc ?? ""} onChange={set("tenKhuVuc")} /></Field><Field label="Vị trí cụ thể" span><input className={control} value={form.viTri ?? ""} onChange={set("viTri")} /></Field></>}
          {kind === "VALVE" && <><Field label="Mã KKS" required><input className={control} value={form.maKks ?? ""} onChange={set("maKks")} /></Field><Field label="Tên van" required><input className={control} value={form.tenVan ?? ""} onChange={set("tenVan")} /></Field><Field label="Loại van" required><select className={control} value={form.loaiVan} onChange={set("loaiVan")}>{VALVE_LOAI_OPTIONS.map((x) => <option key={x} value={x}>{x === "DELUGE" ? "Van Deluge" : "Van Alarm"}</option>)}</select></Field><Field label="Vị trí"><input className={control} value={form.viTri ?? ""} onChange={set("viTri")} /></Field></>}
          {kind === "EMERGENCY_LIGHT" && <><Field label="Loại đèn" required><select className={control} value={form.loai} onChange={set("loai")}><option value="EXIT">Đèn EXIT</option><option value="CSSC">Đèn chiếu sáng sự cố</option></select></Field><Field label="Mã KKS" required><input className={control} value={form.maKks ?? ""} onChange={set("maKks")} /></Field><Field label="Tên khu vực"><input className={control} value={form.tenKhuVuc ?? ""} onChange={set("tenKhuVuc")} /></Field><Field label="Mã bản vẽ"><input className={control} value={form.maBanVe ?? ""} onChange={set("maBanVe")} /></Field><Field label="Số lượng trong khu vực"><input type="number" min="0" className={control} value={form.soLuongKhuVuc ?? ""} onChange={set("soLuongKhuVuc")} /></Field></>}
          <Field label="Cương vị quản lý" required><select className={control} value={form.cuongViCode} onChange={set("cuongViCode")}><option value="">— Chọn cương vị —</option>{positions.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}</select></Field>
          <Field label="Tổ máy"><select className={control} value={form.machine} onChange={set("machine")}><option value="S1">Tổ máy 1</option><option value="S2">Tổ máy 2</option><option value="COMMON">Common</option></select></Field>
          {(["EXTINGUISHER", "ALARM_BUTTON", "VALVE", "EMERGENCY_LIGHT"] as PcccCreateKind[]).includes(kind) && <Field label="Cấp giám sát" span><select className={control} value={form.nguoiGiamSatCode ?? ""} onChange={set("nguoiGiamSatCode")}><option value="">— Chưa chọn —</option>{positions.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}</select></Field>}
          <Field label="Ghi chú" span><textarea className={`${control} min-h-20 resize-y py-2.5`} value={form.ghiChu ?? ""} onChange={set("ghiChu")} /></Field>
        </div>
        <DialogFooter><Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Huỷ</Button><Button size="sm" onClick={() => onSubmit({ ...form, kind, period })} disabled={pending || !form.cuongViCode}><Plus className="mr-1.5 size-4" />{pending ? "Đang thêm…" : "Thêm mới"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
