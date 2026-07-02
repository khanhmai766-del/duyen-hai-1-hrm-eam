"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateDefect, useUpdateDefect, type DefectItem } from "@/hooks/useDefects";
import { usePositions } from "@/hooks/useUsers";
import { useDevices } from "@/hooks/useDevices";
import { useEquipmentTree } from "@/hooks/useEquipment";
import { usePositionSystemScopes } from "@/hooks/usePositionSystemScopes";
import { EquipmentTreePicker } from "@/components/devices/equipment-tree-picker";
import {
  DEFECT_UNITS,
  DEFECT_SEVERITY,
  DEFECT_SEVERITY_ORDER,
  DEFECT_CONDITION,
  DEFECT_CONDITION_ORDER,
  DEFECT_REQUEST_TYPES,
  DEFECT_STATUS,
  DEFECT_STATUS_ORDER,
  isPositionAllowedForDefectUnit,
  isSelectableManagingPosition,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { createPositionAccessResolver } from "@/lib/position-system-scopes";
import { dedupeEquipmentLeafNodes } from "@/lib/equipment-tree";

function toDateInput(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

const NONE = "__none__";
const YES_NO_OPTIONS = ["Có", "Không"] as const;

export function DefectForm({
  defect,
  onDone,
  onCancel,
}: {
  defect?: DefectItem | null;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const isEdit = !!defect;
  const create = useCreateDefect();
  const update = useUpdateDefect();
  const [step, setStep] = React.useState<1 | 2>(1);

  // Cương vị lấy từ trường "Chức vụ" của Quản lý người dùng (distinct, bỏ trùng);
  // loại Quản đốc / Phó quản đốc / Thống kê / Kỹ thuật viên.
  const allPositions = usePositions();
  const positions = React.useMemo(() => allPositions.filter(isSelectableManagingPosition), [allPositions]);
  // Thiết bị lấy từ module Thiết bị.
  const { data: devicesData } = useDevices({});
  const { data: equipmentTreeData } = useEquipmentTree();
  const scopesQuery = usePositionSystemScopes();
  const devices = React.useMemo(() => devicesData?.data ?? [], [devicesData]);
  const equipmentNodes = React.useMemo(() => equipmentTreeData?.data ?? [], [equipmentTreeData]);
  const positionScopes = React.useMemo(() => scopesQuery.data?.data ?? [], [scopesQuery.data]);

  const [form, setForm] = React.useState({
    unit: defect?.unit ?? "",
    device: defect?.device ?? "",
    deviceSystem: "",
    deviceSystemSeq: "",
    system: defect?.system ?? "",
    severity: defect?.severity ?? "",
    condition: defect?.condition ?? "",
    fireSafetyImpact: defect?.fireSafetyImpact ?? "Không",
    environmentSafetyImpact: defect?.environmentSafetyImpact ?? "Không",
    requestType: defect?.requestType ?? "Cơ",
    requestNumber: defect?.requestNumber ?? "",
    content: defect?.content ?? "",
    status: defect?.status ?? "CHUA_XU_LY",
    detectedAt: toDateInput(defect?.detectedAt),
    note: defect?.note ?? "",
  });
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  // Cương vị mặc định theo từng Tổ máy (S1/S2/COMMON).
  const visiblePositions = React.useMemo(
    () => positions.filter((p) => isPositionAllowedForDefectUnit(form.unit, p)),
    [positions, form.unit]
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
    if (!selectedDevice) return;
    const systemSeq = systemSeqOfDevice(selectedDevice);
    const systemName = systemSeq ? equipmentIndex.bySeq.get(systemSeq)?.name ?? selectedDevice.system ?? "" : selectedDevice.system ?? "";
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
        system: device?.managingPosition ?? f.system,
      };
    });
  }

  // Tab "Thông tin chung" bắt buộc chọn đủ; trả về tên thẻ còn thiếu (nếu có).
  function missingGeneral(): string | null {
    if (!form.unit) return "Tổ máy";
    if (!form.system) return "Cương vị";
    if (!form.severity) return "Mức độ";
    if (!form.condition) return "Điều kiện thực hiện";
    return null;
  }
  function goNext() {
    const missing = missingGeneral();
    if (missing) return toast.error(`Vui lòng chọn ${missing}`);
    setStep(2);
  }

  async function submit() {
    const missing = missingGeneral();
    if (missing) { setStep(1); return toast.error(`Vui lòng chọn ${missing}`); }
    const { deviceSystem: _deviceSystem, deviceSystemSeq: _deviceSystemSeq, ...defectForm } = form;
    const payload = { ...defectForm, detectedAt: form.detectedAt || null };
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
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex justify-center gap-6 border-b border-border">
        <TabBtn active={step === 1} onClick={() => setStep(1)} label="Thông tin chung" />
        <TabBtn active={step === 2} onClick={goNext} label="Thông tin khiếm khuyết" />
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className={cn(step === 1 ? "block" : "hidden")}>
          <div className="mx-auto max-w-xl space-y-5">
            <Row label="Tổ Máy *">
              <div className="grid grid-cols-3 gap-2">
                {DEFECT_UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => selectUnit(u)}
                    className={cn(
                      "h-10 rounded-md border text-sm font-medium transition-colors",
                      form.unit === u ? "border-navy bg-navy text-white" : "border-input bg-muted/40 text-ink hover:border-accent"
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Cương Vị *">
              <Select value={form.system || NONE} onValueChange={setSystem}>
                <SelectTrigger><SelectValue placeholder="Chọn cương vị" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không chọn —</SelectItem>
                  {visiblePositions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Hệ Thống">
              <EquipmentTreePicker
                value={form.deviceSystemSeq}
                position={form.system || null}
                accessFilter="edit"
                onChange={setDeviceSystemNode}
                placeholder="Chọn hệ thống thiết bị"
              />
            </Row>
            <Row label="Thiết Bị">
              <Select value={selectedDeviceValue} onValueChange={setDevice}>
                <SelectTrigger><SelectValue placeholder="Chọn thiết bị" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không chọn —</SelectItem>
                  {deviceOptions.map((node) => (
                    <SelectItem key={node.seq} value={node.seq}>{node.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Mức Độ *">
              <Select value={form.severity || NONE} onValueChange={(v) => set("severity", v === NONE ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Chọn mức độ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không chọn —</SelectItem>
                  {DEFECT_SEVERITY_ORDER.map((s) => <SelectItem key={s} value={s}>{DEFECT_SEVERITY[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Điều Kiện Thực Hiện *">
              <Select value={form.condition || NONE} onValueChange={(v) => set("condition", v === NONE ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Chọn điều kiện" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không chọn —</SelectItem>
                  {DEFECT_CONDITION_ORDER.map((c) => <SelectItem key={c} value={c}>{DEFECT_CONDITION[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Ảnh hưởng PCCC">
              <Select value={form.fireSafetyImpact} onValueChange={(v) => set("fireSafetyImpact", v)}>
                <SelectTrigger><SelectValue placeholder="Chọn ảnh hưởng PCCC" /></SelectTrigger>
                <SelectContent>
                  {YES_NO_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Môi trường, ATVSLĐ">
              <Select value={form.environmentSafetyImpact} onValueChange={(v) => set("environmentSafetyImpact", v)}>
                <SelectTrigger><SelectValue placeholder="Chọn ảnh hưởng môi trường, ATVSLĐ" /></SelectTrigger>
                <SelectContent>
                  {YES_NO_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Ngày Phát Hiện">
              <Input type="date" value={form.detectedAt} onChange={(e) => set("detectedAt", e.target.value)} />
            </Row>
          </div>
        </div>
        <div className={cn(step === 2 ? "block" : "hidden")}>
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
              <StackField label="Ghi Chú">
                <Textarea className="min-h-[88px] resize-y" value={form.note} onChange={(e) => set("note", e.target.value)} />
              </StackField>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-border p-4">
        {step === 2 && (
          <Button type="button" variant="outline" onClick={() => setStep(1)}>
            <ChevronLeft className="h-4 w-4" /> Trước
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => onCancel?.()}>Hủy bỏ</Button>
        {step === 1 ? (
          <Button type="button" onClick={goNext}>
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
