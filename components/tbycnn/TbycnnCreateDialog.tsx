"use client";

// =====================================================================
// HỘP THOẠI "THÊM THIẾT BỊ" của sổ TBYCNN.
//
// Khác `PcccCreateDialog` ở hai điểm, do hình dạng dữ liệu khác chứ không phải sở thích:
//
// 1. Cương vị CHỌN TỪ DANH MỤC CHỨC DANH CHUẨN của hệ thống (`lib/position-catalog.ts`)
//    kèm ô Tổ máy riêng, đúng khuôn PCCC — không gõ tay và cũng không bịa danh sách
//    riêng cho module này. Danh mục thì chọn từ CỘT "DANH MỤC" của bảng (bản rút gọn,
//    7 giá trị) chứ không phải chuỗi `nhom` có số La Mã: số La Mã đánh riêng theo từng
//    cương vị nên nó là chuyện của máy, không phải thứ bắt người dùng chọn.
// 2. Chia ba khối (nhận dạng · kiểm định · tình trạng) đúng ba khối của model. Biểu mẫu
//    này 15 ô — dồn thành một lưới phẳng thì không đọc được ô nào thuộc phần nào.
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MACHINE_LABEL, PCCC_MACHINES } from "@/lib/pccc-position";
import { computeDefaultKdTiepTheo, formatVNDate } from "@/lib/tbycnn";

/** Một chức danh của danh mục chuẩn, kèm các tổ máy mà chức danh đó có mặt. */
export type TbycnnCreatePosition = { code: string; label: string; units: readonly string[] };

