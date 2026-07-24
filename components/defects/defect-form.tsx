"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Loader2, ChevronRight, ChevronLeft, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateDefect, useUpdateDefect, type DefectItem } from "@/hooks/useDefects";
import { usePositions, useUsers } from "@/hooks/useUsers";
import { useDevices } from "@/hooks/useDevices";
import { useEquipmentTree } from "@/hooks/useEquipment";
import { usePositionSystemScopes } from "@/hooks/usePositionSystemScopes";
import { EquipmentTreePicker } from "@/components/devices/equipment-tree-picker";
import { MultiImagePicker } from "@/components/shared/multi-image-picker";
import {
  DEFECT_UNITS,
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
import { createPositionAccessResolver } from "@/lib/position-system-scopes";
import { dedupeEquipmentLeafNodes } from "@/lib/equipment-tree";
import { normalizeText } from "@/lib/nav";

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
  const isSynced = defect?.sourceType === "GOOGLE_SHEETS";
  const create = useCreateDefect();
  const update = useUpdateDefect();
  const [step, setStep] = React.useState<1 | 2 | 3>(1);

  // Cương vị lấy từ trường "Chức vụ" của Quản lý người dùng (distinct, bỏ trùng);
  // loại Quản đốc / Phó quản đốc / Thống kê / Kỹ thuật viên.
  const allPositions = usePositions();
  const usersQuery = useUsers();
  const positions = React.useMemo(() => allPositions.filter(isSelectableManagingPosition), [allPositions]);
  const shiftLeaders = React.useMemo(
    () => (usersQuery.data?.data ?? [])
      .filter((user) => user.isActive && [user.position, user.secondaryPosition, user.secondaryPosition2, user.currentPosition].some((value) => normalizeText(value ?? "") === "truong ca"))
      .sort((a, b) => a.name.localeCompare(b.name, "vi")),
    [usersQuery.data]
  );
  // Thiết bị lấy từ module Thiết bị.
  const { data: devicesData } = useDevices({});
  const { data: equipmentTreeData } = useEquipmentTree();
  const scopesQuery = usePositionSystemScopes();
  const devices = React.useMemo(() => devicesData?.data ?? [], [devicesData]);
  const equipmentNodes = React.useMemo(() => equipmentTreeData?.data ?? [], [equipmentTreeData]);
  const positionScopes = React.useMemo(() => scopesQuery.data?.data ?? [], [scopesQuery.data]);

  const [form, setForm] = React.useState({
    unit: defect?.unit ?? initialDevice?.unit ?? "",
    device: defect?.device ?? initialDevice?.code ?? "",
    relatedDeviceSeqs: defect?.relatedDevices?.map((item) => item.deviceSeq) ?? [],
    deviceSystem: initialDevice?.system ?? "",
    deviceSystemSeq: initialDevice?.systemSeq ?? "",
    system: defect?.system ?? initialDevice?.managingPosition ?? "",
    severity: defect?.severity ?? "",
    severityCriteria: defect?.severityCriteria ?? [],
    condition: defect?.condition ?? "",
    fireSafetyImpact: defect?.fireSafetyImpact ?? "Không",
    environmentSafetyImpact: defect?.environmentSafetyImpact ?? "Không",
    requestType: defect?.requestType ?? "Cơ",
    requestNumber: defect?.requestNumber ?? "",
    content: defect?.content ?? "",
    status: defect?.status ?? "CHUA_XU_LY",
    detectedAt: toDateInput(defect?.detectedAt),
    reminderCount: defect?.reminderCount ?? 0,
    lastRemindedAt: toDateInput(defect?.lastRemindedAt),
    postRepairAwaitingMaterial: defect?.postRepairAwaitingMaterial ?? false,
    shiftLeaderId: defect?.shiftLeaderId ?? "",
    note: defect?.note ?? "",
    images: defect?.images ?? (defect?.imageUrl ? [defect.imageUrl] : []),
  });
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
      if (form.system && !allowed.includes(form.system)) return [form.system, ...allowed];
      return allowed;
    },
    [positions, form.unit, form.system]
  );
  // Chọn tổ máy; nếu cương vị hiện tại không thuộc nhóm mặc định của tổ máy mới thì bỏ chọn.
  function selectUnit(u: string) {
    setForm((f) => {
      if (f.system && !isPositionAllowedForDefectUnit(u, f.system)) {
        return { ...f, unit: u, system: "", deviceSystem: "", deviceSystemSeq: "", device: "" };
      }
      return { ...f, unit: u };
    });
  }
  const equipmentIndex = React.useMemo(() => {
    const bySeq = new Map(equipmentNodes.map((node) => [node.seq, node]));
    const parentOf = new Map<string, string | null>();
    const childrenOf = new Map<string, typeof equipmentNodes>();

    for (const node of equipmentNodes) {
      let parent = node.parentSeq && bySeq.has(node.parentSeq) ? node.parentSeq : null;
      if (!parent) {
        const parts = node.seq.split(".");
        parts.pop();
        while (parts.length) {
          const candidate = parts.join(".");
          if (bySeq.has(candidate)) {
            parent = candidate;
            break;
          }
          parts.pop();
        }
      }
      parentOf.set(node.seq, parent);
      if (parent) {
        const children = childrenOf.get(parent) ?? [];
        children.push(node);
        childrenOf.set(parent, children);
      }
    }

    return { bySeq, parentOf, childrenOf };
  }, [equipmentNodes]);
  function leafNodesFor(systemSeq: string) {
    if (!systemSeq) return [];
    const result: typeof equipmentNodes = [];
    const queue = [...(equipmentIndex.childrenOf.get(systemSeq) ?? [])];
    while (queue.length) {
      const node = queue.shift()!;
      const children = equipmentIndex.childrenOf.get(node.seq) ?? [];
      if (children.length === 0) {
        result.push(node);
      } else {
        queue.push(...children);
      }
    }
    return dedupeEquipmentLeafNodes(result);
  }
  function systemSeqOfDevice(device: (typeof devices)[number]) {
    return device.systemSeq ?? equipmentIndex.parentOf.get(device.code) ?? "";
  }
  const deviceOptions = React.useMemo(
    () => leafNodesFor(form.deviceSystemSeq),
    [equipmentIndex, form.deviceSystemSeq]
  );
  const selectedDeviceValue = React.useMemo(() => {
    if (!form.device) return NONE;
    return deviceOptions.find((node) => node.duplicateSeqs.includes(form.device))?.seq ?? form.device;
  }, [deviceOptions, form.device]);
  React.useEffect(() => {
    if (!form.device || form.deviceSystemSeq || form.deviceSystem) return;
    const selectedDevice = devices.find((d) => d.code === form.device);
    const systemSeq = selectedDevice
      ? systemSeqOfDevice(selectedDevice)
      : equipmentIndex.parentOf.get(form.device) ?? "";
    const systemName = systemSeq
      ? equipmentIndex.bySeq.get(systemSeq)?.name ?? selectedDevice?.system ?? ""
      : selectedDevice?.system ?? "";
    if (!systemName && !systemSeq) return;
    setForm((f) => (f.deviceSystemSeq || f.deviceSystem ? f : { ...f, deviceSystem: systemName, deviceSystemSeq: systemSeq }));
  }, [devices, form.device, form.deviceSystem, form.deviceSystemSeq, equipmentIndex]);
  function setSystem(v: string) {
    setForm((f) => {
      const system = v === NONE ? "" : v;
      const selectedDevice = devices.find((d) => d.code === f.device);
      const keepDevice =
        !f.device ||
        !selectedDevice ||
        !system ||
        createPositionAccessResolver(system, equipmentNodes, positionScopes).accessForDevice(selectedDevice) !== "none";
      return {
        ...f,
        system,
        device: keepDevice ? f.device : "",
      };
    });
  }
  function setDeviceSystemNode(node: { seq: string; name: string } | null) {
    setForm((f) => {
      const deviceSystem = node?.name ?? "";
      const deviceSystemSeq = node?.seq ?? "";
      const nextDeviceSeqs = new Set(leafNodesFor(deviceSystemSeq).flatMap((leaf) => leaf.duplicateSeqs));
      return {
        ...f,
        deviceSystem,
        deviceSystemSeq,
        device: f.device && !nextDeviceSeqs.has(f.device) ? "" : f.device,
      };
    });
  }
  function setDevice(v: string) {
    setForm((f) => {
      const device = v === NONE ? null : devices.find((d) => d.code === v);
      const equipmentNode = v === NONE ? null : equipmentIndex.bySeq.get(v) ?? null;
      return {
        ...f,
        device: equipmentNode?.seq ?? device?.code ?? "",
        system: isSynced ? f.system : device?.managingPosition ?? f.system,
        relatedDeviceSeqs: f.relatedDeviceSeqs.filter((seq) => seq !== (equipmentNode?.seq ?? device?.code ?? "")),
      };
    });
  }
  const [relatedPickerValue, setRelatedPickerValue] = React.useState("");
  function addRelatedDevice(node: { seq: string; name: string } | null) {
    setRelatedPickerValue("");
    if (!node) return;
    if ((equipmentIndex.childrenOf.get(node.seq) ?? []).length > 0) {
      toast.error("Vui lòng chọn thiết bị cấp cuối, không chọn thư mục hệ thống");
      return;
    }
    if (node.seq === form.device) {
      toast.error("Thiết bị này đang là thiết bị chính");
      return;
    }
    if (form.relatedDeviceSeqs.includes(node.seq)) {
      toast.error("Thiết bị này đã có trong danh sách liên quan");
      return;
    }
    if (form.relatedDeviceSeqs.length >= 20) {
      toast.error("Mỗi khiếm khuyết chỉ được chọn tối đa 20 thiết bị liên quan");
      return;
    }
    set("relatedDeviceSeqs", [...form.relatedDeviceSeqs, node.seq]);
  }

  // Tab "Thông tin chung" bắt buộc chọn đủ; trả về tên thẻ còn thiếu (nếu có).
  function missingGeneral(): string | null {
    if (isSynced) return null;
    if (!form.unit) return "Tổ máy";
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
    setStep(3);
  }

  async function submit() {
    if (isSynced) {
      if (!form.deviceSystemSeq) {
        setStep(1);
        return toast.error("Vui lòng chọn Hệ thống trước khi lưu ánh xạ");
      }
      if (!form.device) {
        setStep(1);
        return toast.error("Vui lòng chọn Thiết bị chính trước khi lưu ánh xạ");
      }
      try {
        const syncedPayload: Record<string, unknown> = {
          id: defect!.id,
          deviceSystemSeq: form.deviceSystemSeq,
          device: form.device || null,
          relatedDeviceSeqs: form.relatedDeviceSeqs,
          postRepairAwaitingMaterial: form.postRepairAwaitingMaterial,
        };
        // Chỉ gửi ảnh khi VHV chủ động lưu tại tab hình ảnh.
        // Lưu ánh xạ không được kích hoạt kiểm tra/tải lại ảnh.
        if (step === 3) syncedPayload.images = form.images;
        const updated = await update.mutateAsync(syncedPayload as { id: string } & Record<string, unknown>);
        toast.success(step === 3 ? "Đã lưu hình ảnh khiếm khuyết" : "Đã lưu ánh xạ thiết bị");
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
    const { deviceSystem: _deviceSystem, deviceSystemSeq: _deviceSystemSeq, ...defectForm } = form;
    const payload = {
      ...defectForm,
      detectedAt: form.detectedAt || null,
      lastRemindedAt: form.reminderCount > 0 ? form.lastRemindedAt || null : null,
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
            <Row label="Cương Vị *">
              <Select value={form.system || NONE} onValueChange={setSystem} disabled={isSynced}>
                <SelectTrigger><SelectValue placeholder="Chọn cương vị" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không chọn —</SelectItem>
                  {visiblePositions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label={isSynced ? "Hệ Thống *" : "Hệ Thống"}>
              {lockDevice && initialDevice ? (
                <LockedValue primary={initialDevice.system || "Chưa xác định hệ thống"} secondary={initialDevice.systemSeq || undefined} />
              ) : (
                <EquipmentTreePicker
                  value={form.deviceSystemSeq}
                  position={form.system || null}
                  accessFilter="edit"
                  onChange={setDeviceSystemNode}
                  placeholder="Chọn hệ thống thiết bị"
                />
              )}
            </Row>
            <Row label={isSynced ? "Thiết Bị *" : "Thiết Bị"}>
              {lockDevice && initialDevice ? (
                <LockedValue primary={initialDevice.name} secondary={initialDevice.displayCode ?? initialDevice.code} />
              ) : (
                <Select value={selectedDeviceValue} onValueChange={setDevice}>
                  <SelectTrigger><SelectValue placeholder="Chọn thiết bị" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Không chọn —</SelectItem>
                    {deviceOptions.map((node) => (
                      <SelectItem key={node.seq} value={node.seq}>{node.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Row>
            <Row label="Thiết Bị Liên Quan">
              <div className="space-y-3">
                <EquipmentTreePicker
                  value={relatedPickerValue}
                  position={form.system || null}
                  accessFilter="edit"
                  includeLeaves
                  onChange={addRelatedDevice}
                  placeholder="Chọn thêm thiết bị liên quan"
                />
                {form.relatedDeviceSeqs.length > 0 ? (
                  <div className="space-y-2">
                    {form.relatedDeviceSeqs.map((seq) => {
                      const node = equipmentIndex.bySeq.get(seq);
                      return (
                        <div key={seq} className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                            <Plus className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-ink">{node?.name ?? seq}</div>
                            <div className="truncate font-mono text-[11px] text-muted-foreground">{seq}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => set("relatedDeviceSeqs", form.relatedDeviceSeqs.filter((item) => item !== seq))}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white hover:text-destructive"
                            aria-label={`Bỏ thiết bị ${node?.name ?? seq}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
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
                      Giữ phiếu trong mục Tồn đọng và chưa đưa vào lịch sử dù Google Sheet đã báo xử lý.
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
                <h3 className="font-bold text-emerald-900">Nội dung sẽ ghi vào lịch sử</h3>
                <p className="mt-1 text-sm text-emerald-800">
                  Dữ liệu nguồn được giữ nguyên; các mục chưa có sẽ được VHV bổ sung khi bấm xác nhận hoàn thành.
                </p>
              </div>

              <div className="grid gap-4 rounded-xl border border-border bg-white p-4 sm:grid-cols-2">
                <SourcePreviewValue label="Tổ máy" value={defect.unit || "—"} />
                <SourcePreviewValue label="Cương vị" value={defect.system || "—"} />
                <SourcePreviewValue label="Loại yêu cầu (PCT)" value={defect.requestType || "—"} />
                <SourcePreviewValue label="Số yêu cầu khiếm khuyết" value={defect.requestNumber || "—"} />
                <SourcePreviewValue label="Số phiếu công tác" value="Chưa nhập – bổ sung khi xác nhận" pending />
                <SourcePreviewValue
                  label="Ngày kết thúc"
                  value={defect.sourceCompletedAt ? formatDate(defect.sourceCompletedAt) : "Chưa có ngày kết thúc trên Google Sheet"}
                  pending={!defect.sourceCompletedAt}
                />
                <SourcePreviewValue
                  label="Thiết bị chính"
                  value={defect.device || "Chưa ánh xạ thiết bị"}
                  pending={!defect.device}
                />
                <SourcePreviewValue
                  label="Thiết bị liên quan"
                  value={defect.relatedDevices.length
                    ? defect.relatedDevices.map((item) => item.device.name || item.deviceSeq).join(", ")
                    : "Không có"}
                />
              </div>

              <div className="space-y-4 rounded-xl border border-border bg-white p-4">
                <SourcePreviewValue label="Nội dung thực hiện" value={defect.content || "—"} />
                <SourcePreviewValue
                  label="Kết quả thực hiện"
                  value={defect.note || defect.sourceStatusRaw || "Chưa nhập – bổ sung khi xác nhận"}
                  pending={!defect.note && !defect.sourceStatusRaw}
                />
                <SourcePreviewValue label="Trạng thái trên Google Sheet" value={defect.sourceStatusRaw || "—"} />
                <SourcePreviewValue label="Sửa chữa lặp lại" value={defect.repeatedRepairRaw || "—"} />
                <SourcePreviewValue label="Số lần nhắc lại" value={`${defect.reminderCount} lần`} />
                <SourcePreviewValue label="Hình ảnh kết quả" value="Chưa có – bổ sung khi xác nhận (tối đa 3 ảnh)" pending />
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
                    <h4 className="font-bold text-ink">{config.title}</h4>
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

        <div className={cn(!isSynced && step === 3 ? "block" : "hidden")}>
          <div className="mx-auto w-full max-w-2xl rounded-xl border border-border/80 bg-white p-5 shadow-sm">
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <StackField label="Yêu Cầu">
                  <Select value={form.requestType} onValueChange={(v) => set("requestType", v)}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEFECT_REQUEST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </StackField>
                <StackField label="Số Yêu Cầu">
                  <Input className="h-11" value={form.requestNumber} onChange={(e) => set("requestNumber", e.target.value)} />
                </StackField>
              </div>
              <StackField label="Nội Dung">
                <Textarea className="min-h-[88px] resize-y" value={form.content} onChange={(e) => set("content", e.target.value)} />
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
                    min={0}
                    step={1}
                    value={form.reminderCount}
                    onChange={(e) => {
                      const reminderCount = Math.max(0, Math.trunc(Number(e.target.value) || 0));
                      setForm((current) => ({
                        ...current,
                        reminderCount,
                        lastRemindedAt: reminderCount === 0 ? "" : current.lastRemindedAt,
                      }));
                    }}
                  />
                </StackField>
                <StackField label="Ngày Nhắc Lại Gần Nhất">
                  <Input
                    className="h-11"
                    type="date"
                    value={form.lastRemindedAt}
                    disabled={form.reminderCount === 0}
                    onChange={(e) => set("lastRemindedAt", e.target.value)}
                  />
                </StackField>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                Nút “Nhắc lại” trên danh sách sẽ tự tăng số lần và cập nhật ngày gần nhất.
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
            {step === 3 ? "Lưu hình ảnh" : "Lưu ánh xạ"}
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

function StackField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label className="text-sm font-semibold text-slate-600">{label}</Label>
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
