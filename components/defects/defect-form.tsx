"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Loader2, ChevronRight, ChevronLeft, Cpu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateDefect, useDefectTwoWaySync, useUpdateDefect, type DefectItem } from "@/hooks/useDefects";
import { usePositions, useUsers } from "@/hooks/useUsers";
import { useEquipmentNode } from "@/hooks/useEquipment";
import {
  EquipmentTreePicker,
  type PickerEquipmentNode,
} from "@/components/devices/equipment-tree-picker";
import { MultiImagePicker } from "@/components/shared/multi-image-picker";
import {
  DEFECT_UNITS,
  DEFECT_COMMON_SUB_UNITS,
  DEFECT_SEVERITY_ORDER,
  DEFECT_SEVERITY_CRITERIA,
  DEFECT_CONDITION,
  DEFECT_CONDITION_ORDER,
  DEFECT_REQUEST_TYPES,
  DEFECT_STATUS,
  DEFECT_STATUS_ORDER,
  isPositionAllowedForDefectUnit,
  isSelectableManagingPosition,
} from "@/lib/constants";
import { cn, formatDate, formatDateInput } from "@/lib/utils";
import type { TreeScope } from "@/lib/equipment-units";
import { isDefectShiftLeaderCandidatePosition } from "@/lib/defect-shift-leader-position";
import { positionsMatch } from "@/lib/position-catalog";
import { allowedMappedUnits, normalizeMappedUnit } from "@/lib/defect-device-mapping";

function toDateInput(v: Date | string | null | undefined): string {
  return formatDateInput(v);
}

const NONE = "__none__";
const YES_NO_OPTIONS = ["Có", "Không"] as const;

