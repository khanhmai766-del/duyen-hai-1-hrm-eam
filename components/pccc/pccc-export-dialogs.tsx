"use client";
// =====================================================================
// Hai hộp thoại chọn phạm vi trước khi xuất file, dựng theo bản web mẫu:
// chọn tháng → chọn nhóm thiết bị → xuất.
//
// Trước đây "Xuất Excel" xuất luôn sheet của tab đang mở và "Xuất PDF" in luôn cả sáu
// nhóm, nên muốn một quyển sổ chỉ có bình chữa cháy thì phải in hết rồi bỏ bớt giấy.
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

/** Khung chung: tiêu đề + mô tả + các khối chọn + nút xuất. */
const SECTION = "rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3";
const SECTION_TITLE = "text-[13px] font-semibold text-slate-700";
const SELECT =
  "mt-1.5 h-10 w-full rounded-xl border border-input bg-white px-2.5 text-[13px] outline-none focus:ring-2 focus:ring-accent/20";

export type ExportChoice = { key: string; label: string };

/**
 * Danh sách sheet của file Excel. `key` là mã sheet mà /api/pccc/export hiểu.
 *
 * Đèn EXIT và Đèn chiếu sáng sự cố nằm CHUNG một mã: chúng là một bảng trong cơ sở dữ
 * liệu, tách thành hai sheet là việc của trình dựng file.
 */
export const EXCEL_SHEETS: ExportChoice[] = [
  { key: "BCC", label: "Bình chữa cháy (BCC)" },
  { key: "TCC", label: "Tủ chữa cháy (TCC)" },
  { key: "CVCC", label: "Cuộn vòi chữa cháy (CVCC)" },
  { key: "TDKCC", label: "Tủ điều khiển chữa cháy" },
  { key: "FCD", label: "Foam / CO2 / Diesel / FM200" },
  { key: "NNBC", label: "Nút nhấn báo cháy (NNBC)" },
  { key: "VAN", label: "Van chữa cháy" },
  { key: "DEN", label: "Đèn EXIT + Đèn chiếu sáng sự cố" },
];

/**
 * Nhóm thiết bị của sổ Bảng II.
 *
 * Tủ chữa cháy và cuộn vòi đi CHUNG một ô chọn: cuộn vòi là bảng con của tủ, in tủ mà
 * thiếu cuộn vòi thì người đọc sổ tưởng tủ chưa được khai báo đủ.
 */
export const BOOK_GROUP_CHOICES: (ExportChoice & { keys: string[] })[] = [
  { key: "BCC", keys: ["BCC"], label: "Bình chữa cháy (BCC)" },
  { key: "TCC", keys: ["TCC", "CVCC"], label: "Tủ chữa cháy + Cuộn vòi chữa cháy (TCC/CVCC)" },
  { key: "VAN", keys: ["VAN"], label: "Van chữa cháy" },
  { key: "NNBC", keys: ["NNBC"], label: "Nút nhấn báo cháy (NNBC)" },
  { key: "TDKCC", keys: ["TDKCC"], label: "Tủ điều khiển chữa cháy" },
  { key: "DEN_EXIT", keys: ["DEN_EXIT"], label: "Đèn EXIT (thoát hiểm)" },
  { key: "DEN_CSSC", keys: ["DEN_CSSC"], label: "Đèn chiếu sáng sự cố" },
];

/** Khối "Tất cả" + danh sách ô tích. Tích "Tất cả" thì các ô con mờ đi như bản mẫu. */
function ChoiceList({
  title,
  choices,
  all,
  onAllChange,
  picked,
  onPickedChange,
}: {
  title: string;
  choices: ExportChoice[];
  all: boolean;
  onAllChange: (next: boolean) => void;
  picked: Set<string>;
  onPickedChange: (next: Set<string>) => void;
}) {
  return (
    <div className={SECTION}>
      <p className={SECTION_TITLE}>{title}</p>
      <div className="mt-2 space-y-1.5">
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-ink">
          <Checkbox checked={all} onCheckedChange={(v) => onAllChange(v === true)} />
          Tất cả
        </label>
        {choices.map((c) => (
          <label
            key={c.key}
            className={`flex items-center gap-2.5 pl-5 text-[13px] ${all ? "cursor-default text-muted-foreground" : "cursor-pointer text-ink"}`}
          >
            <Checkbox
              checked={all || picked.has(c.key)}
              disabled={all}
              onCheckedChange={(v) => {
                const next = new Set(picked);
                if (v === true) next.add(c.key);
                else next.delete(c.key);
                onPickedChange(next);
              }}
            />
            {c.label}
          </label>
        ))}
      </div>
    </div>
  );
}