const NEW_DANH_MUC = "__new__";

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
  positions,
  danhMucList,
  defaultPositionCode,
  defaultMachine,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: string;
  /** Chức danh người dùng ĐƯỢC GHI — chỗ gọi đã lọc theo phạm vi, đây chỉ hiển thị. */
  positions: TbycnnCreatePosition[];
  /** Đúng các giá trị của cột "Danh mục" trên bảng, đã rút gọn (bỏ số La Mã). */
  danhMucList: string[];
  defaultPositionCode?: string;
  defaultMachine?: string;
  pending?: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const initial = useMemo<Record<string, string>>(() => {
    const code =
      defaultPositionCode && positions.some((p) => p.code === defaultPositionCode)
        ? defaultPositionCode
        : positions.length === 1
          ? positions[0].code
          : "";
    const units = positions.find((p) => p.code === code)?.units ?? PCCC_MACHINES;
    return {
      cuongViCode: code,
      machine: defaultMachine && units.includes(defaultMachine) ? defaultMachine : units[0] ?? "COMMON",
      danhMuc: "",
      danhMucMoi: "",
      tenThietBi: "",
      soLuong: "1",
    };
  }, [defaultMachine, defaultPositionCode, positions]);
  const [form, setForm] = useState(initial);
  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  const set =
    (key: string) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: event.target.value }));

  // Chức danh chỉ tồn tại ở cấp dùng chung thì không chào mời "Tổ máy 1/2" — danh mục
  // chuẩn đã ghi sẵn chức danh nào có mặt ở tổ máy nào (`units`).
  const machineOptions = positions.find((p) => p.code === form.cuongViCode)?.units ?? PCCC_MACHINES;
  const danhMuc = form.danhMuc === NEW_DANH_MUC ? form.danhMucMoi.trim() : form.danhMuc;
  const ready = Boolean(form.cuongViCode && danhMuc && form.tenThietBi.trim());

  // Ô lịch trả về "yyyy-mm-dd"; sổ thì lưu chữ "dd/mm/yyyy". Đổi qua lại ngay tại đây để
  // phần còn lại của biểu mẫu không phải biết hai định dạng.
  const kdGanNhat = form.kdGanNhat ? new Date(`${form.kdGanNhat}T00:00:00Z`) : null;
  const kdTiepTheo = computeDefaultKdTiepTheo(
    kdGanNhat && !Number.isNaN(kdGanNhat.getTime()) ? kdGanNhat : null,
    Number(form.chuKyThu) || null
  );

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
                value={form.cuongViCode}
                // Đổi chức danh có thể làm tổ máy đang chọn thành vô nghĩa — kéo về tổ
                // máy đầu tiên mà chức danh mới có mặt.
                onChange={(e) => {
                  const code = e.target.value;
                  const units = positions.find((p) => p.code === code)?.units ?? PCCC_MACHINES;
                  setForm((prev) => ({
                    ...prev,
                    cuongViCode: code,
                    machine: units.includes(prev.machine) ? prev.machine : units[0] ?? "COMMON",
                  }));
                }}
              >
                <option value="">— Chọn cương vị —</option>
                {positions.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tổ máy" required>
              <select className={control} value={form.machine} onChange={set("machine")}>
                {machineOptions.map((unit) => (
                  <option key={unit} value={unit}>
                    {MACHINE_LABEL[unit as (typeof PCCC_MACHINES)[number]] ?? unit}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Danh mục" required span>
              <select className={control} value={form.danhMuc} onChange={set("danhMuc")}>
                <option value="">— Chọn danh mục —</option>
                {danhMucList.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
                <option value={NEW_DANH_MUC}>+ Danh mục mới…</option>
              </select>
            </Field>
            {form.danhMuc === NEW_DANH_MUC && (
              <Field
                label="Tên danh mục mới"
                required
                span
                hint="Viết in hoa như các danh mục sẵn có, KHÔNG kèm số La Mã — hệ thống tự đánh số theo cương vị"
              >
                <input className={control} value={form.danhMucMoi} onChange={set("danhMucMoi")} placeholder="THIẾT BỊ NÂNG" />
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
            {/* KHÔNG hỏi "Chức danh quản lý" và "Đơn vị quản lý": cả hai suy được từ ô
                Cương vị ở trên. Đơn vị thì cả 709 dòng nguồn đều là PXVH1 (sổ của riêng
                phân xưởng Vận hành 1), còn chức danh lấy theo đúng chữ mà các dòng cùng
                cương vị đang dùng — có cương vị ghi tắt ("TBTH", "TPĐ", "XLNHH"), hỏi
                người dùng là mỗi người gõ một kiểu. Xem `submitCreate` ở TbycnnPage. */}
          </Section>

          <Section title="Kiểm định">
            <Field label="Chu kỳ thử (tháng)" hint="Ví dụ: 12 · 24 · 36 tháng">
              <input
                type="number"
                min="0"
                step="1"
                className={control}
                value={form.chuKyThu ?? ""}
                onChange={set("chuKyThu")}
                placeholder="24"
              />
            </Field>
            <Field label="Số biên bản kiểm định">
              <input className={control} value={form.soBbkd ?? ""} onChange={set("soBbkd")} />
            </Field>
            {/* Lịch chọn ngày thay cho ô chữ tự do. Ô chữ chỉ cần cho THIẾT BỊ CŨ có
                những giá trị như "Tem bị mờ" / "06/26"; thiết bị vừa thêm thì hoặc có
                ngày kiểm định thật, hoặc để trống. */}
            <Field label="Kiểm định gần nhất" hint="Chọn từ lịch; để trống nếu chưa kiểm định">
              <input type="date" className={control} value={form.kdGanNhat ?? ""} onChange={set("kdGanNhat")} />
            </Field>
            <Field
              label="Kiểm định tiếp theo"
              hint={
                kdTiepTheo
                  ? "Tự tính = KĐ gần nhất + chu kỳ thử"
                  : "Nhập KĐ gần nhất và chu kỳ thử để hệ thống tự tính"
              }
            >
              {/* CHỈ ĐỌC: đây là giá trị dẫn xuất. Server tính lại bằng chính hàm này
                  (`computeDefaultKdTiepTheo`) khi ghi, nên ô này là bản xem trước chứ
                  không phải một đường nhập liệu thứ hai có thể lệch. */}
              <input
                readOnly
                className={`${control} cursor-not-allowed bg-slate-50 text-slate-600`}
                value={kdTiepTheo ? formatVNDate(kdTiepTheo) : "—"}
                tabIndex={-1}
              />
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
          <Button
            size="sm"
            onClick={() => {
              // Bỏ hai khoá chỉ dùng trong biểu mẫu (`kdGanNhat` dạng ISO, `danhMucMoi`)
              // và gửi đúng tên trường của sổ. KHÔNG gửi `kdTiepTheoText`: để trống thì
              // server tự tính, một chỗ tính duy nhất.
              const { kdGanNhat: _iso, danhMucMoi: _moi, ...rest } = form;
              onSubmit({
                ...rest,
                danhMuc,
                kdGanNhatText: kdGanNhat ? formatVNDate(kdGanNhat) : "",
                period,
              });
            }}
            disabled={pending || !ready}
          >
            <Plus className="mr-1.5 size-4" />
            {pending ? "Đang thêm…" : "Thêm thiết bị"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
