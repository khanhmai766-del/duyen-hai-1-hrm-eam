"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Loader2, ChevronRight, ChevronLeft } from "lucide-react";
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
import { cn, formatDateInput } from "@/lib/utils";
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
  onCancel?: () => void;
}) {
  const isEdit = !!defect;
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
    const missing = missingGeneral();
    if (missing) { setStep(1); return toast.error(`Vui lòng chọn ${missing}`); }
    if (!form.severity) { setStep(2); return toast.error("Vui lòng chọn Mức độ"); }
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
    <div className="flex min-h-0 h-full flex-col">
      {/* Tabs */}
      <div className="flex shrink-0 justify-center gap-3 overflow-x-auto border-b border-border px-3 sm:gap-6">
        <TabBtn active={step === 1} onClick={() => setStep(1)} label="Thông tin chung" />
        <TabBtn active={step === 2} onClick={goToSeverity} label="Mức độ" />
        <TabBtn active={step === 3} onClick={goToDefectInfo} label="Thông tin khiếm khuyết" />
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
              )}
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
            <Row label="Thiết Bị">
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
            <Row label="Trưởng Ca *">
              <Select value={form.shiftLeaderId || NONE} onValueChange={(value) => set("shiftLeaderId", value === NONE ? "" : value)}>
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
        <div className={cn(step === 2 ? "block" : "hidden")}>
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
        <div className={cn(step === 3 ? "block" : "hidden")}>
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
        {step > 1 && (
          <Button type="button" variant="outline" onClick={() => setStep(step === 3 ? 2 : 1)}>
            <ChevronLeft className="h-4 w-4" /> Trước
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => onCancel?.()}>Hủy bỏ</Button>
        {step < 3 ? (
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

function LockedValue({ primary, secondary }: { primary: string; secondary?: string }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5">
      <div className="text-sm font-semibold text-ink">{primary}</div>
      {secondary && <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{secondary}</div>}
    </div>
  );
}
