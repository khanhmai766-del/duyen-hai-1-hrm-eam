"use client";

// =====================================================================
// HỘP THOẠI "THÊM THIẾT BỊ" của sổ TBYCNN.
//
// Khác `PcccCreateDialog` ở hai điểm, do hình dạng dữ liệu khác chứ không phải sở thích:
//
// 1. Cương vị và danh mục CHỌN TỪ DỮ LIỆU ĐANG CÓ chứ không nhập tự do. `khuVuc` và
//    `nhom` là khoá gộp nhóm của cả sổ lẫn bản Excel/PDF ("Máy nghiền S1", "II. VAN AN
//    TOÀN"); gõ tay thì chỉ cần lệch một dấu cách là sinh ra một nhóm mới trông y hệt
//    nhóm cũ. Vẫn để cửa nhập danh mục mới cho trường hợp thật sự cần.
// 2. Chia ba khối (nhận dạng · kiểm định · tình trạng) đúng ba khối của model. Biểu mẫu
//    này 15 ô — dồn thành một lưới phẳng thì không đọc được ô nào thuộc phần nào.
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

/** Một cương vị kèm các danh mục đang có của nó, dựng từ dữ liệu kỳ đang xem. */
export type TbycnnCreateGroup = { khuVuc: string; nhoms: string[] };

const NEW_NHOM = "__new__";

const control =
  "h-10 w-full rounded-xl border border-input bg-white px-3 text-[13px] outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

