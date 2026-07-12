"use client";

import * as React from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, FileSpreadsheet, Loader2, RotateCcw, Save } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createEmptyBgtsRows,
  mergeBgtsRows,
  type BgtsTuabinNgungRow,
  useBgtsTuabinNgung,
  useBgtsTuabinNgungArchive,
  useResetBgtsTuabinNgungSignature,
  useSaveBgtsTuabinNgung,
} from "@/hooks/useBgtsTuabinNgung";
import {
  BGTS_TUABIN_NGUNG_FIELDS,
  BGTS_TUABIN_NGUNG_FIELD_KEYS,
  type BgtsTuabinNgungFieldKey,
} from "@/lib/bgts-tuabin-ngung";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { cn } from "@/lib/utils";

const UNIT_OPTIONS = [
  { label: "S1", value: "S1" },
  { label: "S2", value: "S2" },
];
const SHIFT_CONFIGS = [
  {
    key: "day",
    label: "Ca sáng",
    signerField: "dayShiftSigner",
    confirmedAtField: "dayShiftConfirmedAt",
    hours: [7, 9, 11, 13],
  },
  {
    key: "middle",
    label: "Ca chiều",
    signerField: "middleShiftSigner",
    confirmedAtField: "middleShiftConfirmedAt",
    hours: [15, 17, 19, 21],
  },
  {
    key: "night",
    label: "Ca đêm",
    signerField: "nightShiftSigner",
    confirmedAtField: "nightShiftConfirmedAt",
    hours: [1, 3, 5],
  },
] as const;

type ShiftKey = (typeof SHIFT_CONFIGS)[number]["key"];
type ShiftConfig = (typeof SHIFT_CONFIGS)[number];

function todayString() {
  const date = new Date();
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 10);
}

