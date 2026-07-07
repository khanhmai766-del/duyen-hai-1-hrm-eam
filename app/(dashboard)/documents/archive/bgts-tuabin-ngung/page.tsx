"use client";

import * as React from "react";
import { ArrowLeft, CalendarDays, FileSpreadsheet, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createEmptyBgtsRows,
  mergeBgtsRows,
  type BgtsTuabinNgungRow,
  useBgtsTuabinNgung,
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

export default function BgtsTuabinNgungPage() {
  const [unit, setUnit] = React.useState("S1");
  const [date, setDate] = React.useState(todayString());
  const [rows, setRows] = React.useState<BgtsTuabinNgungRow[]>(() => createEmptyBgtsRows());
  const [dayShiftSigner, setDayShiftSigner] = React.useState("");
  const [middleShiftSigner, setMiddleShiftSigner] = React.useState("");
  const [nightShiftSigner, setNightShiftSigner] = React.useState("");

  const query = useBgtsTuabinNgung(unit, date);
  const saveMutation = useSaveBgtsTuabinNgung();
  const rbac = useRbacAccess();
  const canSave = rbac.can("archive-grid-separation", ["create", "manage", "full"]);

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

  function updateCell(rowIndex: number, field: BgtsTuabinNgungFieldKey, value: string) {
    setRows((current) =>
      current.map((row, index) => (index === rowIndex ? { ...row, [field]: normalizeNumberInput(value) } : row))
    );
  }

  async function saveRecord() {
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
        rows,
      });
      toast.success("Đã lưu BGTS Tuabin ngừng");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể lưu BGTS Tuabin ngừng");
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
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button type="button" variant="outline" onClick={exportExcel} disabled={query.isLoading}>
              <FileSpreadsheet className="h-4 w-4" />
              Xuất Excel
            </Button>
            <Button type="button" onClick={saveRecord} disabled={saveMutation.isPending || query.isLoading || !canSave}>
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
                      disabled={!canSave}
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
            <Label>Ca ngày ký tên</Label>
            <Input value={dayShiftSigner} onChange={(event) => setDayShiftSigner(event.target.value)} disabled={!canSave} placeholder="Nhập tên người ký ca ngày" />
          </div>
          <div className="space-y-2">
            <Label>Ca giữa ký tên</Label>
            <Input value={middleShiftSigner} onChange={(event) => setMiddleShiftSigner(event.target.value)} disabled={!canSave} placeholder="Nhập tên người ký ca giữa" />
          </div>
          <div className="space-y-2">
            <Label>Ca đêm ký tên</Label>
            <Input value={nightShiftSigner} onChange={(event) => setNightShiftSigner(event.target.value)} disabled={!canSave} placeholder="Nhập tên người ký ca đêm" />
          </div>
        </div>
      </Card>
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