/** Ô chọn tháng — dùng chung cho cả hai hộp thoại. */
function PeriodPicker({ periods, value, onChange }: { periods: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className={SECTION}>
      <Label className={SECTION_TITLE}>Chọn tháng/năm</Label>
      <select className={SELECT} value={value} onChange={(e) => onChange(e.target.value)}>
        {periods.map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Gom trạng thái chọn của một hộp thoại và ĐẶT LẠI mỗi lần mở.
 *
 * Đặt lại là có chủ đích: lần xuất trước chọn gì không nên âm thầm quyết định lần sau —
 * người dùng mở hộp thoại ra là để chọn lại từ đầu.
 */
function usePickState(open: boolean, defaultPeriod: string) {
  const [period, setPeriod] = useState(defaultPeriod);
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    setPeriod(defaultPeriod);
    setAll(true);
    setPicked(new Set());
  }, [open, defaultPeriod]);
  return { period, setPeriod, all, setAll, picked, setPicked };
}

export function PcccExcelExportDialog({
  open,
  onOpenChange,
  periods,
  defaultPeriod,
  busy,
  onExport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periods: string[];
  defaultPeriod: string;
  busy: boolean;
  onExport: (periodLabel: string, sheets: string[]) => void;
}) {
  const st = usePickState(open, defaultPeriod);
  const sheets = st.all ? EXCEL_SHEETS.map((s) => s.key) : [...st.picked];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Xuất báo cáo Excel</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] leading-6 text-muted-foreground">
          Xuất file .xlsx theo đúng mẫu cột/màu của biểu mẫu gốc, lấy dữ liệu của tháng được chọn kèm chữ ký đã xác nhận.
        </p>
        <PeriodPicker periods={periods} value={st.period} onChange={st.setPeriod} />
        <ChoiceList
          title="Chọn sheet cần xuất"
          choices={EXCEL_SHEETS}
          all={st.all}
          onAllChange={st.setAll}
          picked={st.picked}
          onPickedChange={st.setPicked}
        />
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button size="sm" disabled={busy || sheets.length === 0} onClick={() => onExport(st.period, sheets)}>
            {busy ? "Đang xuất…" : "Xuất file"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PcccBookExportDialog({
  open,
  onOpenChange,
  periods,
  defaultPeriod,
  positions,
  defaultPosition,
  busy,
  onExport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periods: string[];
  defaultPeriod: string;
  positions: { code: string; label: string }[];
  defaultPosition: string;
  busy: boolean;
  onExport: (periodLabel: string, cuongVi: string, groups: string[]) => void;
}) {
  const st = usePickState(open, defaultPeriod);
  const [cuongVi, setCuongVi] = useState(defaultPosition);
  useEffect(() => {
    if (open) setCuongVi(defaultPosition);
  }, [open, defaultPosition]);

  const groups = useMemo(
    () => BOOK_GROUP_CHOICES.filter((g) => st.all || st.picked.has(g.key)).flatMap((g) => g.keys),
    [st.all, st.picked]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Xuất sổ theo dõi (Bảng II)</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] leading-6 text-muted-foreground">
          Dựng sổ theo đúng mẫu &ldquo;BẢNG II: THEO DÕI KIỂM TRA, BẢO QUẢN, BẢO DƯỠNG&rdquo; (Thông báo 5100/TB-NĐDH):
          các nhóm đã chọn gộp thành một bảng liên tục, số thứ tự chạy xuyên suốt. Bản dựng ra là{" "}
          <span className="font-semibold text-slate-700">bản nháp để xem trước</span>, chốt in ở bước sau.
        </p>
        <PeriodPicker periods={periods} value={st.period} onChange={st.setPeriod} />
        <div className={SECTION}>
          <Label className={SECTION_TITLE}>Chọn cương vị quản lý</Label>
          <select className={SELECT} value={cuongVi} onChange={(e) => setCuongVi(e.target.value)}>
            {positions.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <ChoiceList
          title="Chọn nhóm thiết bị cần xuất"
          choices={BOOK_GROUP_CHOICES}
          all={st.all}
          onAllChange={st.setAll}
          picked={st.picked}
          onPickedChange={st.setPicked}
        />
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button size="sm" disabled={busy || !cuongVi || groups.length === 0} onClick={() => onExport(st.period, cuongVi, groups)}>
            {busy ? "Đang dựng…" : "Xem trước"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