function normalizeNumberInput(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatDateForExcel(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function rowHasData(row: BgtsTuabinNgungRow) {
  return BGTS_TUABIN_NGUNG_FIELD_KEYS.some((key) => row[key] !== null && row[key] !== undefined);
}

function originalFieldName(field: (typeof BGTS_TUABIN_NGUNG_FIELDS)[number]) {
  return field.excelHeader.filter(Boolean).join(" - ");
}

function shiftForHour(hour: number) {
  return SHIFT_CONFIGS.find((shift) => (shift.hours as readonly number[]).includes(hour));
}

function formatConfirmTime(value?: string | null) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return value;
  const [, year, month, day, hour, minute, second] = match;
  return `${hour}:${minute}:${second} ${day}/${month}/${year}`;
}

export default function BgtsTuabinNgungPage() {
  const [unit, setUnit] = React.useState("S1");
  const [date, setDate] = React.useState(todayString());
  const [rows, setRows] = React.useState<BgtsTuabinNgungRow[]>(() => createEmptyBgtsRows());
  const [dayShiftSigner, setDayShiftSigner] = React.useState("");
  const [middleShiftSigner, setMiddleShiftSigner] = React.useState("");
  const [nightShiftSigner, setNightShiftSigner] = React.useState("");
  const [confirmingShift, setConfirmingShift] = React.useState<ShiftConfig | null>(null);
  const [resettingShift, setResettingShift] = React.useState<ShiftConfig | null>(null);

  const { data: session } = useSession();
  const query = useBgtsTuabinNgung(unit, date);
  const archiveQuery = useBgtsTuabinNgungArchive(unit);
  const saveMutation = useSaveBgtsTuabinNgung();
  const resetMutation = useResetBgtsTuabinNgungSignature();
  const rbac = useRbacAccess();
  const canSave = rbac.can("archive-grid-separation", ["create", "manage", "full"]);
  const isAdmin = session?.user?.role === "ADMIN";

  React.useEffect(() => {
    if (!query.data) return;
    setRows(mergeBgtsRows(query.data.rows));
    setDayShiftSigner(query.data.record?.dayShiftSigner ?? "");
    setMiddleShiftSigner(query.data.record?.middleShiftSigner ?? "");
    setNightShiftSigner(query.data.record?.nightShiftSigner ?? "");
  }, [query.data]);

  const enteredRows = React.useMemo(() => rows.filter(rowHasData).length, [rows]);
  const enteredCells = React.useMemo(
    () =>
      rows.reduce(
        (total, row) =>
          total + BGTS_TUABIN_NGUNG_FIELD_KEYS.filter((key) => row[key] !== null && row[key] !== undefined).length,
        0
      ),
    [rows]
  );
  const confirmedAtByShift = {
    day: query.data?.record?.dayShiftConfirmedAt ?? null,
    middle: query.data?.record?.middleShiftConfirmedAt ?? null,
    night: query.data?.record?.nightShiftConfirmedAt ?? null,
  } satisfies Record<ShiftKey, string | null>;
  const confirmingShiftSigner =
    confirmingShift?.key === "day"
      ? dayShiftSigner
      : confirmingShift?.key === "middle"
        ? middleShiftSigner
        : confirmingShift?.key === "night"
          ? nightShiftSigner
          : "";

  function updateCell(rowIndex: number, field: BgtsTuabinNgungFieldKey, value: string) {
    setRows((current) =>
      current.map((row, index) => (index === rowIndex ? { ...row, [field]: normalizeNumberInput(value) } : row))
    );
  }

  function rowLocked(hour: number) {
    const shift = shiftForHour(hour);
    return shift ? Boolean(confirmedAtByShift[shift.key]) : false;
  }

  async function saveRecord(confirmShift?: ShiftKey, successMessage?: string) {
    if (!canSave) {
      toast.error("Bạn không có quyền lưu BGTS Tuabin ngừng");
      return;
    }
    try {
      await saveMutation.mutateAsync({
        unit,
        date,
        dayShiftSigner,
        middleShiftSigner,
        nightShiftSigner,
        confirmShift,
        rows,
      });
      toast.success(successMessage ?? (confirmShift ? "Đã xác nhận ca" : "Đã lưu BGTS Tuabin ngừng"));
      if (confirmShift) setConfirmingShift(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : confirmShift ? "Không thể xác nhận ca" : "Không thể lưu BGTS Tuabin ngừng");
    }
  }

  async function resetSignature() {
    if (!resettingShift || !isAdmin) return;
    try {
      await resetMutation.mutateAsync({ unit, date, resetShift: resettingShift.key });
      toast.success(`Đã reset ký tên ${resettingShift.label.toLowerCase()}; người dùng có thể nhập lại thông số`);
      setResettingShift(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể reset ký tên xác nhận");
    }
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const headerRow3 = [
      "TIME",
      "Pressure of Turbine lube oil",
      "shaft-jacking oil pressure",
      "rotate speed",
      "Turning gear electricity",
      "Eccentricity",
      "Expansion of HP & MP casings",
      "",
      "Axial displacement",
      "HP&MP casing differential expansion",
      "LP casing",
      "HP main steam valve wall temperature (right)",
      "",
      "HP regulating valve wall temperature",
      "",
      "temperature of HP inner casing lower part",
      "",
      "HP exhaust outer casing inner wall temperature",
      "",
      "HP exhaust pipe temperature",
      "",
      "",
      "",
      "MP intake Metal temperature",
      "",
      "MP exhaust inner wall temperature",
      "",
    ];
    const headerRow4 = [
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "differential",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "left1",
      "left2",
      "right1",
      "right2",
      "",
      "",
      "",
      "",
    ];
    const headerRow5 = [
      "",
      "",
      "",
      "",
      "",
      "",
      "Left",
      "Right",
      "",
      "",
      "expansion",
      "inside",
      "outside",
      "inside",
      "outside",
      "inside",
      "outside",
      "Top",
      "lower",
      "",
      "",
      "",
      "",
      "Inner wall",
      "Outer wall",
      "top",
      "lower",
    ];
    const headerRows = [
      ["DH1 STEAM CASING TEMPERATURE RECORD TABLE - APPLY FOR TURBINE SHUTDOWN"],
      [`Date: ${formatDateForExcel(date)}`, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      headerRow3,
      headerRow4,
      headerRow5,
      ["", ...BGTS_TUABIN_NGUNG_FIELDS.map((field) => field.unit)],
    ];
    const bodyRows = rows.map((row) => [row.timeHour, ...BGTS_TUABIN_NGUNG_FIELDS.map((field) => row[field.key] ?? "")]);
    const footerRow = [
      `day shift（signature）: ${dayShiftSigner}`,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      `middle shift（signature）: ${middleShiftSigner}`,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      `night shft ( singnature): ${nightShiftSigner}`,
    ];
    const sheet = XLSX.utils.aoa_to_sheet([...headerRows, ...bodyRows, footerRow]);

    sheet["!merges"] = [
      XLSX.utils.decode_range("A1:AA1"),
      XLSX.utils.decode_range("A3:A6"),
      XLSX.utils.decode_range("B3:B5"),
      XLSX.utils.decode_range("C3:C5"),
      XLSX.utils.decode_range("D3:D5"),
      XLSX.utils.decode_range("E3:E5"),
      XLSX.utils.decode_range("F3:F5"),
      XLSX.utils.decode_range("G3:H4"),
      XLSX.utils.decode_range("I3:I5"),
      XLSX.utils.decode_range("J3:J5"),
      XLSX.utils.decode_range("L3:M4"),
      XLSX.utils.decode_range("N3:O4"),
      XLSX.utils.decode_range("P3:Q4"),
      XLSX.utils.decode_range("R3:S4"),
      XLSX.utils.decode_range("T3:W3"),
      XLSX.utils.decode_range("X3:Y4"),
      XLSX.utils.decode_range("Z3:AA4"),
      XLSX.utils.decode_range("A19:H19"),
      XLSX.utils.decode_range("I19:S19"),
      XLSX.utils.decode_range("T19:AA19"),
    ];
    sheet["!cols"] = [
      { wch: 8 },
      ...BGTS_TUABIN_NGUNG_FIELDS.map((field) => ({ wch: Math.max(12, Math.min(22, field.shortLabel.length + 4)) })),
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "BGTS Tuabin Ngung");
    XLSX.writeFile(workbook, `BGTS-tuabin-ngung-${unit}-${date}.xlsx`, { compression: true });
    toast.success("Đã xuất Excel BGTS Tuabin ngừng");
  }

  return (
    <div className="space-y-5">
      <PageHeader title="BGTS TUABIN NGỪNG" description="Nhập thông số DCS theo ngày và xuất lại bảng Excel đúng mẫu">
        <Link href="/documents/archive">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Quay lại Thư mục lưu trữ
          </Button>
        </Link>
      </PageHeader>

      <Card className="border-slate-200 bg-white p-4">
        <div className="grid gap-4 lg:grid-cols-[120px_180px_1fr_auto] lg:items-end">
          <div className="space-y-2">
            <Label>Tổ máy</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ngày ghi thông số</Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <Metric label="Mốc giờ có dữ liệu" value={`${enteredRows}/12`} />
            <Metric label="Ô thông số đã nhập" value={String(enteredCells)} />
            <Metric label="Trạng thái" value={query.data?.record ? "Đã có bản ghi" : "Bảng mới"} />
          </div>
          <div className="grid w-full grid-cols-2 gap-2 lg:w-[390px]">
              <Select value={archiveQuery.data?.items.some((item) => item.date === date) ? date : undefined} onValueChange={setDate}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder={archiveQuery.isLoading ? "Đang tải lưu trữ..." : "Lưu trữ"} />
                </SelectTrigger>
                <SelectContent>
                  {(archiveQuery.data?.items ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.date}>
                      {formatDateForExcel(item.date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" className="h-10 w-full justify-center" onClick={exportExcel} disabled={query.isLoading}>
                <FileSpreadsheet className="h-4 w-4" />
                Xuất Excel
              </Button>
              <Button type="button" className="h-10 w-full justify-center" onClick={() => saveRecord()} disabled={saveMutation.isPending || query.isLoading || !canSave}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Lưu bảng
              </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-ink">Bảng thông số theo mốc giờ</p>
            <p className="text-xs text-muted-foreground">
              Nhập số theo đơn vị của từng cột; ô trống sẽ được lưu và xuất Excel dưới dạng rỗng.
            </p>
          </div>
          {query.isFetching ? (
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải dữ liệu
            </div>
          ) : null}
        </div>

        <Table wrapperClassName="max-h-[62vh] overflow-auto">
          <TableHeader className="sticky top-0 z-20 bg-slate-50">
            <TableRow className="hover:bg-slate-50">
              <TableHead className="sticky left-0 z-30 w-8 min-w-8 border-r bg-slate-50 px-0.5 text-center text-[10px]">Giờ</TableHead>
              {BGTS_TUABIN_NGUNG_FIELDS.map((field) => (
                <TableHead key={field.key} className="w-16 min-w-16 max-w-16 border-r px-0.5 py-1 text-center normal-case tracking-normal" title={originalFieldName(field)}>
                  <div className="space-y-0.5">
                    {field.excelHeader.filter(Boolean).map((line, index) => (
                      <div key={`${field.key}-${index}`} className="break-words text-[8px] font-semibold leading-[1.05] text-slate-700 [overflow-wrap:anywhere]">
                        {line}
                      </div>
                    ))}
                    <div className="break-words text-[8px] font-medium leading-[1.05] text-muted-foreground [overflow-wrap:anywhere]">{field.unit}</div>
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow key={row.timeHour} className={cn(rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/45")}>
                <TableCell className="sticky left-0 z-10 w-8 min-w-8 border-r bg-inherit px-0.5 py-0.5 text-center text-[11px] font-semibold text-navy">
                  {row.timeHour}
                </TableCell>
                {BGTS_TUABIN_NGUNG_FIELDS.map((field) => (
                  <TableCell key={field.key} className="w-16 min-w-16 max-w-16 border-r p-0.5">
                    <Input
                      inputMode="decimal"
                      type="number"
                      step="any"
                      className="h-7 w-14 min-w-0 rounded-sm border-slate-200 px-1 text-right text-[11px]"
                      value={row[field.key] ?? ""}
                      disabled={!canSave || rowLocked(row.timeHour)}
                      onChange={(event) => updateCell(rowIndex, field.key, event.target.value)}
                      title={row[field.key] === null || row[field.key] === undefined ? "" : String(row[field.key])}
                      aria-label={`${originalFieldName(field)} lúc ${row.timeHour} giờ`}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Ca sáng ký tên</Label>
            <Input value={dayShiftSigner} onChange={(event) => setDayShiftSigner(event.target.value)} disabled={!canSave || Boolean(confirmedAtByShift.day)} placeholder="Nhập tên người ký ca sáng" />
            <ShiftConfirm
              label="Ca sáng"
              hours="7, 9, 11, 13"
              confirmedAt={confirmedAtByShift.day}
              disabled={!canSave || saveMutation.isPending || query.isLoading}
              onConfirm={() => setConfirmingShift(SHIFT_CONFIGS[0])}
              canReset={isAdmin}
              onReset={() => setResettingShift(SHIFT_CONFIGS[0])}
            />
          </div>
          <div className="space-y-2">
            <Label>Ca chiều ký tên</Label>
            <Input value={middleShiftSigner} onChange={(event) => setMiddleShiftSigner(event.target.value)} disabled={!canSave || Boolean(confirmedAtByShift.middle)} placeholder="Nhập tên người ký ca chiều" />
            <ShiftConfirm
              label="Ca chiều"
              hours="15, 17, 19, 21"
              confirmedAt={confirmedAtByShift.middle}
              disabled={!canSave || saveMutation.isPending || query.isLoading}
              onConfirm={() => setConfirmingShift(SHIFT_CONFIGS[1])}
              canReset={isAdmin}
              onReset={() => setResettingShift(SHIFT_CONFIGS[1])}
            />
          </div>
          <div className="space-y-2">
            <Label>Ca đêm ký tên</Label>
            <Input value={nightShiftSigner} onChange={(event) => setNightShiftSigner(event.target.value)} disabled={!canSave || Boolean(confirmedAtByShift.night)} placeholder="Nhập tên người ký ca đêm" />
            <ShiftConfirm
              label="Ca đêm"
              hours="23, 1, 3, 5"
              confirmedAt={confirmedAtByShift.night}
              disabled={!canSave || saveMutation.isPending || query.isLoading}
              onConfirm={() => setConfirmingShift(SHIFT_CONFIGS[2])}
              canReset={isAdmin}
              onReset={() => setResettingShift(SHIFT_CONFIGS[2])}
            />
          </div>
        </div>
      </Card>

      <Dialog open={!!confirmingShift} onOpenChange={(open) => !open && setConfirmingShift(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận {confirmingShift?.label.toLowerCase()} ký tên</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Thao tác này sẽ khóa tên người ký và toàn bộ thông số trong các khung giờ của {confirmingShift?.label.toLowerCase()}.
              Sau khi xác nhận sẽ không mở khóa được.
            </p>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
              Vui lòng kiểm tra kỹ trước khi xác nhận.
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div><b>Người ký:</b> {confirmingShiftSigner || "Chưa nhập"}</div>
              <div><b>Khung giờ:</b> {confirmingShift?.hours.join(", ")}</div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmingShift(null)} disabled={saveMutation.isPending}>
              Hủy
            </Button>
            <Button
              type="button"
              onClick={() => confirmingShift && saveRecord(confirmingShift.key)}
              disabled={!confirmingShift || saveMutation.isPending || !canSave}
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Xác nhận khóa {confirmingShift?.label.toLowerCase()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resettingShift} onOpenChange={(open) => !open && setResettingShift(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset ký tên {resettingShift?.label.toLowerCase()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Thao tác dành cho quản trị viên sẽ xóa tên người ký và trạng thái xác nhận của ca này.</p>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
              Các thông số hiện tại vẫn được giữ nguyên, nhưng toàn bộ ô thuộc khung giờ {resettingShift?.hours.join(", ")} sẽ được mở khóa để người dùng chỉnh sửa và ký lại.
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResettingShift(null)} disabled={resetMutation.isPending}>Hủy</Button>
            <Button type="button" variant="destructive" onClick={resetSignature} disabled={!resettingShift || resetMutation.isPending}>
              {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Xác nhận reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShiftConfirm({
  label,
  hours,
  confirmedAt,
  disabled,
  onConfirm,
  canReset,
  onReset,
}: {
  label: string;
  hours: string;
  confirmedAt?: string | null;
  disabled: boolean;
  onConfirm: () => void;
  canReset: boolean;
  onReset: () => void;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
      <div className="mb-2 text-[11px] text-muted-foreground">Khung giờ: {hours}</div>
      {confirmedAt ? (
        <div className="flex min-h-8 items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Đã xác nhận: {formatConfirmTime(confirmedAt)}
          </div>
          {canReset ? (
            <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 px-2 text-amber-700 hover:bg-amber-100 hover:text-amber-900" disabled={disabled} onClick={onReset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          ) : null}
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" className="h-8 w-full" disabled={disabled} onClick={onConfirm}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          {label} ký tên
        </Button>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold text-slate-800">{value}</div>
    </div>
  );
}
