"use client";
import { MonthField } from "./ui/month-field";
import { Droplets, FlaskConical, Gauge, RefreshCw, TriangleAlert, Zap } from "lucide-react";
import { downloadCtktktFile } from "@/hooks/useKtktReport";
import { keepPreviousData } from "@tanstack/react-query";
import {
  useDeleteWaterLeader, useDeleteWaterShift, useImportWaterWorkbook, useSaveWaterLeader, useSaveWaterShift,
  useScanWaterWorkbook, useWaterLeaders, useWaterReportMonth, type WaterSheetScan,
} from "@/hooks/useKtktWaterReport";

import { useMemo, useRef, useState } from "react";
import "./water-report-table.css";
import { useSessionUser } from "@/modules/ctktkt/components/session-context";
import { isAdminUser } from "@/modules/ctktkt/lib/auth/session";
import { formatIsoToDmy, roundTo, type MonthlyWaterSummary, type WaterShiftLog } from "@/modules/ctktkt/lib/water-report/calculations";
import { canEditAnyWaterField, canEditWaterField, canDeleteWaterShift } from "@/modules/ctktkt/lib/water-report/permissions";
import { DEFAULT_SHIFT_LEADERS, SHIFT_TEAMS, SHIFT_TIMES } from "@/modules/ctktkt/lib/water-report/schema";
import { defaultOperatingDate } from "@/modules/ctktkt/lib/operating-date";
import {waterMeterUsage,type WaterAdjustmentField} from "@/modules/ctktkt/lib/water-report/adjustments";
import { MissingDataAlert, type MissingDataItem } from "@/modules/ctktkt/components/missing-data-alert";
import { ExportMissingDialog } from "@/modules/ctktkt/components/export-missing-dialog";
import { listMissingWaterShifts } from "@/modules/ctktkt/lib/data-completeness";

function getCurrentMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function shiftMonth(current: string, delta: number): string {
  const [yearStr, monthStr] = current.split("-");
  const date = new Date(Number(yearStr), Number(monthStr) - 1 + delta, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatNum(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return "—";
  if (val === 0) return "0";
  return val.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatRatio(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val) || val === 0) return "—";
  return val.toFixed(4);
}

/** Tên hiệu chỉnh công tơ để báo giá trị hỏng (khớp WATER_ADJUSTMENT_FIELDS). */
const ADJUSTMENT_LABELS: Record<string, string> = {
  waterAdjustmentS1: "Hiệu chỉnh nước nhận S1", waterAdjustmentS2: "Hiệu chỉnh nước nhận S2",
  condenserAdjustmentS1: "Hiệu chỉnh bình ngưng S1", condenserAdjustmentS2: "Hiệu chỉnh bình ngưng S2",
};

export function WaterReportClient() {
  const downloadReport=downloadCtktktFile;

  const user = useSessionUser();
  const [month, setMonth] = useState<string>(getCurrentMonth);
  // Đổi tháng: giữ dữ liệu tháng trước trên màn hình tới khi tháng mới về (như bản cũ), nhưng vẫn báo đang tải.
  const monthQuery = useWaterReportMonth(month, { placeholderData: keepPreviousData });
  const shifts = useMemo<WaterShiftLog[]>(() => monthQuery.data?.shifts ?? [], [monthQuery.data]);
  const baseline: WaterShiftLog | null = monthQuery.data?.baseline ?? null;
  const summary: MonthlyWaterSummary | null = monthQuery.data?.summary ?? null;
  const invalidAdjustments = monthQuery.data?.invalidAdjustments ?? [];
  const loading = monthQuery.isPending || monthQuery.isPlaceholderData;
  // Danh sách Trưởng ca: giữ danh sách gần nhất server trả (không nhảy về mặc định khi tháng mới đang tải).
  const [leaders, setLeaders] = useState<string[]>(DEFAULT_SHIFT_LEADERS);
  const serverLeaders = monthQuery.data?.leaders;
  if (Array.isArray(serverLeaders) && serverLeaders.length > 0 && serverLeaders !== leaders && serverLeaders.join("|") !== leaders.join("|")) setLeaders(serverLeaders);
  const [actionError, setError] = useState<string>("");
  const error = actionError || (monthQuery.error instanceof Error ? monthQuery.error.message : "");
  const saveShiftMutation = useSaveWaterShift();
  const deleteShiftMutation = useDeleteWaterShift();
  const saveLeaderMutation = useSaveWaterLeader();
  const deleteLeaderMutation = useDeleteWaterLeader();
  const scanMutation = useScanWaterWorkbook();
  const importMutation = useImportWaterWorkbook();
  const [exportMissingOpen, setExportMissingOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string>("");
  // Điện thoại: mặc định xem dạng thẻ theo ca; vẫn chuyển được sang bảng đầy đủ 21 cột.
  const [mobileView, setMobileView] = useState<"cards" | "table">("cards");

  // Modal thêm/sửa ca
  const [editingShift, setEditingShift] = useState<Partial<WaterShiftLog> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const savingShift = saveShiftMutation.isPending;
  const dirtyShiftFieldsRef = useRef(new Set<keyof WaterShiftLog>());


  // Modal quản lý Trưởng ca (Admin)
  const [isLeaderModalOpen, setIsLeaderModalOpen] = useState(false);
  const [newLeaderName, setNewLeaderName] = useState("");
  const leaderList = useWaterLeaders(isLeaderModalOpen).data ?? [];

  // Modal tải lên file tháng (nhận dữ liệu các tháng trước)
  const [isMonthUploadModalOpen, setIsMonthUploadModalOpen] = useState(false);
  const [monthFile, setMonthFile] = useState<File | null>(null);
  const scanningMonthFile = scanMutation.isPending;
  const uploadingMonthFile = importMutation.isPending;
  const [scannedSheets, setScannedSheets] = useState<WaterSheetScan[]>([]);
  const [selectedSheetsForImport, setSelectedSheetsForImport] = useState<string[]>([]);
  const [importAllSheets, setImportAllSheets] = useState(true);
  const monthFileInputRef = useRef<HTMLInputElement>(null);

  // Quyền thao tác
  const canEditAny = canEditAnyWaterField(user);
  const canEditMeta = canEditWaterField(user, "meta");
  const canEditElec = canEditWaterField(user, "electricity");
  const canEditIntake = canEditWaterField(user, "water_intake");
  const canEditResin = canEditWaterField(user, "resin_water");
  const isAdmin = isAdminUser(user);
  const missingWaterShifts = useMemo(
    () => listMissingWaterShifts(shifts, month, defaultOperatingDate()),
    [shifts, month],
  );

  function requestWaterExport() {
    if (loading) return;
    if (missingWaterShifts.length) {
      setExportMissingOpen(true);
      return;
    }
    void downloadReport(`/api/ctktkt/water-report/export?month=${month}`).catch(error=>setError(error instanceof Error?error.message:"Không tải được báo cáo."));
  }

  function continueWaterExport() {
    setExportMissingOpen(false);
    void downloadReport(`/api/ctktkt/water-report/export?month=${month}`).catch(error=>setError(error instanceof Error?error.message:"Không tải được báo cáo."));
  }

  function goToMissingWaterShift(item: MissingDataItem) {
    const [logDate, shiftTime] = item.key.split(":") as [string, "06h00" | "14h00" | "22h00"];
    setExportMissingOpen(false);
    setMonth(logDate.slice(0, 7));
    handleOpenAddModal({ logDate, shiftTime });
  }

  // Đổi tháng thì bỏ thông báo lỗi thao tác cũ (giữ đúng hành vi trước khi chuyển sang TanStack Query).
  const [trackedMonth, setTrackedMonth] = useState(month);
  if (trackedMonth !== month) {
    setTrackedMonth(month);
    setError("");
  }

  // Thông báo tạm thời
  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 4000);
  }

  // Mở modal thêm ca mới (tự động gợi ý tiếp theo từ ca trước)
  function handleOpenAddModal(prefill?: { logDate: string; shiftTime: "06h00" | "14h00" | "22h00" }) {
    const lastShift = shifts.length > 0 ? shifts[shifts.length - 1] : baseline;
    let nextDate = defaultOperatingDate();
    let nextTime: "06h00" | "14h00" | "22h00" = "06h00";
    let nextTeam = "A";

    if (lastShift) {
      if (lastShift.shiftTime === "06h00") {
        nextDate = lastShift.logDate;
        nextTime = "14h00";
      } else if (lastShift.shiftTime === "14h00") {
        nextDate = lastShift.logDate;
        nextTime = "22h00";
      } else if (lastShift.shiftTime === "22h00") {
        // Qua ngày tiếp theo
        const d = new Date(lastShift.logDate);
        d.setDate(d.getDate() + 1);
        nextDate = d.toISOString().slice(0, 10);
        nextTime = "06h00";
      }

      // Xoay vòng kíp A -> B -> C -> D -> E -> F
      const teamIdx = SHIFT_TEAMS.indexOf(lastShift.shiftTeam as (typeof SHIFT_TEAMS)[number]);
      if (teamIdx >= 0) {
        nextTeam = SHIFT_TEAMS[(teamIdx + 1) % SHIFT_TEAMS.length];
      }
    }

    dirtyShiftFieldsRef.current.clear();
    setEditingShift({
      logDate: prefill?.logDate || nextDate,
      shiftTime: prefill?.shiftTime || nextTime,
      shiftTeam: nextTeam,
      shiftLeader: leaders[0] || "Việt",
      elecRecS1: lastShift?.elecRecS1 || 0,
      elecRecS2: lastShift?.elecRecS2 || 0,
      waterRecS1: lastShift?.waterRecS1 || 0,
      waterRecS2: lastShift?.waterRecS2 || 0,
      condenserRecS1: lastShift?.condenserRecS1 || 0,
      condenserRecS2: lastShift?.condenserRecS2 || 0,
      resinWaterS1_24h: 0,
      resinWaterS2_24h: 0,
      note: "",
    });
    setIsModalOpen(true);
  }

  // Mở modal sửa ca đã chọn
  function handleOpenEditModal(shift: WaterShiftLog) {
    dirtyShiftFieldsRef.current.clear();
    setEditingShift({ ...shift });
    setIsModalOpen(true);
  }

  function updateEditingShift<K extends keyof WaterShiftLog>(field: K, value: WaterShiftLog[K]) {
    dirtyShiftFieldsRef.current.add(field);
    setEditingShift(current => current ? { ...current, [field]: value } : current);
  }

  // Tìm ca trước ca đang sửa để tính toán thử
  const editingLogDate = editingShift?.logDate;
  const editingShiftTime = editingShift?.shiftTime;
  const prevShiftForEditing = useMemo(() => {
    if (!editingLogDate || !editingShiftTime) return null;
    const all = baseline ? [baseline, ...shifts] : shifts;
    const sorted = [...all].sort((a, b) => {
      const orderA = a.shiftTime === "06h00" ? 1 : a.shiftTime === "14h00" ? 2 : 3;
      const orderB = b.shiftTime === "06h00" ? 1 : b.shiftTime === "14h00" ? 2 : 3;
      return `${a.logDate}_${orderA}`.localeCompare(`${b.logDate}_${orderB}`);
    });
    const currOrder = editingShiftTime === "06h00" ? 1 : editingShiftTime === "14h00" ? 2 : 3;
    const currKey = `${editingLogDate}_${currOrder}`;

    let foundPrev: WaterShiftLog | null = null;
    for (const item of sorted) {
      const itemOrder = item.shiftTime === "06h00" ? 1 : item.shiftTime === "14h00" ? 2 : 3;
      const key = `${item.logDate}_${itemOrder}`;
      if (key < currKey) {
        foundPrev = item;
      } else {
        break;
      }
    }
    return foundPrev;
  }, [editingLogDate, editingShiftTime, shifts, baseline]);

  // Tính toán thử cho form
  const previewCalculations = useMemo(() => {
    if (!editingShift) return null;
    const prev = prevShiftForEditing;
    const elecRecS1 = Number(editingShift.elecRecS1 || 0);
    const elecRecS2 = Number(editingShift.elecRecS2 || 0);
    const waterRecS1 = Number(editingShift.waterRecS1 || 0);
    const waterRecS2 = Number(editingShift.waterRecS2 || 0);
    const condenserRecS1 = Number(editingShift.condenserRecS1 || 0);
    const condenserRecS2 = Number(editingShift.condenserRecS2 || 0);

    const prevElec1 = prev?.elecRecS1 || 0;
    const prevElec2 = prev?.elecRecS2 || 0;
    const prevWater1 = prev?.waterRecS1 || 0;
    const prevWater2 = prev?.waterRecS2 || 0;
    const prevCondenser1 = prev?.condenserRecS1 || 0;
    const prevCondenser2 = prev?.condenserRecS2 || 0;

    const elecGen1 = prevElec1 > 0 && elecRecS1 > 0 ? roundTo(elecRecS1 - prevElec1, 2) : 0;
    const elecGen2 = prevElec2 > 0 && elecRecS2 > 0 ? roundTo(elecRecS2 - prevElec2, 2) : 0;
    const waterUsed1 = waterMeterUsage(waterRecS1,prevWater1,editingShift.waterAdjustmentS1,25000);
    const waterUsed2 = waterMeterUsage(waterRecS2,prevWater2,editingShift.waterAdjustmentS2,25000);
    const ratio1 = elecGen1 > 0 ? roundTo(waterUsed1 / elecGen1, 4) : 0;
    const ratio2 = elecGen2 > 0 ? roundTo(waterUsed2 / elecGen2, 4) : 0;
    const condUsed1 = waterMeterUsage(condenserRecS1,prevCondenser1,editingShift.condenserAdjustmentS1);
    const condUsed2 = waterMeterUsage(condenserRecS2,prevCondenser2,editingShift.condenserAdjustmentS2);

    return { elecGen1, elecGen2, waterUsed1, waterUsed2, ratio1, ratio2, condUsed1, condUsed2 };
  }, [editingShift, prevShiftForEditing]);

  // Lưu ca từ modal
  async function handleSaveShift(e: React.FormEvent) {
    e.preventDefault();
    if (!editingShift) return;
    if (editingShift.id && dirtyShiftFieldsRef.current.size === 0) {
      setError("Không có ô dữ liệu nào vừa thay đổi để lưu.");
      return;
    }
    try {
      await saveShiftMutation.mutateAsync({
        shift: editingShift,
        changedFields: editingShift.id ? [...dirtyShiftFieldsRef.current] : undefined,
      });

      showSuccess(`Đã lưu thành công ca ${editingShift.shiftTime} ngày ${formatIsoToDmy(editingShift.logDate || "")}`);
      setIsModalOpen(false);
      setEditingShift(null);
      dirtyShiftFieldsRef.current.clear();
      // Ca thuộc tháng khác thì chuyển sang tháng đó; tháng đang xem tự làm mới (invalidateQueries).
      if (editingShift.logDate && !editingShift.logDate.startsWith(month)) {
        setMonth(editingShift.logDate.slice(0, 7));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi khi lưu ca.");
    }
  }

  // Xóa ca
  async function handleDeleteShift(shift: WaterShiftLog) {
    if (!canDeleteWaterShift(user)) return;
    if (!confirm(`Bạn có chắc muốn xoá ca ${shift.shiftTime} ngày ${formatIsoToDmy(shift.logDate)} không?`)) {
      return;
    }
    try {
      await deleteShiftMutation.mutateAsync(shift);
      showSuccess(`Đã xoá ca ${shift.shiftTime} ngày ${formatIsoToDmy(shift.logDate)}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi khi xoá ca.");
    }
  }

  // Thêm Trưởng ca mới
  async function handleAddLeader(e: React.FormEvent) {
    e.preventDefault();
    if (!newLeaderName.trim()) return;
    try {
      await saveLeaderMutation.mutateAsync({ name: newLeaderName.trim(), displayOrder: leaderList.length + 1 });
      setNewLeaderName("");
      showSuccess(`Đã thêm Trưởng ca: ${newLeaderName.trim()}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi thêm Trưởng ca.");
    }
  }

  // Xóa Trưởng ca
  async function handleDeleteLeader(id: number, name: string) {
    if (!confirm(`Xoá Trưởng ca "${name}" khỏi danh sách?`)) return;
    try {
      await deleteLeaderMutation.mutateAsync(id);
      showSuccess(`Đã xoá Trưởng ca: ${name}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi xoá Trưởng ca.");
    }
  }

  // Quét cấu trúc các tháng trong file Excel tải lên
  async function handleMonthFileSelected(file: File) {
    setMonthFile(file);
    setScannedSheets([]);
    setSelectedSheetsForImport([]);
    try {
      const data = await scanMutation.mutateAsync(file);
      const sheets = data.sheets || [];
      setScannedSheets(sheets);
      setSelectedSheetsForImport(sheets.map(s => s.sheetName));
      setImportAllSheets(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi khi quét file Excel.");
    }
  }

  // Thực hiện nạp các tháng đã chọn từ file vào hệ thống
  async function handleExecuteMonthImport() {
    if (!monthFile) return;
    try {
      const data = await importMutation.mutateAsync({
        file: monthFile,
        sheetNames: !importAllSheets && selectedSheetsForImport.length > 0 ? selectedSheetsForImport : undefined,
      });

      showSuccess(data.message || `Đã nạp thành công ${data.totalShifts || 0} ca trực vào hệ thống!`);
      setIsMonthUploadModalOpen(false);
      setMonthFile(null);
      setScannedSheets([]);

      // Chuyển sang tháng mới nhất vừa nạp nếu có
      if (data.months && data.months.length > 0) {
        const latest = data.months[data.months.length - 1];
        setMonth(latest);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi khi nạp dữ liệu các tháng.");
    }
  }



  return (
    <div className="module-report space-y-3">
      <ExportMissingDialog
        open={exportMissingOpen}
        items={missingWaterShifts}
        title={`Theo dõi lượng nước tháng ${month.slice(5, 7)}/${month.slice(0, 4)}`}
        onClose={() => setExportMissingOpen(false)}
        onItemClick={goToMissingWaterShift}
        onFillMissing={() => { setExportMissingOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        onExportAnyway={continueWaterExport}
      />
      <MissingDataAlert items={missingWaterShifts} loading={loading} scope={`theo dõi nước tháng ${month.slice(5, 7)}/${month.slice(0, 4)}`} />
      {/* 1. Header & Điều khiển tháng */}
      <div className="module-hero ktkt-dark-hero flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 shadow-sm">
        <div className="module-heading-copy">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl">💧</span>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-800">
              BẢNG THEO DÕI LƯỢNG NƯỚC SỬ DỤNG
            </h1>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
              Phân xưởng Vận hành 1
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Theo dõi chi tiết lượng nước bổ sung, nước cấp bình ngưng và hệ số tiêu thụ nước theo từng ca trực (S1, S2)
          </p>
        </div>

        {/* Nút thao tác & Chọn tháng */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Chuyển tháng */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-inner">
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, -1))}
              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white text-slate-600 font-bold"
              title="Tháng trước"
            >
              ◀
            </button>
            <MonthField
              value={month}
              onChange={e => e.target.value && setMonth(e.target.value)}
              className="h-8 bg-transparent px-2 text-center text-xs font-bold text-slate-800 outline-none"
            />
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, 1))}
              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white text-slate-600 font-bold"
              title="Tháng sau"
            >
              ▶
            </button>
          </div>

          {/* Thêm ca trực */}
          <button
            type="button"
            disabled={!canEditAny}
            onClick={() => handleOpenAddModal()}
            className={`flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:opacity-95 ${
              !canEditAny ? "cursor-not-allowed opacity-50" : ""
            }`}
            title={canEditAny ? "Nhập ca trực mới" : "Bạn không có quyền nhập liệu"}
          >
            <span>+</span>
            <span>Thêm ca trực</span>
          </button>

          {/* Up file tháng (nhận dữ liệu các tháng trước) */}
          <button
            type="button"
            disabled={!canEditAny}
            onClick={() => {
              setMonthFile(null);
              setScannedSheets([]);
              setSelectedSheetsForImport([]);
              setIsMonthUploadModalOpen(true);
            }}
            className={`flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3.5 py-2 text-xs font-bold text-sky-800 shadow-sm hover:bg-sky-100 transition ${
              !canEditAny ? "cursor-not-allowed opacity-50" : ""
            }`}
            title="Tải lên file Excel tháng để nhận dữ liệu các tháng trước (2024–2026)"
          >
            <span>📤</span>
            <span>Up file tháng</span>
          </button>


          {/* Xuất Excel */}
          <button
            type="button"
            onClick={requestWaterExport}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-100"
            title="Tải file Excel đúng chuẩn 20 cột của Phân xưởng"
          >
            <span>⬇</span>
            <span>Xuất Excel</span>
          </button>

          {/* Quản lý Trưởng ca (Admin) */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setIsLeaderModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 shadow-sm hover:bg-indigo-100"
              title="Quản lý danh sách Trưởng ca"
            >
              <span>⚙</span>
              <span>Trưởng ca</span>
            </button>
          )}
        </div>
      </div>

      {/* Thông báo thành công / lỗi */}
      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 shadow-sm">
          ✓ {successMsg}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800 shadow-sm">
          ⚠ {error}
        </div>
      )}
      {invalidAdjustments.length > 0 && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 shadow-sm">
          <p className="font-bold">⚠ Có hiệu chỉnh công tơ không hợp lệ — đã bỏ qua khi tính lượng nước dùng:</p>
          <ul className="mt-1 list-disc pl-5">
            {invalidAdjustments.map(item => (
              <li key={`${item.logDate}-${item.shiftTime}-${item.field}`}>
                Ca {item.shiftTime} ngày {item.logDate.split("-").reverse().join("/")} · {ADJUSTMENT_LABELS[item.field] ?? item.field}: {String(item.value)}
              </li>
            ))}
          </ul>
          <p className="mt-1">Mở ca đó, nhập lại hiệu chỉnh đúng (từ 0 m³) hoặc để trống rồi lưu.</p>
        </div>
      )}

      {/* 2. Thẻ KPI Tổng hợp tháng */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {/* Thẻ 1: Tổng điện phát */}
          <div className="rounded-2xl !rounded-[13px] border border-t-[3px] border-slate-200 bg-white p-3.5 shadow-sm">
            <p className="flex min-h-[2.8em] items-start gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400"><Zap className="mt-px size-3.5 shrink-0 text-slate-500" aria-hidden />Điện phát trong tháng</p>
            <p className="mt-1 font-mono text-lg font-extrabold text-slate-800">
              {formatNum(summary.totalElecGenPlant)} <span className="text-xs font-normal text-slate-500">MW</span>
            </p>
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-1.5 text-[11px] text-slate-500">
              <span>S1: <strong className="font-mono text-slate-700">{formatNum(summary.totalElecGenS1)}</strong></span>
              <span>S2: <strong className="font-mono text-slate-700">{formatNum(summary.totalElecGenS2)}</strong></span>
            </div>
          </div>

          {/* Thẻ 2: Tổng nước bổ sung */}
          <div className="rounded-2xl !rounded-[13px] border border-t-[3px] border-slate-200 bg-white p-3.5 shadow-sm">
            <p className="flex min-h-[2.8em] items-start gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400"><Droplets className="mt-px size-3.5 shrink-0 text-sky-600" aria-hidden />Nước bổ sung sử dụng</p>
            <p className="mt-1 font-mono text-lg font-extrabold text-sky-700">
              {formatNum(summary.totalWaterUsedPlant)} <span className="text-xs font-normal text-slate-500">m³</span>
            </p>
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-1.5 text-[11px] text-slate-500">
              <span>S1: <strong className="font-mono text-slate-700">{formatNum(summary.totalWaterUsedS1)}</strong></span>
              <span>S2: <strong className="font-mono text-slate-700">{formatNum(summary.totalWaterUsedS2)}</strong></span>
            </div>
          </div>

          {/* Thẻ 3: Hệ số nước TB */}
          <div className="rounded-2xl !rounded-[13px] border border-t-[3px] border-slate-200 bg-white p-3.5 shadow-sm">
            <p className="flex min-h-[2.8em] items-start gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400"><Gauge className="mt-px size-3.5 shrink-0 text-emerald-600" aria-hidden />Hệ số nước TB tháng</p>
            <p className="mt-1 font-mono text-lg font-extrabold text-emerald-700">
              {formatRatio(summary.avgWaterRatioPlant)} <span className="text-[10px] font-normal text-slate-500">m³/MWh</span>
            </p>
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-1.5 text-[11px] text-slate-500">
              <span>S1: <strong className="font-mono text-slate-700">{formatRatio(summary.avgWaterRatioS1)}</strong></span>
              <span>S2: <strong className="font-mono text-slate-700">{formatRatio(summary.avgWaterRatioS2)}</strong></span>
            </div>
          </div>

          {/* Thẻ 4: Nước cấp bình ngưng */}
          <div className="rounded-2xl !rounded-[13px] border border-t-[3px] border-slate-200 bg-white p-3.5 shadow-sm">
            <p className="flex min-h-[2.8em] items-start gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400"><RefreshCw className="mt-px size-3.5 shrink-0 text-indigo-600" aria-hidden />Nước cấp bình ngưng</p>
            <p className="mt-1 font-mono text-lg font-extrabold text-indigo-700">
              {formatNum(summary.totalCondenserUsedS1 + summary.totalCondenserUsedS2)} <span className="text-xs font-normal text-slate-500">m³</span>
            </p>
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-1.5 text-[11px] text-slate-500">
              <span>S1: <strong className="font-mono text-slate-700">{formatNum(summary.totalCondenserUsedS1)}</strong></span>
              <span>S2: <strong className="font-mono text-slate-700">{formatNum(summary.totalCondenserUsedS2)}</strong></span>
            </div>
          </div>

          {/* Thẻ 5: Tái sinh hạt */}
          <div className="col-span-2 rounded-2xl !rounded-[13px] border border-t-[3px] border-slate-200 bg-white p-3.5 shadow-sm sm:col-span-1">
            <p className="flex min-h-[2.8em] items-start gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400"><FlaskConical className="mt-px size-3.5 shrink-0 text-amber-600" aria-hidden />Tái sinh hạt (24h)</p>
            <p className="mt-1 font-mono text-lg font-extrabold text-amber-700">
              {formatNum(summary.totalResinWaterS1 + summary.totalResinWaterS2)} <span className="text-xs font-normal text-slate-500">m³</span>
            </p>
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-1.5 text-[11px] text-slate-500">
              <span>S1: <strong className="font-mono text-slate-700">{formatNum(summary.totalResinWaterS1)}</strong></span>
              <span>S2: <strong className="font-mono text-slate-700">{formatNum(summary.totalResinWaterS2)}</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* Thông báo liên kết công tơ nước 24h DCS với Báo cáo Chỉ tiêu KTKT */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50/80 p-3 text-xs text-emerald-900 shadow-xs">
        <div className="flex items-center gap-2">
          <Droplets className="size-4 shrink-0 text-emerald-700" aria-hidden />
          <div>
            <strong className="font-bold">Công tơ nước demin mốc 24h (S1, S2) &amp; Hiệu chỉnh:</strong> Đã chuyển sang nhập và quản lý tại{" "}
            <a href="/tien-ich/chi-tieu-ktkt/ctktkt-report" className="ktkt-inline-link font-bold underline decoration-emerald-600 hover:text-emerald-950">
              Báo cáo Chỉ tiêu KTKT (nhóm TKĐ DCS, Hàng 72–74)
            </a>
            . Số liệu lượng nước tái sinh hạt nhập tại đây sẽ tự động link sang CTKTKT.
          </div>
        </div>
        <a
          href="/tien-ich/chi-tieu-ktkt/ctktkt-report"
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 font-bold text-white text-[11px] shadow-xs hover:bg-emerald-800 transition-colors"
        >
          <span>Mở Chỉ tiêu KTKT</span>
          <span>↗</span>
        </a>
      </div>

      {/* 3. Bảng dữ liệu theo dõi lượng nước (20 cột gốc chuẩn Nhà máy) */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Thanh ghi chú phân quyền */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-600">Quyền nhập liệu của bạn:</span>
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${canEditElec ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-500"}`}>
              {canEditElec ? "✓" : "✗"} Công tơ điện
            </span>
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${canEditIntake ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-500"}`}>
              {canEditIntake ? "✓" : "✗"} Số nước & Bình ngưng
            </span>
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${canEditResin ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-500"}`}>
              {canEditResin ? "✓" : "✗"} Tái sinh hạt
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-block h-3 w-3 border border-[#c6e3d0] bg-[#e7f5ec] shadow-[inset_0_3px_0_#00b050]"></span>
            <span>Tiêu đề chuẩn gốc</span>
            <span className="ml-2 inline-block h-3 w-3 rounded bg-sky-50 border border-sky-200"></span>
            <span>Cột tự động tính</span>
            <span className="ml-2 inline-flex items-center gap-1 rounded bg-rose-50 px-1 font-semibold text-rose-700"><TriangleAlert className="size-3" aria-hidden />0.0870</span>
            <span>Hệ số vượt 0,08 m³/MWh</span>
          </div>
        </div>

        {/* Điện thoại: chọn dạng thẻ hoặc bảng (máy tính luôn hiện bảng) */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 md:hidden">
          <span className="text-xs font-semibold text-slate-600">{shifts.length} ca trong tháng</span>
          <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs" role="group" aria-label="Cách xem số liệu">
            {(["cards", "table"] as const).map(view => (
              <button key={view} type="button" aria-pressed={mobileView === view} onClick={() => setMobileView(view)}
                className={`min-h-10 whitespace-nowrap rounded-md px-3 font-semibold ${mobileView === view ? "bg-white text-emerald-800 shadow-sm" : "text-slate-500"}`}>
                {view === "cards" ? "Dạng thẻ" : "Dạng bảng"}
              </button>
            ))}
          </div>
        </div>
        {mobileView === "cards" && (
          <WaterShiftCards shifts={shifts} loading={loading} month={month} canEdit={canEditAny} canDelete={canDeleteWaterShift(user)}
            onEdit={handleOpenEditModal} onDelete={handleDeleteShift} />
        )}

        {/* Khung cuộn bảng */}
        <div className={`module-table-scroll water-table-scroll overflow-x-auto max-h-[70vh]${mobileView === "cards" ? " max-md:hidden" : ""}`}>
          <table className="w-full min-w-[1250px] border-collapse text-[11px] text-slate-800 select-text">
            {/* Header 2 tầng: Nền xanh lá #00B050 chuẩn file gốc */}
            <thead className="sticky top-0 z-20 bg-[#00b050] text-black font-extrabold shadow-sm">
              {/* Tầng 1: Nhóm cột */}
              <tr className="border-b border-[#009242] divide-x divide-[#009242]">
                <th rowSpan={2} className="px-2 py-2 text-center whitespace-nowrap min-w-[76px]">
                  NGÀY
                </th>
                <th rowSpan={2} className="px-1.5 py-2 text-center whitespace-nowrap min-w-[56px]">
                  THỜI GIAN
                </th>
                <th rowSpan={2} className="px-1 py-2 text-center whitespace-nowrap min-w-[36px]">
                  Kíp
                </th>
                <th rowSpan={2} className="px-2 py-2 text-center whitespace-nowrap min-w-[68px]">
                  Trưởng Ca
                </th>

                {/* Công tơ điện nhận ca */}
                <th colSpan={2} className="px-2 py-1 text-center whitespace-nowrap min-w-[150px]">
                  CÔNG TƠ ĐIỆN NHẬN CA
                </th>

                {/* Sản lượng điện đã phát trong ca */}
                <th colSpan={2} className="px-2 py-1 text-center whitespace-nowrap min-w-[140px] bg-[#00a34a]">
                  ĐIỆN PHÁT TRONG CA (MW)
                </th>

                {/* Số nước nhận ca */}
                <th colSpan={2} className="px-2 py-1 text-center whitespace-nowrap min-w-[140px]">
                  SỐ NƯỚC NHẬN CA (m³)
                </th>

                {/* Lượng nước bổ sung sử dụng trong ca */}
                <th colSpan={2} className="px-2 py-1 text-center whitespace-nowrap min-w-[140px] bg-[#00a34a]">
                  NƯỚC BỔ SUNG (m³)
                </th>

                {/* Hệ số (Nước / Công suất) */}
                <th colSpan={2} className="px-2 py-1 text-center whitespace-nowrap min-w-[130px] bg-[#009744]">
                  HỆ SỐ (m³/MWh)
                </th>

                {/* Nước cấp vào bình ngưng */}
                <th colSpan={2} className="px-2 py-1 text-center whitespace-nowrap min-w-[150px]">
                  NƯỚC CẤP BÌNH NGƯNG (m³)
                </th>

                {/* Lượng nước cấp vào bình ngưng */}
                <th colSpan={2} className="px-2 py-1 text-center whitespace-nowrap min-w-[150px] bg-[#00a34a]">
                  LƯỢNG NƯỚC BÌNH NGƯNG (m³)
                </th>

                {/* Lượng nước tái sinh hạt 24h */}
                <th colSpan={2} className="px-2 py-1 text-center whitespace-nowrap min-w-[140px]">
                  TÁI SINH HẠT (24h)
                </th>

                <th rowSpan={2} className="px-2 py-2 text-center whitespace-nowrap min-w-[65px]">
                  Thao tác
                </th>
              </tr>

              {/* Tầng 2: S1, S2 */}
              <tr className="border-b border-[#009242] divide-x divide-[#009242] text-[10px]">
                {/* Điện nhận S1, S2 */}
                <th className="px-1.5 py-1 text-center min-w-[75px]">S1</th>
                <th className="px-1.5 py-1 text-center min-w-[75px]">S2</th>

                {/* Điện phát S1, S2 */}
                <th className="px-1.5 py-1 text-center min-w-[70px] bg-[#00a34a]">S1</th>
                <th className="px-1.5 py-1 text-center min-w-[70px] bg-[#00a34a]">S2</th>

                {/* Nước nhận S1, S2 */}
                <th className="px-1.5 py-1 text-center min-w-[70px]">S1</th>
                <th className="px-1.5 py-1 text-center min-w-[70px]">S2</th>

                {/* Nước bổ sung S1, S2 */}
                <th className="px-1.5 py-1 text-center min-w-[70px] bg-[#00a34a]">S1</th>
                <th className="px-1.5 py-1 text-center min-w-[70px] bg-[#00a34a]">S2</th>

                {/* Hệ số S1, S2 */}
                <th className="px-1.5 py-1 text-center min-w-[65px] bg-[#009744]">S1</th>
                <th className="px-1.5 py-1 text-center min-w-[65px] bg-[#009744]">S2</th>

                {/* Bình ngưng nhận S1, S2 */}
                <th className="px-1.5 py-1 text-center min-w-[75px]">S1</th>
                <th className="px-1.5 py-1 text-center min-w-[75px]">S2</th>

                {/* Lượng nước bình ngưng S1, S2 */}
                <th className="px-1.5 py-1 text-center min-w-[75px] bg-[#00a34a]">S1</th>
                <th className="px-1.5 py-1 text-center min-w-[75px] bg-[#00a34a]">S2</th>

                {/* Tái sinh hạt S1, S2 */}
                <th className="px-1.5 py-1 text-center min-w-[70px]">S1</th>
                <th className="px-1.5 py-1 text-center min-w-[70px]">S2</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={21} className="py-12 text-center text-slate-400">
                    Đang tải dữ liệu theo dõi lượng nước...
                  </td>
                </tr>
              ) : shifts.length === 0 && !baseline ? (
                <tr>
                  <td colSpan={21} className="py-12 text-center text-slate-400">
                    Chưa có ca trực nào trong tháng {month}. Hãy nhấn{" "}
                    <strong className="text-emerald-700">&ldquo;+ Thêm ca trực&rdquo;</strong> hoặc{" "}
                    <strong className="text-slate-700">&ldquo;Nạp từ Excel&rdquo;</strong> để bắt đầu.
                  </td>
                </tr>
              ) : (
                <>
                  {/* Dòng Mốc cuối tháng trước (Baseline) nếu có */}
                  {baseline && (
                    <tr className="water-baseline-row bg-slate-100/70 text-slate-500 divide-x divide-slate-200 text-[10.5px]">
                      <td className="px-2 py-1 text-center font-bold" title="Ca mốc tính toán liền trước">
                        {formatIsoToDmy(baseline.logDate)}
                        <span className="block text-[9px] text-slate-400 font-normal">Mốc trước</span>
                      </td>
                      <td className="px-1.5 py-1 text-center font-bold">{baseline.shiftTime}</td>
                      <td className="px-1 py-1 text-center">{baseline.shiftTeam}</td>
                      <td className="px-2 py-1 text-center font-medium">{baseline.shiftLeader}</td>

                      {/* Công tơ điện */}
                      <td className="px-1.5 py-1 text-right font-mono">{formatNum(baseline.elecRecS1, 1)}</td>
                      <td className="px-1.5 py-1 text-right font-mono">{formatNum(baseline.elecRecS2, 1)}</td>

                      {/* Điện phát mốc */}
                      <td className="px-1.5 py-1 text-right font-mono bg-slate-50 text-slate-400">—</td>
                      <td className="px-1.5 py-1 text-right font-mono bg-slate-50 text-slate-400">—</td>

                      {/* Số nước nhận */}
                      <td className="px-1.5 py-1 text-right font-mono">{formatNum(baseline.waterRecS1, 2)}</td>
                      <td className="px-1.5 py-1 text-right font-mono">{formatNum(baseline.waterRecS2, 2)}</td>

                      {/* Nước BS mốc */}
                      <td className="px-1.5 py-1 text-right font-mono bg-slate-50 text-slate-400">—</td>
                      <td className="px-1.5 py-1 text-right font-mono bg-slate-50 text-slate-400">—</td>

                      {/* Hệ số mốc */}
                      <td className="px-1.5 py-1 text-right font-mono bg-slate-50 text-slate-400">—</td>
                      <td className="px-1.5 py-1 text-right font-mono bg-slate-50 text-slate-400">—</td>

                      {/* Bình ngưng nhận */}
                      <td className="px-1.5 py-1 text-right font-mono">{formatNum(baseline.condenserRecS1, 2)}</td>
                      <td className="px-1.5 py-1 text-right font-mono">{formatNum(baseline.condenserRecS2, 2)}</td>

                      {/* Bình ngưng dùng */}
                      <td className="px-1.5 py-1 text-right font-mono bg-slate-50 text-slate-400">—</td>
                      <td className="px-1.5 py-1 text-right font-mono bg-slate-50 text-slate-400">—</td>

                      {/* Tái sinh hạt */}
                      <td className="px-1.5 py-1 text-right font-mono">{formatNum(baseline.resinWaterS1_24h, 0)}</td>
                      <td className="px-1.5 py-1 text-right font-mono">{formatNum(baseline.resinWaterS2_24h, 0)}</td>

                      <td className="px-2 py-1 text-center text-slate-400">—</td>
                    </tr>
                  )}

                  {/* Danh sách các ca trong tháng */}
                  {shifts.map((shift, idx) => {
                    const isHighRatioS1 = shift.waterRatioS1 > 0.08;
                    const isHighRatioS2 = shift.waterRatioS2 > 0.08;
                    // Gom các ca cùng ngày: ngày chỉ hiện ở ca đầu, vạch đậm mở đầu mỗi ngày.
                    const isFirstOfDay = idx === 0 || shifts[idx - 1].logDate !== shift.logDate;

                    return (
                      <tr
                        key={`${shift.logDate}_${shift.shiftTime}_${shift.id || idx}`}
                        className={`hover:bg-amber-50/40 divide-x divide-slate-200 transition-colors${isFirstOfDay ? " water-day-start" : ""}`}
                      >
                        {/* Ngày — ca 2, 3 trong ngày vẫn giữ chữ (để Sao chép ra Excel đủ ngày) nhưng làm trong suốt */}
                        <td className={`px-2 py-1.5 text-center font-bold text-slate-700 whitespace-nowrap${isFirstOfDay ? "" : " water-date-repeat"}`}>
                          {formatIsoToDmy(shift.logDate)}
                        </td>

                        {/* Thời gian */}
                        <td className="px-1.5 py-1.5 text-center font-bold text-slate-700 whitespace-nowrap">
                          <span
                            className={`rounded px-1 py-0.5 text-[10px] ${
                              shift.shiftTime === "06h00"
                                ? "bg-blue-100 text-blue-800"
                                : shift.shiftTime === "14h00"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-purple-100 text-purple-800"
                            }`}
                          >
                            {shift.shiftTime}
                          </span>
                        </td>

                        {/* Kíp */}
                        <td className="px-1 py-1.5 text-center font-extrabold text-slate-800">
                          {shift.shiftTeam}
                        </td>

                        {/* Trưởng Ca */}
                        <td className="px-2 py-1.5 text-center font-semibold text-slate-800 whitespace-nowrap">
                          {shift.shiftLeader}
                        </td>

                        {/* Công tơ điện nhận ca S1 */}
                        <td className="px-1.5 py-1.5 text-right font-mono text-slate-700">
                          {formatNum(shift.elecRecS1, 1)}
                        </td>

                        {/* Công tơ điện nhận ca S2 */}
                        <td className="px-1.5 py-1.5 text-right font-mono text-slate-700">
                          {formatNum(shift.elecRecS2, 1)}
                        </td>

                        {/* Điện phát S1 (Tự động) */}
                        <td className="px-1.5 py-1.5 text-right font-mono bg-sky-50/50 font-bold text-sky-900">
                          {formatNum(shift.elecGenS1, 1)}
                        </td>

                        {/* Điện phát S2 (Tự động) */}
                        <td className="px-1.5 py-1.5 text-right font-mono bg-sky-50/50 font-bold text-sky-900">
                          {formatNum(shift.elecGenS2, 1)}
                        </td>

                        {/* Số nước nhận ca S1 */}
                        <td className="px-1.5 py-1.5 text-right font-mono text-slate-700">
                          {formatNum(shift.waterRecS1, 2)}
                        </td>

                        {/* Số nước nhận ca S2 */}
                        <td className="px-1.5 py-1.5 text-right font-mono text-slate-700">
                          {formatNum(shift.waterRecS2, 2)}
                        </td>

                        {/* Nước bổ sung S1 (Tự động) */}
                        <td className="px-1.5 py-1.5 text-right font-mono bg-sky-50/50 font-bold text-sky-900">
                          {formatNum(shift.waterUsedS1, 2)}
                        </td>

                        {/* Nước bổ sung S2 (Tự động) */}
                        <td className="px-1.5 py-1.5 text-right font-mono bg-sky-50/50 font-bold text-sky-900">
                          {formatNum(shift.waterUsedS2, 2)}
                        </td>

                        {/* Hệ số S1 (Tự động) */}
                        <td
                          className={`px-1.5 py-1.5 text-right font-mono font-extrabold ${
                            isHighRatioS1
                              ? "bg-rose-50 text-rose-700"
                              : "bg-emerald-50/60 text-emerald-800"
                          }`}
                          title={isHighRatioS1 ? "Hệ số tiêu thụ nước cao (>0.08)" : undefined}
                        >
                          {isHighRatioS1 ? (
                            <span className="inline-flex items-center justify-end gap-1">
                              <TriangleAlert className="size-3.5 shrink-0" aria-label="Vượt ngưỡng 0,08" />
                              {formatRatio(shift.waterRatioS1)}
                            </span>
                          ) : formatRatio(shift.waterRatioS1)}
                        </td>

                        {/* Hệ số S2 (Tự động) */}
                        <td
                          className={`px-1.5 py-1.5 text-right font-mono font-extrabold ${
                            isHighRatioS2
                              ? "bg-rose-50 text-rose-700"
                              : "bg-emerald-50/60 text-emerald-800"
                          }`}
                          title={isHighRatioS2 ? "Hệ số tiêu thụ nước cao (>0.08)" : undefined}
                        >
                          {isHighRatioS2 ? (
                            <span className="inline-flex items-center justify-end gap-1">
                              <TriangleAlert className="size-3.5 shrink-0" aria-label="Vượt ngưỡng 0,08" />
                              {formatRatio(shift.waterRatioS2)}
                            </span>
                          ) : formatRatio(shift.waterRatioS2)}
                        </td>

                        {/* Nước cấp bình ngưng S1 */}
                        <td className="px-1.5 py-1.5 text-right font-mono text-slate-700">
                          {formatNum(shift.condenserRecS1, 2)}
                        </td>

                        {/* Nước cấp bình ngưng S2 */}
                        <td className="px-1.5 py-1.5 text-right font-mono text-slate-700">
                          {formatNum(shift.condenserRecS2, 2)}
                        </td>

                        {/* Lượng nước bình ngưng dùng S1 (Tự động) */}
                        <td className="px-1.5 py-1.5 text-right font-mono bg-sky-50/50 font-bold text-sky-900">
                          {formatNum(shift.condenserUsedS1, 2)}
                        </td>

                        {/* Lượng nước bình ngưng dùng S2 (Tự động) */}
                        <td className="px-1.5 py-1.5 text-right font-mono bg-sky-50/50 font-bold text-sky-900">
                          {formatNum(shift.condenserUsedS2, 2)}
                        </td>

                        {/* Tái sinh hạt S1 24h */}
                        <td className="px-1.5 py-1.5 text-right font-mono text-slate-700">
                          {formatNum(shift.resinWaterS1_24h, 0)}
                        </td>

                        {/* Tái sinh hạt S2 24h */}
                        <td className="px-1.5 py-1.5 text-right font-mono text-slate-700">
                          {formatNum(shift.resinWaterS2_24h, 0)}
                        </td>

                        {/* Thao tác (Sửa / Xóa) */}
                        <td className="px-2 py-1 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(shift)}
                              disabled={!canEditAny}
                              className="rounded px-1.5 py-0.5 text-[10px] font-bold text-blue-700 hover:bg-blue-50"
                              title="Sửa số liệu ca này"
                            >
                              Sửa
                            </button>
                            {canDeleteWaterShift(user) && (
                              <button
                                type="button"
                                onClick={() => handleDeleteShift(shift)}
                                aria-label="Xóa ca này" className="min-w-10 rounded px-1 py-0.5 text-[10px] font-bold text-rose-600 hover:bg-rose-50"
                                title="Xoá ca này"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {shifts.some(shift=>[shift.waterAdjustmentS1,shift.waterAdjustmentS2,shift.condenserAdjustmentS1,shift.condenserAdjustmentS2].some(value=>value!=null))&&<section className="rounded-xl border border-amber-200 bg-white p-4">
        <h2 className="font-bold text-amber-950">Hiệu chỉnh reset công tơ đã lưu (m³)</h2>
        <div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Ngày / Ca","Nước nhận S1","Nước nhận S2","Bình ngưng S1","Bình ngưng S2"].map(label=><th key={label} className="border bg-amber-50 p-2">{label}</th>)}</tr></thead><tbody>{shifts.filter(shift=>[shift.waterAdjustmentS1,shift.waterAdjustmentS2,shift.condenserAdjustmentS1,shift.condenserAdjustmentS2].some(value=>value!=null)).map(shift=><tr key={`${shift.logDate}:${shift.shiftTime}`}><td className="border p-2">{formatIsoToDmy(shift.logDate)} · {shift.shiftTime}</td>{[shift.waterAdjustmentS1,shift.waterAdjustmentS2,shift.condenserAdjustmentS1,shift.condenserAdjustmentS2].map((value,index)=><td key={index} className="border p-2 text-right font-mono">{value==null?"—":formatNum(value)}</td>)}</tr>)}</tbody></table></div>
      </section>}

      {/* 4. MODAL THÊM / SỬA CA TRỰC */}
      {isModalOpen && editingShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-800">
                  {editingShift.id ? "Chỉnh sửa số liệu ca trực" : "Nhập ca trực mới"}
                </h3>
                <p className="text-xs text-slate-500">
                  Nhập các chỉ số nhận ca, hệ thống sẽ tự động tính toán điện phát, nước bổ sung và hệ số
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveShift} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Nhóm 1: Thông tin ca */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  1. Thông tin ca trực
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">NGÀY VẬN HÀNH</label>
                    <input
                      type="date"
                      required
                      disabled={!canEditMeta || Boolean(editingShift.id)}
                      value={editingShift.logDate || ""}
                      onChange={e => updateEditingShift("logDate", e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">GIỜ GIAO CA</label>
                    <select
                      disabled={!canEditMeta || Boolean(editingShift.id)}
                      value={editingShift.shiftTime || "06h00"}
                      onChange={e => updateEditingShift("shiftTime", e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold outline-none focus:border-emerald-500"
                    >
                      {SHIFT_TIMES.map(t => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">KÍP (A đến F)</label>
                    <select
                      disabled={!canEditMeta}
                      value={editingShift.shiftTeam || "A"}
                      onChange={e => updateEditingShift("shiftTeam", e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-extrabold outline-none focus:border-emerald-500 text-center"
                    >
                      {SHIFT_TEAMS.map(team => (
                        <option key={team} value={team}>
                          Kíp {team}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">TRƯỞNG CA</label>
                    <select
                      disabled={!canEditMeta}
                      value={editingShift.shiftLeader || leaders[0]}
                      onChange={e => updateEditingShift("shiftLeader", e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold outline-none focus:border-emerald-500"
                    >
                      {leaders.map(name => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Nhóm 2: Số liệu nhập ca */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Khối Điện: Trưởng kíp điện, Trực chính điện, Trực phụ điện */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      ⚡ CÔNG TƠ ĐIỆN NHẬN CA
                    </p>
                    <span className="text-[10px] text-slate-500">TK điện, Trực chính/phụ</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Tổ máy S1</label>
                      <input
                        type="number"
                        step="0.1"
                        disabled={!canEditElec}
                        value={editingShift.elecRecS1 ?? ""}
                        onChange={e => updateEditingShift("elecRecS1", Number(e.target.value))}
                        className={`w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold outline-none focus:border-emerald-500 ${
                          canEditElec ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-100 cursor-not-allowed"
                        }`}
                        placeholder="0.0"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Tổ máy S2</label>
                      <input
                        type="number"
                        step="0.1"
                        disabled={!canEditElec}
                        value={editingShift.elecRecS2 ?? ""}
                        onChange={e => updateEditingShift("elecRecS2", Number(e.target.value))}
                        className={`w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold outline-none focus:border-emerald-500 ${
                          canEditElec ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-100 cursor-not-allowed"
                        }`}
                        placeholder="0.0"
                      />
                    </div>
                  </div>
                </div>

                {/* Khối Nước nhận: Trưởng kíp điện */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-sky-800">
                      💧 SỐ NƯỚC NHẬN CA (m³)
                    </p>
                    <span className="text-[10px] text-slate-500">Trưởng kíp điện</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Tổ máy S1</label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={!canEditIntake}
                        value={editingShift.waterRecS1 ?? ""}
                        onChange={e => updateEditingShift("waterRecS1", Number(e.target.value))}
                        className={`w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold outline-none focus:border-emerald-500 ${
                          canEditIntake ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-100 cursor-not-allowed"
                        }`}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Tổ máy S2</label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={!canEditIntake}
                        value={editingShift.waterRecS2 ?? ""}
                        onChange={e => updateEditingShift("waterRecS2", Number(e.target.value))}
                        className={`w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold outline-none focus:border-emerald-500 ${
                          canEditIntake ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-100 cursor-not-allowed"
                        }`}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                {/* Khối Bình ngưng nhận: Trưởng kíp điện */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-indigo-800">
                      🔄 NƯỚC BÌNH NGƯNG NHẬN (m³)
                    </p>
                    <span className="text-[10px] text-slate-500">Trưởng kíp điện</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Tổ máy S1</label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={!canEditIntake}
                        value={editingShift.condenserRecS1 ?? ""}
                        onChange={e => updateEditingShift("condenserRecS1", Number(e.target.value))}
                        className={`w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold outline-none focus:border-emerald-500 ${
                          canEditIntake ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-100 cursor-not-allowed"
                        }`}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Tổ máy S2</label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={!canEditIntake}
                        value={editingShift.condenserRecS2 ?? ""}
                        onChange={e => updateEditingShift("condenserRecS2", Number(e.target.value))}
                        className={`w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold outline-none focus:border-emerald-500 ${
                          canEditIntake ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-100 cursor-not-allowed"
                        }`}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                <div className="col-span-full rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="text-sm font-bold text-amber-950">Hiệu chỉnh khi reset công tơ nước (m³)</h3>
                  <p className="mt-1 text-xs leading-5 text-amber-900">Lượng dùng = Chỉ số nhận ca − Ca trước + Hiệu chỉnh. Nhập phần bù cho đúng ca xảy ra reset, không nhập lại ở ca sau. Ví dụ: ca trước 24.900, ca này 100, bù 25.000 → dùng 200 m³.</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{([
                    ["waterAdjustmentS1","Hiệu chỉnh nước nhận S1"],["waterAdjustmentS2","Hiệu chỉnh nước nhận S2"],
                    ["condenserAdjustmentS1","Hiệu chỉnh bình ngưng S1"],["condenserAdjustmentS2","Hiệu chỉnh bình ngưng S2"],
                  ] as Array<[WaterAdjustmentField,string]>).map(([field,label])=><label key={field} className="grid gap-1 text-xs font-semibold text-slate-700">{label}<input type="number" min="0" max="1000000000" step="0.01" disabled={!canEditIntake} value={editingShift[field]??""} onChange={event=>updateEditingShift(field,event.target.value===""?null:Number(event.target.value))} placeholder={field.startsWith("water")?"Trống: tự bù vòng 25.000":"Trống: không bù"} className="w-full rounded-lg border border-amber-300 bg-white px-2.5 py-2 font-mono disabled:bg-slate-100"/></label>)}</div>
                  <p className="mt-2 text-xs text-amber-900">Số nhập tay thay thế phần tự bù, không cộng hai lần. Nhập 0 để không tự bù. Ghi lý do reset ở Ghi chú phía dưới.</p>
                  {previewCalculations&&[previewCalculations.waterUsed1,previewCalculations.waterUsed2,previewCalculations.condUsed1,previewCalculations.condUsed2].some(value=>value<0)&&<p role="alert" className="mt-2 font-semibold text-red-700">Lượng dùng đang âm: kiểm tra chỉ số và số hiệu chỉnh trước khi lưu.</p>}
                </div>

                {/* Khối Tái sinh hạt 24h: VHV Trợ thủ */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
                      🧪 TÁI SINH HẠT (24h) (m³)
                    </p>
                    <span className="text-[10px] text-slate-500">VHV Trợ thủ</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Tổ máy S1</label>
                      <input
                        type="number"
                        step="1"
                        disabled={!canEditResin}
                        value={editingShift.resinWaterS1_24h ?? ""}
                        onChange={e => updateEditingShift("resinWaterS1_24h", Number(e.target.value))}
                        className={`w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold outline-none focus:border-emerald-500 ${
                          canEditResin ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-100 cursor-not-allowed"
                        }`}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Tổ máy S2</label>
                      <input
                        type="number"
                        step="1"
                        disabled={!canEditResin}
                        value={editingShift.resinWaterS2_24h ?? ""}
                        onChange={e => updateEditingShift("resinWaterS2_24h", Number(e.target.value))}
                        className={`w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold outline-none focus:border-emerald-500 ${
                          canEditResin ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-100 cursor-not-allowed"
                        }`}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Nhóm 3: Xem trước kết quả tính toán tự động */}
              {previewCalculations && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
                  <p className="text-[11px] font-bold text-emerald-900 mb-2">
                    ⚡ KẾT QUẢ TÍNH TOÁN TỰ ĐỘNG TỪ CA TRƯỚC (
                    {prevShiftForEditing
                      ? `${prevShiftForEditing.shiftTime} ngày ${formatIsoToDmy(prevShiftForEditing.logDate)}`
                      : "Không có ca mốc liền trước"}
                    ):
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs font-mono">
                    <div className="rounded bg-white p-2 border border-emerald-100">
                      <span className="block text-[10px] text-slate-500 font-sans">Điện phát S1 / S2:</span>
                      <strong>{formatNum(previewCalculations.elecGen1, 1)}</strong> /{" "}
                      <strong>{formatNum(previewCalculations.elecGen2, 1)}</strong> MW
                    </div>
                    <div className="rounded bg-white p-2 border border-emerald-100">
                      <span className="block text-[10px] text-slate-500 font-sans">Nước BS S1 / S2:</span>
                      <strong>{formatNum(previewCalculations.waterUsed1, 2)}</strong> /{" "}
                      <strong>{formatNum(previewCalculations.waterUsed2, 2)}</strong> m³
                    </div>
                    <div className="rounded bg-white p-2 border border-emerald-100">
                      <span className="block text-[10px] text-slate-500 font-sans">Hệ số S1 / S2:</span>
                      <strong className="text-emerald-700">{formatRatio(previewCalculations.ratio1)}</strong> /{" "}
                      <strong className="text-emerald-700">{formatRatio(previewCalculations.ratio2)}</strong>
                    </div>
                    <div className="rounded bg-white p-2 border border-emerald-100">
                      <span className="block text-[10px] text-slate-500 font-sans">Bình ngưng S1 / S2:</span>
                      <strong>{formatNum(previewCalculations.condUsed1, 2)}</strong> /{" "}
                      <strong>{formatNum(previewCalculations.condUsed2, 2)}</strong> m³
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={savingShift || !canEditAny}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
                >
                  {savingShift ? "Đang lưu..." : "Lưu ca trực"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* 5. MODAL QUẢN LÝ TRƯỞNG CA (ADMIN) */}
      {isLeaderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800">Quản lý danh sách Trưởng ca</h3>
                <p className="text-[11px] text-slate-500">Thêm hoặc loại bỏ Trưởng ca khỏi danh sách chọn ca</p>
              </div>
              <button
                type="button"
                onClick={() => setIsLeaderModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Thêm mới */}
              <form onSubmit={handleAddLeader} className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="Nhập tên Trưởng ca mới..."
                  value={newLeaderName}
                  onChange={e => setNewLeaderName(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                >
                  + Thêm
                </button>
              </form>

              {/* Danh sách hiện tại */}
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
                {leaderList.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">Đang tải danh sách...</div>
                ) : (
                  leaderList.map(l => (
                    <div key={l.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <span className="font-bold text-slate-800">{l.name}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteLeader(l.id, l.name)}
                        className="rounded px-2 py-0.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50"
                      >
                        Xoá
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsLeaderModalOpen(false)}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                >
                  Hoàn tất
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL TẢI LÊN FILE THÁNG ĐỂ NHẬN DỮ LIỆU CÁC THÁNG TRƯỚC */}
      {isMonthUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <span>📤</span>
                  <span>Tải lên file tháng nhận dữ liệu các tháng trước</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hỗ trợ file Excel chứa một tháng hoặc toàn bộ các tháng lịch sử (2024–2026)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMonthUploadModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Vùng chọn file */}
              <div
                onClick={() => monthFileInputRef.current?.click()}
                className="cursor-pointer rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50/50 p-6 text-center hover:bg-sky-50 transition"
              >
                <input
                  type="file"
                  accept=".xlsx,.xls,.xlsm"
                  ref={monthFileInputRef}
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleMonthFileSelected(f);
                  }}
                />
                <span className="text-3xl">📁</span>
                <p className="mt-2 text-sm font-bold text-slate-800">
                  {monthFile ? monthFile.name : "Nhấn vào đây để chọn file Excel (.xlsx) từ máy tính"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Có thể chọn file nhật ký một tháng bất kỳ hoặc sổ tổng hợp nhiều sheet từ 2024 đến 2026
                </p>
              </div>

              {/* Trạng thái đang quét */}
              {scanningMonthFile && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-center text-xs font-bold text-sky-800 animate-pulse">
                  ⏳ Đang đọc và phân tích các sheet trong file Excel...
                </div>
              )}

              {/* Danh sách các tháng tìm thấy trong file */}
              {scannedSheets.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        ✓ Đã tìm thấy {scannedSheets.length} sheet tháng dữ liệu trong file:
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Tổng cộng khoảng {scannedSheets.reduce((acc, s) => acc + s.shiftCount, 0)} ca trực
                      </p>
                    </div>

                    <label className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={importAllSheets}
                        onChange={e => {
                          const checked = e.target.checked;
                          setImportAllSheets(checked);
                          if (checked) {
                            setSelectedSheetsForImport(scannedSheets.map(s => s.sheetName));
                          }
                        }}
                        className="rounded accent-emerald-600"
                      />
                      <span>Nạp tất cả {scannedSheets.length} tháng</span>
                    </label>
                  </div>

                  {/* Danh sách các sheet */}
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                    {scannedSheets.map(item => {
                      const isSelected = selectedSheetsForImport.includes(item.sheetName);
                      return (
                        <div
                          key={item.sheetName}
                          onClick={() => {
                            if (importAllSheets) setImportAllSheets(false);
                            if (isSelected) {
                              setSelectedSheetsForImport(prev => prev.filter(n => n !== item.sheetName));
                            } else {
                              setSelectedSheetsForImport(prev => [...prev, item.sheetName]);
                            }
                          }}
                          className={`flex items-center justify-between p-3 text-xs cursor-pointer transition ${
                            isSelected ? "bg-sky-50/50" : "hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // handled by div
                              className="rounded accent-sky-600"
                            />
                            <div>
                              <span className="font-extrabold text-slate-800">{item.sheetName}</span>
                              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                                Tháng {item.month}
                              </span>
                            </div>
                          </div>

                          <div className="text-right text-[11px] text-slate-500">
                            <span className="font-bold text-emerald-700">{item.shiftCount} ca</span>
                            <span className="block text-[10px] text-slate-400">
                              {formatIsoToDmy(item.firstDate)} → {formatIsoToDmy(item.lastDate)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Nút hành động */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsMonthUploadModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  disabled={scannedSheets.length === 0 || selectedSheetsForImport.length === 0 || uploadingMonthFile}
                  onClick={handleExecuteMonthImport}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {uploadingMonthFile ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Đang nạp dữ liệu...</span>
                    </>
                  ) : (
                    <>
                      <span>🚀</span>
                      <span>
                        Tiến hành nạp {selectedSheetsForImport.length} tháng ({scannedSheets.filter(s => selectedSheetsForImport.includes(s.sheetName)).reduce((acc, s) => acc + s.shiftCount, 0)} ca)
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Điện thoại: mỗi ca một thẻ, gom theo ngày. Số đội ca cần xem trước; chỉ số công tơ gốc để trong mục mở rộng. */
function WaterShiftCards({ shifts, loading, month, canEdit, canDelete, onEdit, onDelete }: {
  shifts: WaterShiftLog[];
  loading: boolean;
  month: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (shift: WaterShiftLog) => void;
  onDelete: (shift: WaterShiftLog) => void;
}) {
  if (loading) return <p className="px-4 py-10 text-center text-sm text-slate-400 md:hidden">Đang tải dữ liệu theo dõi lượng nước...</p>;
  if (shifts.length === 0) return <p className="px-4 py-10 text-center text-sm text-slate-400 md:hidden">Chưa có ca trực nào trong tháng {month}.</p>;
  const days: { date: string; items: WaterShiftLog[] }[] = [];
  for (const shift of shifts) {
    const last = days[days.length - 1];
    if (last && last.date === shift.logDate) last.items.push(shift);
    else days.push({ date: shift.logDate, items: [shift] });
  }
  const pair = (s1: React.ReactNode, s2: React.ReactNode) => (
    <span className="tabular-nums"><span className="text-slate-400">S1</span> {s1} <span className="ml-1.5 text-slate-400">S2</span> {s2}</span>
  );
  const stacked = (s1: string, s2: string) => (
    <span className="flex flex-col items-end tabular-nums"><span><span className="text-slate-400">S1</span> {s1}</span><span><span className="text-slate-400">S2</span> {s2}</span></span>
  );
  const ratio = (value: number) => (value > 0.08
    ? <span className="inline-flex items-center gap-0.5 font-bold text-rose-700"><TriangleAlert className="size-3.5" aria-label="Vượt ngưỡng 0,08" />{formatRatio(value)}</span>
    : formatRatio(value));
  return (
    <div className="space-y-4 bg-slate-50/60 p-3 md:hidden">
      {days.map(day => (
        <section key={day.date} aria-label={`Ngày ${formatIsoToDmy(day.date)}`}>
          <h3 className="mb-2 text-sm font-bold text-slate-700">{formatIsoToDmy(day.date)}</h3>
          <ul className="space-y-2">
            {day.items.map((shift, idx) => {
              const high = shift.waterRatioS1 > 0.08 || shift.waterRatioS2 > 0.08;
              return (
                <li key={`${shift.shiftTime}_${shift.id ?? idx}`} className={`rounded-xl border bg-white p-3 shadow-sm ${high ? "border-rose-200" : "border-slate-200"}`}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${shift.shiftTime === "06h00" ? "bg-blue-100 text-blue-800" : shift.shiftTime === "14h00" ? "bg-amber-100 text-amber-800" : "bg-purple-100 text-purple-800"}`}>{shift.shiftTime}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">Kíp <strong>{shift.shiftTeam}</strong> · {shift.shiftLeader}</span>
                    <button type="button" onClick={() => onEdit(shift)} disabled={!canEdit} className="min-h-10 rounded-lg px-3 font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-40">Sửa</button>
                    {canDelete && <button type="button" onClick={() => onDelete(shift)} aria-label="Xóa ca này" className="min-h-10 min-w-10 rounded-lg font-bold text-rose-600 hover:bg-rose-50">✕</button>}
                  </div>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                    <dt className="text-slate-500">Điện phát (MW)</dt><dd className="text-right font-semibold text-sky-900">{pair(formatNum(shift.elecGenS1, 1), formatNum(shift.elecGenS2, 1))}</dd>
                    <dt className="text-slate-500">Nước bổ sung (m³)</dt><dd className="text-right font-semibold text-sky-900">{pair(formatNum(shift.waterUsedS1, 2), formatNum(shift.waterUsedS2, 2))}</dd>
                    <dt className="text-slate-500">Hệ số (m³/MWh)</dt><dd className="text-right font-semibold text-emerald-800">{pair(ratio(shift.waterRatioS1), ratio(shift.waterRatioS2))}</dd>
                    <dt className="text-slate-500">Bình ngưng (m³)</dt><dd className="text-right font-semibold text-sky-900">{pair(formatNum(shift.condenserUsedS1, 2), formatNum(shift.condenserUsedS2, 2))}</dd>
                    {(shift.resinWaterS1_24h > 0 || shift.resinWaterS2_24h > 0) && <><dt className="text-slate-500">Tái sinh hạt 24h (m³)</dt><dd className="text-right font-semibold text-amber-800">{pair(formatNum(shift.resinWaterS1_24h, 0), formatNum(shift.resinWaterS2_24h, 0))}</dd></>}
                  </dl>
                  <details className="mt-2 border-t border-slate-100 pt-1 text-[13px]">
                    <summary className="flex min-h-10 cursor-pointer items-center text-xs font-semibold text-slate-500">Chỉ số công tơ nhận ca</summary>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pb-1">
                      <dt className="text-slate-500">Công tơ điện</dt><dd className="text-right text-slate-700">{stacked(formatNum(shift.elecRecS1, 1), formatNum(shift.elecRecS2, 1))}</dd>
                      <dt className="text-slate-500">Số nước</dt><dd className="text-right text-slate-700">{stacked(formatNum(shift.waterRecS1, 2), formatNum(shift.waterRecS2, 2))}</dd>
                      <dt className="text-slate-500">Nước cấp bình ngưng</dt><dd className="text-right text-slate-700">{stacked(formatNum(shift.condenserRecS1, 2), formatNum(shift.condenserRecS2, 2))}</dd>
                    </dl>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