function Field({
  label,
  required,
  hint,
  span,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  span?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={span ? "grid gap-1.5 sm:col-span-2" : "grid gap-1.5"}>
      <Label className="text-xs font-semibold text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </Label>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function TbycnnCreateDialog({
  open,
  onOpenChange,
  period,
  groups,
  defaultKhuVuc,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: string;
  /** Cương vị người dùng ĐƯỢC GHI — chỗ gọi đã lọc theo phạm vi, đây chỉ hiển thị. */
  groups: TbycnnCreateGroup[];
  defaultKhuVuc?: string;
  pending?: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const initial = useMemo<Record<string, string>>(
    () => ({
      khuVuc: defaultKhuVuc && groups.some((g) => g.khuVuc === defaultKhuVuc) ? defaultKhuVuc : groups.length === 1 ? groups[0].khuVuc : "",
      nhom: "",
      nhomMoi: "",
      tenThietBi: "",
      soLuong: "1",
    }),
    [defaultKhuVuc, groups]
  );
  const [form, setForm] = useState(initial);
  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  const set =
    (key: string) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const nhomList = groups.find((g) => g.khuVuc === form.khuVuc)?.nhoms ?? [];
  const nhom = form.nhom === NEW_NHOM ? form.nhomMoi.trim() : form.nhom;
  const ready = Boolean(form.khuVuc && nhom && form.tenThietBi.trim());

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <Plus className="size-5" />
            </span>
            Thêm thiết bị yêu cầu nghiêm ngặt
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-[12px] text-sky-900">
          <ShieldCheck className="size-4 shrink-0" />
          Thiết bị được thêm vào kỳ <b className="mx-1">{period}</b> và chỉ chọn được cương vị thuộc phạm vi của bạn.
        </div>

        <div className="grid gap-5 py-1">
          <Section title="Nhận dạng thiết bị">
            <Field label="Cương vị quản lý" required>
              <select
                className={control}
                value={form.khuVuc}
                // Đổi cương vị thì bỏ danh mục đang chọn: danh mục của cương vị cũ
                // (số La Mã đánh theo từng cương vị) không còn nghĩa ở cương vị mới.
                onChange={(e) => setForm((prev) => ({ ...prev, khuVuc: e.target.value, nhom: "", nhomMoi: "" }))}
              >
                <option value="">— Chọn cương vị —</option>
                {groups.map((g) => (
                  <option key={g.khuVuc} value={g.khuVuc}>
                    {g.khuVuc}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Danh mục" required>
              <select className={control} value={form.nhom} onChange={set("nhom")} disabled={!form.khuVuc}>
                <option value="">— Chọn danh mục —</option>
                {nhomList.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
                <option value={NEW_NHOM}>+ Danh mục mới…</option>
              </select>
            </Field>
            {form.nhom === NEW_NHOM && (
              <Field
                label="Tên danh mục mới"
                required
                span
                hint="Giữ đúng khuôn của sổ, kèm số La Mã ở đầu — ví dụ: IV. THIẾT BỊ NÂNG"
              >
                <input className={control} value={form.nhomMoi} onChange={set("nhomMoi")} placeholder="IV. THIẾT BỊ NÂNG" />
              </Field>
            )}
            <Field label="Tên thiết bị" required span>
              <input className={control} value={form.tenThietBi} onChange={set("tenThietBi")} placeholder="Pa lăng điện" />
            </Field>
            <Field label="Mã hiệu">
              <input className={control} value={form.maHieu ?? ""} onChange={set("maHieu")} />
            </Field>
            <Field label="KKS">
              <input className={control} value={form.kks ?? ""} onChange={set("kks")} />
            </Field>
            <Field label="Số lượng">
              <input type="number" min="0" className={control} value={form.soLuong} onChange={set("soLuong")} />
            </Field>
            <Field label="Vị trí">
              <input className={control} value={form.viTri ?? ""} onChange={set("viTri")} />
            </Field>
            <Field label="Thông số kỹ thuật" span>
              <input className={control} value={form.thongSoKyThuat ?? ""} onChange={set("thongSoKyThuat")} />
            </Field>
            <Field label="Chức danh quản lý">
              <input className={control} value={form.chucDanhQuanLy ?? ""} onChange={set("chucDanhQuanLy")} />
            </Field>
            <Field label="Đơn vị quản lý">
              <input className={control} value={form.donViQuanLy ?? ""} onChange={set("donViQuanLy")} />
            </Field>
          </Section>

          <Section title="Kiểm định">
            <Field label="Chu kỳ thử (năm)">
              <input type="number" min="0" step="0.5" className={control} value={form.chuKyThu ?? ""} onChange={set("chuKyThu")} />
            </Field>
            <Field label="Số biên bản kiểm định">
              <input className={control} value={form.soBbkd ?? ""} onChange={set("soBbkd")} />
            </Field>
            <Field label="Kiểm định gần nhất" hint="Nhập dd/mm/yyyy, hoặc ghi nguyên văn khi không có ngày">
              <input className={control} value={form.kdGanNhatText ?? ""} onChange={set("kdGanNhatText")} placeholder="19/05/2025" />
            </Field>
            <Field label="Kiểm định tiếp theo" hint="Để trống thì hệ thống tự tính = KĐ gần nhất + chu kỳ thử">
              <input className={control} value={form.kdTiepTheoText ?? ""} onChange={set("kdTiepTheoText")} />
            </Field>
            <Field label="Đơn vị kiểm định" span>
              <input className={control} value={form.donViKd ?? ""} onChange={set("donViKd")} />
            </Field>
          </Section>

          <Section title="Tình trạng">
            <Field label="Số lượng khả dụng" hint="Khả dụng + không khả dụng phải bằng số lượng">
              <input type="number" min="0" className={control} value={form.soLuongKhaDung ?? ""} onChange={set("soLuongKhaDung")} />
            </Field>
            <Field label="Số lượng không khả dụng">
              <input
                type="number"
                min="0"
                className={control}
                value={form.soLuongKhongKhaDung ?? ""}
                onChange={set("soLuongKhongKhaDung")}
              />
            </Field>
            <Field label="Khiếm khuyết" span>
              <input className={control} value={form.khiemKhuyet ?? ""} onChange={set("khiemKhuyet")} />
            </Field>
            <Field label="Ghi chú" span>
              <textarea className={`${control} min-h-20 resize-y py-2.5`} value={form.ghiChu ?? ""} onChange={set("ghiChu")} />
            </Field>
          </Section>
        </div>

        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Huỷ
          </Button>
          <Button size="sm" onClick={() => onSubmit({ ...form, nhom, period })} disabled={pending || !ready}>
            <Plus className="mr-1.5 size-4" />
            {pending ? "Đang thêm…" : "Thêm thiết bị"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