export function DefectForm({
  defect,
  initialDevice,
  lockDevice = false,
  onDone,
  onMappingSaved,
  onCancel,
}: {
  defect?: DefectItem | null;
  initialDevice?: {
    code: string;
    displayCode?: string;
    name: string;
    system?: string | null;
    systemSeq?: string | null;
    managingPosition?: string | null;
    unit?: string | null;
  } | null;
  lockDevice?: boolean;
  onDone?: () => void;
  onMappingSaved?: (defect: DefectItem) => void;
  onCancel?: () => void;
}) {
  const isEdit = !!defect;
  // Phiếu tạo trên website vẫn thuộc quyền chỉnh sửa của Vận hành sau khi được
  // đồng bộ vòng về từ Sheet. Chỉ phiếu có nguồn gốc thật sự từ Sheet mới dùng
  // màn hình ánh xạ cục bộ.
  const isSynced = defect?.sourceType === "GOOGLE_SHEETS" && !defect.websiteCreated;
  const twoWaySync = useDefectTwoWaySync();
  const syncSetting = twoWaySync.data?.data;
  const operationUpdateAvailable = Boolean(
    syncSetting?.twoWaySyncEnabled && syncSetting.operationUpdateEnabled
  );
  const operationFeatureLocked = isSynced && !operationUpdateAvailable;
  const operationFieldsLocked = isSynced && (
    defect?.status === "DA_XU_LY" || operationFeatureLocked
  );
  const initialMappedUnit = normalizeMappedUnit(
    defect?.mappedDeviceUnit,
    defect?.unit ?? initialDevice?.unit,
    defect?.deviceSeq ?? initialDevice?.code
  );
  const create = useCreateDefect();
  const update = useUpdateDefect();
  const [step, setStep] = React.useState<1 | 2 | 3 | 4>(1);

  // Cương vị lấy từ trường "Chức vụ" của Quản lý người dùng (distinct, bỏ trùng);
  // loại Quản đốc / Phó quản đốc / Thống kê / Kỹ thuật viên.
  const allPositions = usePositions();
  const usersQuery = useUsers();
  const positions = React.useMemo(() => allPositions.filter(isSelectableManagingPosition), [allPositions]);
  const shiftLeaders = React.useMemo(
    () => (usersQuery.data?.data ?? [])
      .filter((user) => user.isActive && [user.position, user.secondaryPosition, user.secondaryPosition2, user.currentPosition].some(isDefectShiftLeaderCandidatePosition))
      .sort((a, b) => a.name.localeCompare(b.name, "vi")),
    [usersQuery.data]
  );
  const [form, setForm] = React.useState({
    unit: defect?.unit ?? initialDevice?.unit ?? "",
    commonSubUnit: defect?.commonSubUnit ?? "",
    device: defect?.device ?? initialDevice?.code ?? "",
    mappedDeviceUnit: initialMappedUnit,
    relatedDeviceSeqs: defect?.relatedDevices?.map((item) => item.deviceSeq) ?? [],
    relatedDeviceUnits: Object.fromEntries(
      (defect?.relatedDevices ?? []).map((item) => [
        item.deviceSeq,
        normalizeMappedUnit(item.mappedUnit, defect?.unit, item.deviceSeq),
      ])
    ) as Record<string, TreeScope>,
    deviceSystem: initialDevice?.system ?? "",
    deviceSystemSeq: initialDevice?.systemSeq ?? "",
    system: defect?.system ?? initialDevice?.managingPosition ?? "",
    severity: defect?.severity ?? "",
    severityCriteria: defect?.severityCriteria ?? [],
    condition: defect?.condition ?? "",
    fireSafetyImpact: defect?.fireSafetyImpact ?? "Không",
    environmentSafetyImpact: defect?.environmentSafetyImpact ?? "Không",
    // Phiếu mới phải để VHV chủ động chọn Cơ/Điện để tránh ghi nhầm Sheet.
    requestType: defect?.requestType ?? "",
    requestNumber: defect?.requestNumber ?? "",
    content: defect?.content ?? "",
    status: defect?.status ?? "CHUA_XU_LY",
    detectedAt: toDateInput(defect?.detectedAt),
    reminderCount: defect?.reminderCount ?? 0,
    lastRemindedAt: toDateInput(defect?.lastRemindedAt),
    postRepairAwaitingMaterial: defect?.postRepairAwaitingMaterial ?? false,
    shiftLeaderId: defect?.shiftLeaderId ?? "",
    note: defect?.note ?? "",
    repeatedRepairRaw: defect?.repeatedRepairRaw ?? "",
    sourceDeviceRaw: defect?.sourceDeviceRaw ?? "",
    images: defect?.images ?? (defect?.imageUrl ? [defect.imageUrl] : []),
  });
  const [mappingScope, setMappingScope] = React.useState<TreeScope>(initialMappedUnit);
  React.useEffect(() => {
    const allowed = allowedMappedUnits(form.unit);
    if (!allowed.includes(mappingScope)) setMappingScope(allowed[0]);
  }, [form.unit, mappingScope]);
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function selectSeverity(severity: string) {
    setForm((current) => ({
      ...current,
      severity,
      severityCriteria: current.severity === severity ? current.severityCriteria : [],
      images: ["1", "2"].includes(severity) ? current.images : [],
    }));
  }
  function toggleSeverityCriterion(id: string) {
    setForm((current) => ({
      ...current,
      severityCriteria: current.severityCriteria.includes(id)
        ? current.severityCriteria.filter((item) => item !== id)
        : [...current.severityCriteria, id],
    }));
  }
  // Cương vị mặc định theo từng Tổ máy (S1/S2/COMMON).
  const visiblePositions = React.useMemo(
    () => {
      const allowed = positions.filter((p) => isPositionAllowedForDefectUnit(form.unit, p));
      if (form.system && !allowed.some((position) => positionsMatch(position, form.system))) {
        return [form.system, ...allowed];
      }
      return allowed;
    },
    [positions, form.unit, form.system]
  );
  // Chọn tổ máy; nếu cương vị hiện tại không thuộc nhóm mặc định của tổ máy mới thì bỏ chọn.
  // Mỗi tổ máy ánh xạ vào một CÂY thiết bị riêng (S1/S2 = nhánh 1,2,3,7; COMMON = nhánh 5,6)
  // nên đổi tổ máy phải bỏ luôn thiết bị đã chọn — thiết bị cũ thuộc cây khác.
  function selectUnit(u: string) {
    setForm((f) => {
      const commonSubUnit = u === "COMMON" ? f.commonSubUnit : "";
      if (f.unit === u) return { ...f, commonSubUnit };
      const cleared = {
        deviceSystem: "",
        deviceSystemSeq: "",
        device: "",
        mappedDeviceUnit: normalizeMappedUnit(undefined, u),
        relatedDeviceSeqs: [],
        relatedDeviceUnits: {},
      };
      if (f.system && !isPositionAllowedForDefectUnit(u, f.system)) {
        return { ...f, unit: u, commonSubUnit, system: "", ...cleared };
      }
      return { ...f, unit: u, commonSubUnit, ...cleared };
    });
  }
  const selectedDeviceQuery = useEquipmentNode(form.device || null, form.mappedDeviceUnit);
  const selectedSystemQuery = useEquipmentNode(form.deviceSystemSeq || null, form.mappedDeviceUnit);
  React.useEffect(() => {
    const deviceName = selectedDeviceQuery.data?.data.name;
    if (!deviceName) return;
    setForm((current) => (current.sourceDeviceRaw ? current : { ...current, sourceDeviceRaw: deviceName }));
  }, [selectedDeviceQuery.data]);
  React.useEffect(() => {
    const systemName = selectedSystemQuery.data?.data.name;
    if (!systemName || form.deviceSystem === systemName) return;
    setForm((current) => ({ ...current, deviceSystem: systemName }));
  }, [form.deviceSystem, selectedSystemQuery.data]);

  function setSystem(v: string) {
    set("system", v === NONE ? "" : v);
  }

  function selectMappedDevice(node: PickerEquipmentNode | null) {
    if (!node) return;
    if (node.hasChildren) {
      toast.error("Vui lòng chọn thiết bị cấp cuối, không chọn thư mục hệ thống");
      return;
    }
    setForm((current) => {
      if (node.seq === current.device) {
        const [nextPrimary = "", ...remaining] = current.relatedDeviceSeqs;
        return {
          ...current,
          device: nextPrimary,
          mappedDeviceUnit: nextPrimary
            ? current.relatedDeviceUnits[nextPrimary] ?? mappingScope
            : normalizeMappedUnit(undefined, current.unit),
          relatedDeviceSeqs: remaining,
        };
      }
      if (current.relatedDeviceSeqs.includes(node.seq)) {
        return {
          ...current,
          relatedDeviceSeqs: current.relatedDeviceSeqs.filter((seq) => seq !== node.seq),
          relatedDeviceUnits: Object.fromEntries(
            Object.entries(current.relatedDeviceUnits).filter(([seq]) => seq !== node.seq)
          ),
        };
      }
      if (!current.device) {
        return {
          ...current,
          deviceSystem: "",
          deviceSystemSeq: node.parentSeq ?? "",
          device: node.seq,
          mappedDeviceUnit: mappingScope,
          relatedDeviceSeqs: [],
          relatedDeviceUnits: {},
        };
      }
      if (current.relatedDeviceSeqs.length >= 20) {
        toast.error("Mỗi khiếm khuyết chỉ được chọn tối đa 20 thiết bị liên quan");
        return current;
      }
      return {
        ...current,
        relatedDeviceSeqs: [...current.relatedDeviceSeqs, node.seq],
        relatedDeviceUnits: { ...current.relatedDeviceUnits, [node.seq]: mappingScope },
      };
    });
  }
  function removeMappedDevice(seq: string) {
    setForm((current) => {
      if (seq === current.device) {
        const [nextPrimary = "", ...remaining] = current.relatedDeviceSeqs;
        return {
          ...current,
          device: nextPrimary,
          mappedDeviceUnit: nextPrimary
            ? current.relatedDeviceUnits[nextPrimary] ?? mappingScope
            : normalizeMappedUnit(undefined, current.unit),
          relatedDeviceSeqs: remaining,
        };
      }
      return {
        ...current,
        relatedDeviceSeqs: current.relatedDeviceSeqs.filter((item) => item !== seq),
        relatedDeviceUnits: Object.fromEntries(
          Object.entries(current.relatedDeviceUnits).filter(([item]) => item !== seq)
        ),
      };
    });
  }

  // Tab "Thông tin chung" bắt buộc chọn đủ; trả về tên thẻ còn thiếu (nếu có).
  function missingGeneral(): string | null {
    if (isSynced) return null;
    if (!form.unit) return "Tổ máy";
    if (form.unit === "COMMON" && !form.commonSubUnit) return "BOP hoặc CHUNG";
    if (!form.system) return "Cương vị";
    if (!form.condition) return "Điều kiện thực hiện";
    if (!form.shiftLeaderId) return "Trưởng ca";
    return null;
  }
  function goToSeverity() {
    const missing = missingGeneral();
    if (missing) return toast.error(`Vui lòng chọn ${missing}`);
    setStep(2);
  }
  function goToDefectInfo() {
    const missing = missingGeneral();
    if (missing) { setStep(1); return toast.error(`Vui lòng chọn ${missing}`); }
    if (!form.severity) { setStep(2); return toast.error("Vui lòng chọn Mức độ"); }
    if (!isEdit && form.severityCriteria.length === 0) {
      setStep(2);
      return toast.error("Vui lòng chọn ít nhất 1 tiêu chí mức độ");
    }
    if (!form.requestType) {
      setStep(3);
      return toast.error("Vui lòng chọn Yêu cầu");
    }
    if (!form.content.trim()) {
      setStep(3);
      return toast.error("Vui lòng nhập Nội dung");
    }
    setStep(3);
  }

  async function submit() {
    if (isSynced) {
      if (!form.device && !defect?.deviceSeq) {
        setStep(1);
        return toast.error("Vui lòng chọn Thiết bị chính trước khi lưu ánh xạ");
      }
      try {
        const syncedPayload: Record<string, unknown> = { id: defect!.id };
        if (operationUpdateAvailable) syncedPayload.note = form.note;
        if (!operationFieldsLocked) {
          Object.assign(syncedPayload, {
            severity: form.severity,
            status: form.status,
            fireSafetyImpact: form.fireSafetyImpact,
            environmentSafetyImpact: form.environmentSafetyImpact,
            condition: form.condition,
          });
        }
        if (form.deviceSystemSeq) {
          syncedPayload.deviceSystemSeq = form.deviceSystemSeq;
          syncedPayload.device = form.device || null;
          syncedPayload.mappedDeviceUnit = form.mappedDeviceUnit;
          syncedPayload.relatedDeviceSeqs = form.relatedDeviceSeqs;
          syncedPayload.relatedDeviceMappings = form.relatedDeviceSeqs.map((deviceSeq) => ({
            deviceSeq,
            mappedUnit: form.relatedDeviceUnits[deviceSeq] ?? form.mappedDeviceUnit,
          }));
          if (operationUpdateAvailable) {
            syncedPayload.postRepairAwaitingMaterial = form.postRepairAwaitingMaterial;
          }
        }
        // Chỉ gửi ảnh khi VHV chủ động lưu tại tab hình ảnh.
        // Lưu ánh xạ không được kích hoạt kiểm tra/tải lại ảnh.
        if (step === 3 && operationUpdateAvailable) syncedPayload.images = form.images;
        const updated = await update.mutateAsync(syncedPayload as { id: string } & Record<string, unknown>);
        toast.success(
          step === 3
            ? "Đã lưu hình ảnh khiếm khuyết"
            : operationUpdateAvailable
              ? "Đã lưu ánh xạ và KQ Vận hành"
              : "Đã lưu ánh xạ thiết bị"
        );
        if (step === 1 && onMappingSaved) onMappingSaved(updated);
        else onDone?.();
      } catch (error) {
        toast.error((error as Error).message);
      }
      return;
    }
    const missing = missingGeneral();
    if (missing) { setStep(1); return toast.error(`Vui lòng chọn ${missing}`); }
    if (!form.severity) { setStep(2); return toast.error("Vui lòng chọn Mức độ"); }
    if (!isEdit && form.severityCriteria.length === 0) {
      setStep(2);
      return toast.error("Vui lòng chọn ít nhất 1 tiêu chí mức độ");
    }
    const {
      deviceSystem: _deviceSystem,
      deviceSystemSeq: _deviceSystemSeq,
      reminderCount: _reminderCount,
      lastRemindedAt: _lastRemindedAt,
      relatedDeviceUnits: _relatedDeviceUnits,
      ...defectForm
    } = form;
    const payload = {
      ...defectForm,
      relatedDeviceMappings: form.relatedDeviceSeqs.map((deviceSeq) => ({
        deviceSeq,
        mappedUnit: form.relatedDeviceUnits[deviceSeq] ?? form.mappedDeviceUnit,
      })),
      detectedAt: form.detectedAt || null,
    };
    try {
      if (isEdit) await update.mutateAsync({ id: defect!.id, ...payload });
      else await create.mutateAsync(payload);
      toast.success(isEdit ? "Đã cập nhật khiếm khuyết" : "Đã lưu khiếm khuyết");
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <div className="flex min-h-0 h-full flex-col">
      {/* Tabs */}
      <div className="flex shrink-0 justify-center gap-3 overflow-x-auto border-b border-border px-3 sm:gap-6">
        {isSynced ? (
          <>
            <TabBtn active={step === 1} onClick={() => setStep(1)} label="Ánh xạ thiết bị" />
            <TabBtn active={step === 2} onClick={() => setStep(2)} label="Nội dung sửa chữa" />
            {["1", "2"].includes(form.severity) && (
              <TabBtn active={step === 3} onClick={() => setStep(3)} label="Hình ảnh khiếm khuyết" />
            )}
            <TabBtn active={step === 4} onClick={() => setStep(4)} label="BGĐ chỉ đạo" />
          </>
        ) : (
          <>
            <TabBtn active={step === 1} onClick={() => setStep(1)} label="Thông tin chung" />
            <TabBtn active={step === 2} onClick={goToSeverity} label="Mức độ" />
            <TabBtn active={step === 3} onClick={goToDefectInfo} label="Thông tin khiếm khuyết" />
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
        <div className={cn(step === 1 ? "block" : "hidden")}>
          <div className="mx-auto max-w-xl space-y-5">
            <Row label="Tổ Máy *">
              {lockDevice && initialDevice ? (
                <LockedValue
                  primary={form.unit === "COMMON" ? "COMMON · Dùng chung" : form.unit}
                  secondary="Tự động theo nhánh thiết bị"
                />
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {DEFECT_UNITS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      disabled={isSynced}
                      onClick={() => selectUnit(u)}
                      className={cn(
                        "h-10 rounded-md border text-sm font-medium transition-colors",
                        form.unit === u ? "border-navy bg-navy text-white" : "border-input bg-muted/40 text-ink hover:border-accent",
                        isSynced && "cursor-not-allowed opacity-70"
                      )}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              )}
            </Row>
            {!isSynced && form.unit === "COMMON" && (
              <Row label="Phân Loại Dùng Chung *">
                <div className="grid grid-cols-2 gap-2">
                  {DEFECT_COMMON_SUB_UNITS.map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => set("commonSubUnit", sub)}
                      className={cn(
                        "h-10 rounded-md border text-sm font-medium transition-colors",
                        form.commonSubUnit === sub ? "border-navy bg-navy text-white" : "border-input bg-muted/40 text-ink hover:border-accent"
                      )}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </Row>
            )}
            <Row label="Cương Vị *">
              <Select value={form.system || NONE} onValueChange={setSystem} disabled={isSynced}>
                <SelectTrigger><SelectValue placeholder="Chọn cương vị" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không chọn —</SelectItem>
                  {visiblePositions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label={isSynced ? "Hệ Thống Chính *" : "Hệ Thống Chính"}>
              {lockDevice && initialDevice ? (
                <LockedValue primary={initialDevice.system || "Chưa xác định hệ thống"} secondary={initialDevice.systemSeq || undefined} />
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/25 p-2">
                    {allowedMappedUnits(form.unit).map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        onClick={() => setMappingScope(unit)}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                          mappingScope === unit
                            ? "bg-navy text-white shadow-sm"
                            : "bg-white text-muted-foreground hover:text-ink"
                        )}
                      >
                        {unit === "COMMON" ? "Thiết bị COMMON" : `Thiết bị ${unit}`}
                      </button>
                    ))}
                  </div>
                  <EquipmentTreePicker
                    value={mappingScope === form.mappedDeviceUnit ? form.deviceSystemSeq : ""}
                    position={form.system || null}
                    // Phiếu Sheet chưa ánh xạ được các cương vị quản lý xử lý
                    // trong phạm vi cây họ được xem. Sau khi đã ánh xạ, mọi lần
                    // sửa tiếp theo vẫn phải theo quyền chỉnh sửa thiết bị.
                    accessFilter={isSynced && !defect?.deviceSeq ? "view" : "edit"}
                    includeLeaves
                    leafOnly
                    selectedValues={[form.device, ...form.relatedDeviceSeqs].filter(Boolean)}
                    keepOpenOnSelect
                    allowClear={false}
                    scope={mappingScope}
                    disabled={!form.unit}
                    selectionLabel={
                      form.device
                        ? `${form.deviceSystem || "Hệ thống đã chọn"} · ${1 + form.relatedDeviceSeqs.length} thiết bị`
                        : undefined
                    }
                    onChange={selectMappedDevice}
                    placeholder={form.unit
                      ? `Mở cây ${mappingScope} và chọn một hoặc nhiều thiết bị con`
                      : "Chọn tổ máy trước"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Thiết bị đầu tiên xác định Hệ thống chính; các thiết bị liên quan có thể thuộc Hệ thống khác.
                  </p>
                </div>
              )}
            </Row>
            <Row label={isSynced ? "Thiết Bị *" : "Thiết Bị"}>
              {lockDevice && initialDevice ? (
                <LockedValue primary={initialDevice.name} secondary={initialDevice.displayCode ?? initialDevice.code} />
              ) : form.device ? (
                <RelatedDeviceRow
                  seq={form.device}
                  scope={form.mappedDeviceUnit}
                  role={`Thiết bị chính · ${form.mappedDeviceUnit}`}
                  onRemove={() => removeMappedDevice(form.device)}
                />
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/25 px-3 py-2.5 text-sm text-muted-foreground">
                  Chưa chọn thiết bị. Hãy bung cây Hệ thống đến cấp cuối để chọn.
                </div>
              )}
            </Row>
            <Row label="Thiết Bị Liên Quan">
              <div className="space-y-3">
                {form.relatedDeviceSeqs.length > 0 ? (
                  <div className="space-y-2">
                    {form.relatedDeviceSeqs.map((seq) => {
                      return (
                        <RelatedDeviceRow
                          key={seq}
                          seq={seq}
                          scope={form.relatedDeviceUnits[seq] ?? form.mappedDeviceUnit}
                          role={`Thiết bị liên quan · ${form.relatedDeviceUnits[seq] ?? form.mappedDeviceUnit}`}
                          onRemove={() => removeMappedDevice(seq)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Không bắt buộc. Thiết bị chính vẫn quyết định cương vị và quyền xử lý phiếu.
                  </p>
                )}
              </div>
            </Row>
            {isSynced && (
              <div className="my-5 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                <div className="mb-4">
                  <p className="font-semibold text-blue-950">Cập nhật Vận hành</p>
                  <p className="text-xs text-blue-800/75">
                    {operationFeatureLocked
                      ? "Đồng bộ hai chiều đang tắt. Bạn vẫn có thể ánh xạ thiết bị; các trường Vận hành tạm khóa."
                      : operationFieldsLocked
                      ? "Phiếu đã xử lý xong. Chỉ Ghi chú được phép thay đổi."
                      : "Các trường Vận hành cột 10–15 được ghi ngược lên Google Sheet."}
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <StackField label="Mức Độ">
                    <Select value={form.severity} onValueChange={(value) => set("severity", value)} disabled={operationFieldsLocked}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Chọn mức độ" /></SelectTrigger>
                      <SelectContent>
                        {DEFECT_SEVERITY_ORDER.map((severity) => (
                          <SelectItem key={severity} value={severity}>Mức {severity}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </StackField>
                  <StackField label="KQ Vận Hành">
                    <Select value={form.status} onValueChange={(value) => set("status", value)} disabled={operationFieldsLocked}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DEFECT_STATUS_ORDER.map((status) => (
                          <SelectItem key={status} value={status}>{DEFECT_STATUS[status].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </StackField>
                  <StackField label="Ảnh Hưởng PCCC">
                    <Select value={form.fireSafetyImpact} onValueChange={(value) => set("fireSafetyImpact", value)} disabled={operationFieldsLocked}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>{YES_NO_OPTIONS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                    </Select>
                  </StackField>
                  <StackField label="Môi Trường, ATVSLĐ">
                    <Select value={form.environmentSafetyImpact} onValueChange={(value) => set("environmentSafetyImpact", value)} disabled={operationFieldsLocked}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>{YES_NO_OPTIONS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                    </Select>
                  </StackField>
                  <StackField label="Điều Kiện Thực Hiện">
                    <Select value={form.condition} onValueChange={(value) => set("condition", value)} disabled={operationFieldsLocked}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Chọn điều kiện" /></SelectTrigger>
                      <SelectContent>{DEFECT_CONDITION_ORDER.map((value) => <SelectItem key={value} value={value}>{DEFECT_CONDITION[value]}</SelectItem>)}</SelectContent>
                    </Select>
                  </StackField>
                  <StackField label="Ghi Chú">
                    <Input className="h-11" value={form.note} disabled={operationFeatureLocked} onChange={(event) => set("note", event.target.value)} />
                  </StackField>
                </div>
                <p className="mt-3 text-xs text-blue-800/75">Nhắc lại được ghi riêng vào cột H bằng nút “Nhắc lại” trên danh sách.</p>
              </div>
            )}
            {isSynced && defect?.status === "DA_XU_LY" && (
              <Row label="Tồn Đọng">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={form.postRepairAwaitingMaterial}
                  onClick={() => set("postRepairAwaitingMaterial", !form.postRepairAwaitingMaterial)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                    form.postRepairAwaitingMaterial
                      ? "border-amber-300 bg-amber-50"
                      : "border-border bg-white hover:border-amber-200"
                  )}
                >
                  <span className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                    form.postRepairAwaitingMaterial
                      ? "border-amber-600 bg-amber-600 text-white"
                      : "border-slate-300 bg-white"
                  )}>
                    {form.postRepairAwaitingMaterial && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">Đánh dấu chờ vật tư</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                      Các phiếu trạng thái đã xử lý nhưng kết quả chờ vật tư.
                    </span>
                  </span>
                </button>
              </Row>
            )}
            <Row label="Điều Kiện Thực Hiện *">
              <Select value={form.condition || NONE} onValueChange={(v) => set("condition", v === NONE ? "" : v)} disabled={isSynced}>
                <SelectTrigger><SelectValue placeholder="Chọn điều kiện" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không chọn —</SelectItem>
                  {DEFECT_CONDITION_ORDER.map((c) => <SelectItem key={c} value={c}>{DEFECT_CONDITION[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Ảnh hưởng PCCC">
              <Select value={form.fireSafetyImpact} onValueChange={(v) => set("fireSafetyImpact", v)} disabled={isSynced}>
                <SelectTrigger><SelectValue placeholder="Chọn ảnh hưởng PCCC" /></SelectTrigger>
                <SelectContent>
                  {YES_NO_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Môi trường, ATVSLĐ">
              <Select value={form.environmentSafetyImpact} onValueChange={(v) => set("environmentSafetyImpact", v)} disabled={isSynced}>
                <SelectTrigger><SelectValue placeholder="Chọn ảnh hưởng môi trường, ATVSLĐ" /></SelectTrigger>
                <SelectContent>
                  {YES_NO_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Ngày Phát Hiện">
              <Input type="date" value={form.detectedAt} disabled={isSynced} onChange={(e) => set("detectedAt", e.target.value)} />
            </Row>
            <Row label="Trưởng Ca *">
              <Select value={form.shiftLeaderId || NONE} onValueChange={(value) => set("shiftLeaderId", value === NONE ? "" : value)} disabled={isSynced}>
                <SelectTrigger><SelectValue placeholder="Chọn Trưởng ca" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không chọn —</SelectItem>
                  {shiftLeaders.map((leader) => (
                    <SelectItem key={leader.id} value={leader.id}>
                      {leader.name}{leader.employeeId ? ` · ${leader.employeeId}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!usersQuery.isLoading && shiftLeaders.length === 0 && (
                <p className="mt-1.5 text-xs text-amber-700">Chưa có nhân viên hoạt động được khai báo cương vị Trưởng ca.</p>
              )}
            </Row>
          </div>
        </div>
        {isSynced && defect && (
          <div className={cn(step === 2 ? "block" : "hidden")}>
            <div className="mx-auto max-w-2xl space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <h3 className="font-bold text-emerald-900">Dữ liệu của bộ phận Sửa chữa</h3>
                <p className="mt-1 text-sm text-emerald-800">
                  Các nội dung dưới đây được đọc từ cột 18–27 trên Google Sheet.
                </p>
              </div>

              <div className="grid gap-4 rounded-xl border border-border bg-white p-4 sm:grid-cols-2">
                <SourcePreviewValue label="Số PCT/LCT" value={defect.repairOrderNumberRaw || "—"} />
                <SourcePreviewValue label="Đơn vị sửa chữa" value={defect.repairUnitRaw || "—"} />
                <SourcePreviewValue label="Người thực hiện" value={defect.repairPerformedByRaw || "—"} />
                <SourcePreviewValue
                  label="Ngày thực hiện"
                  value={defect.repairStartedAt ? formatDate(defect.repairStartedAt) : "—"}
                />
                <SourcePreviewValue
                  label="Ngày kết thúc"
                  value={defect.sourceCompletedAt ? formatDate(defect.sourceCompletedAt) : "—"}
                />
              </div>

              <div className="space-y-4 rounded-xl border border-border bg-white p-4">
                <SourcePreviewValue label="Giải pháp sửa chữa" value={defect.repairSolutionRaw || "—"} />
                <SourcePreviewValue label="Kế hoạch thực hiện" value={defect.repairPlanRaw || "—"} />
                <SourcePreviewValue label="Kết quả thực hiện" value={defect.repairResultRaw || "—"} />
                <SourcePreviewValue label="Nội dung đã thực hiện" value={defect.repairPerformedContentRaw || "—"} />
                <SourcePreviewValue label="Ghi chú Sửa chữa" value={defect.repairNoteRaw || "—"} />
              </div>
            </div>
          </div>
        )}

        <div className={cn(!isSynced && step === 2 ? "block" : "hidden")}>
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 text-center">
              <h3 className="text-base font-bold text-ink">Chọn mức độ khiếm khuyết</h3>
              <p className="mt-1 text-sm text-muted-foreground">Chọn một mức phù hợp với mức độ ảnh hưởng của khiếm khuyết.</p>
            </div>
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Mức độ khiếm khuyết">
              {DEFECT_SEVERITY_ORDER.map((severity) => {
                const active = form.severity === severity;
                return (
                  <button
                    key={severity}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => selectSeverity(severity)}
                    className={cn(
                      "min-h-12 rounded-lg border px-2 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                      active
                        ? "border-navy bg-navy text-white shadow-sm"
                        : "border-input bg-white text-ink hover:border-accent/50 hover:bg-blue-50/50"
                    )}
                  >
                    <span className={cn("block text-sm font-bold", active ? "text-white" : "text-navy")}>Mức {severity}</span>
                  </button>
                );
              })}
            </div>

            {form.severity && (() => {
              const config = DEFECT_SEVERITY_CRITERIA[form.severity as keyof typeof DEFECT_SEVERITY_CRITERIA];
              if (!config) return null;
              return (
                <div className="mt-4 rounded-xl border border-border bg-white p-4 shadow-sm">
                  <div className="border-b border-border pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-bold text-ink">{config.title}</h4>
                      {!isEdit && (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                          Chọn ít nhất 1 tiêu chí
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{config.guidance}</p>
                  </div>
                  <div className="mt-3 space-y-2" role="group" aria-label={`Tiêu chí Mức ${form.severity}`}>
                    {config.options.map((option) => {
                      const checked = form.severityCriteria.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleSeverityCriterion(option.id)}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                            checked
                              ? "border-blue-300 bg-blue-50 text-ink"
                              : "border-transparent bg-muted/35 text-ink hover:border-border hover:bg-muted/60"
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                              checked ? "border-navy bg-navy text-white" : "border-input bg-white text-transparent"
                            )}
                            aria-hidden="true"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-sm leading-relaxed">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
        {isSynced && ["1", "2"].includes(form.severity) && (
          <div className={cn(step === 3 ? "block" : "hidden")}>
            <div className="mx-auto max-w-xl space-y-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                <h3 className="font-bold text-blue-900">Hình ảnh khiếm khuyết Mức {form.severity}</h3>
                <p className="mt-1 text-sm text-blue-800">
                  Ảnh do VHV bổ sung được lưu trên web, không ghi ngược lên Google Sheet và không bị lần đồng bộ sau ghi đè.
                </p>
              </div>
              <StackField label="Hình ảnh khiếm khuyết (tối đa 3)">
                <MultiImagePicker
                  value={form.images}
                  onChange={(images) => set("images", images)}
                  max={3}
                  maxFileSizeMb={15}
                />
                <p className="text-xs text-muted-foreground">
                  Hỗ trợ tối đa 3 ảnh, mỗi ảnh tối đa 15MB.
                </p>
              </StackField>
            </div>
          </div>
        )}
        {isSynced && defect && (
          <div className={cn(step === 4 ? "block" : "hidden")}>
            <div className="mx-auto max-w-2xl space-y-4">
              <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
                <h3 className="font-bold text-red-900">BGĐ chỉ đạo</h3>
                <p className="mt-1 text-sm text-red-800/80">
                  Dữ liệu tham khảo được đọc từ cột 16–17 trên Google Sheet; website không ghi ngược hai nội dung này.
                </p>
              </div>
              <div className="space-y-5 rounded-xl border border-border bg-white p-5 shadow-sm">
                <SourcePreviewValue label="KTAT rà soát" value={defect.ktatReviewRaw || "—"} />
                <SourcePreviewValue label="BGĐ chỉ đạo" value={defect.boardDirectionRaw || "—"} />
              </div>
            </div>
          </div>
        )}

        <div className={cn(!isSynced && step === 3 ? "block" : "hidden")}>
          <div className="mx-auto w-full max-w-2xl rounded-xl border border-border/80 bg-white p-5 shadow-sm">
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <StackField label="Yêu Cầu" required>
                  <Select value={form.requestType} onValueChange={(v) => set("requestType", v)}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Chọn Cơ hoặc Điện" /></SelectTrigger>
                    <SelectContent>
                      {DEFECT_REQUEST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </StackField>
                <StackField label="Số Yêu Cầu">
                  {isEdit ? (
                    <Input className="h-11" value={form.requestNumber || "—"} disabled />
                  ) : (
                    <div className="flex h-11 items-center rounded-md border border-dashed border-input bg-muted/30 px-3 text-sm text-muted-foreground">
                      Sẽ tự cấp số khi lưu
                    </div>
                  )}
                </StackField>
              </div>
              <StackField label="Nội Dung" required>
                <Textarea
                  className="min-h-[88px] resize-y"
                  value={form.content}
                  onChange={(e) => set("content", e.target.value)}
                  placeholder="Nhập nội dung khiếm khuyết"
                  required
                />
              </StackField>
              <StackField label="Sửa Chữa Lặp Lại">
                <Textarea
                  className="min-h-[64px] resize-y"
                  value={form.repeatedRepairRaw}
                  onChange={(e) => set("repeatedRepairRaw", e.target.value)}
                  placeholder="Để trống nếu không có"
                />
              </StackField>
              <StackField label="Tên Thiết Bị Ghi Lên Google Sheet">
                <Input
                  className="h-11"
                  value={form.sourceDeviceRaw}
                  onChange={(e) => set("sourceDeviceRaw", e.target.value)}
                  placeholder="Mặc định theo tên thiết bị đã chọn, có thể sửa lại"
                />
              </StackField>
              <StackField label="Tình Trạng Khiếm Khuyết">
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEFECT_STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{DEFECT_STATUS[s].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </StackField>
              <div className="grid gap-4 md:grid-cols-2">
                <StackField label="Số Lần Nhắc Lại">
                  <Input
                    className="h-11"
                    type="number"
                    value={form.reminderCount}
                    readOnly
                    disabled
                  />
                </StackField>
                <StackField label="Ngày Nhắc Lại Gần Nhất">
                  <Input
                    className="h-11"
                    type="date"
                    value={form.lastRemindedAt}
                    readOnly
                    disabled
                  />
                </StackField>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                Dữ liệu chỉ đọc, được hệ thống tự tính từ lịch sử khi bấm nút “Nhắc lại” trên danh sách.
              </p>
              <StackField label="Ghi Chú">
                <Textarea className="min-h-[88px] resize-y" value={form.note} onChange={(e) => set("note", e.target.value)} />
              </StackField>
              {["1", "2"].includes(form.severity) && (
                <StackField label="Hình ảnh khiếm khuyết (tối đa 3)">
                  <MultiImagePicker
                    value={form.images}
                    onChange={(images) => set("images", images)}
                    max={3}
                    maxFileSizeMb={15}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ảnh được lưu tại S3 trong thư mục defects/images và tự động xoá khi khiếm khuyết hoàn thành.
                  </p>
                </StackField>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-white p-4">
        {!isSynced && step > 1 && (
          <Button type="button" variant="outline" onClick={() => setStep(step === 3 ? 2 : 1)}>
            <ChevronLeft className="h-4 w-4" /> Trước
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => onCancel?.()}>Hủy bỏ</Button>
        {isSynced && (step === 1 || step === 3) ? (
          <Button type="button" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {step === 3 ? "Lưu hình ảnh" : "Lưu ánh xạ & Vận hành"}
          </Button>
        ) : isSynced ? (
          <Button type="button" onClick={() => setStep(1)}>
            <ChevronLeft className="h-4 w-4" /> Quay lại ánh xạ
          </Button>
        ) : step < 3 ? (
          <Button type="button" onClick={step === 1 ? goToSeverity : goToDefectInfo}>
            Kế tiếp <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
          </Button>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-1 py-3 text-sm font-medium transition-colors",
        active ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-ink"
      )}
    >
      {label}
    </button>
  );
}

function Row({ label, children, compact = false }: { label: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <div className={cn("grid items-center gap-4", compact ? "grid-cols-[88px_1fr]" : "grid-cols-[180px_1fr]")}>
      <Label className="whitespace-nowrap text-right text-muted-foreground">{label}</Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function StackField({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="grid gap-2">
      <Label className="text-sm font-semibold text-slate-600">
        {label}{required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SourcePreviewValue({ label, value, pending = false }: { label: string; value: string; pending?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-1 whitespace-pre-wrap break-words text-sm",
        pending ? "font-medium italic text-amber-700" : "text-ink"
      )}>
        {value}
      </p>
    </div>
  );
}

function LockedValue({ primary, secondary }: { primary: string; secondary?: string }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5">
      <div className="text-sm font-semibold text-ink">{primary}</div>
      {secondary && <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{secondary}</div>}
    </div>
  );
}

function RelatedDeviceRow({
  seq,
  scope,
  onRemove,
  role = "Thiết bị liên quan",
}: {
  seq: string;
  scope?: TreeScope;
  onRemove: () => void;
  role?: string;
}) {
  const nodeQuery = useEquipmentNode(seq, scope);
  const name = nodeQuery.data?.data.name ?? (nodeQuery.isLoading ? "Đang tải tên thiết bị…" : seq);
  const code = nodeQuery.data?.data.fullCode ?? seq;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
        <Cpu className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink">{name}</div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{role}</span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">{code}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white hover:text-destructive"
        aria-label={`Bỏ thiết bị ${name}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
