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
import {
  DEFECT_UNITS,
  DEFECT_SEVERITY,
  DEFECT_SEVERITY_ORDER,
  DEFECT_CONDITION,
  DEFECT_CONDITION_ORDER,
  DEFECT_REQUEST_TYPES,
  DEFECT_STATUS,
  DEFECT_STATUS_ORDER,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

function toDateInput(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

const NONE = "__none__";

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

  // Cương vị lấy từ trường "Chức vụ" của Quản lý người dùng (distinct, bỏ trùng).
  const positions = usePositions();
  // Thiết bị lấy từ module Thiết bị.
  const { data: devicesData } = useDevices({});
  const devices = devicesData?.data ?? [];

  const [form, setForm] = React.useState({
    unit: defect?.unit ?? "",
    device: defect?.device ?? "",
    system: defect?.system ?? "",
    severity: defect?.severity ?? "",
    condition: defect?.condition ?? "",
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
  const filteredDevices = React.useMemo(
    () => devices.filter((d) => !form.system || d.managingPosition === form.system),
    [devices, form.system]
  );
  function setSystem(v: string) {
    setForm((f) => {
      const system = v === NONE ? "" : v;
      const selectedDevice = devices.find((d) => d.code === f.device);
      return {
        ...f,
        system,
        device: selectedDevice && selectedDevice.managingPosition !== system ? "" : f.device,
      };
    });
  }
  function setDevice(v: string) {
    setForm((f) => {
      const device = v === NONE ? null : devices.find((d) => d.code === v);
      return {
        ...f,
        device: device?.code ?? "",
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
    const payload = { ...form, detectedAt: form.detectedAt || null };
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
        {step === 1 ? (
          <div className="mx-auto max-w-xl space-y-5">
            <Row label="Tổ Máy *">
              <div className="grid grid-cols-2 gap-2">
                {DEFECT_UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => set("unit", u)}
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
                  {positions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Thiết Bị">
              <Select value={form.device || NONE} onValueChange={setDevice}>
                <SelectTrigger><SelectValue placeholder="Chọn thiết bị" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không chọn —</SelectItem>
                  {filteredDevices.map((d) => <SelectItem key={d.id} value={d.code}>{d.code} — {d.name}</SelectItem>)}
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
            <Row label="Ngày Phát Hiện">
              <Input type="date" value={form.detectedAt} onChange={(e) => set("detectedAt", e.target.value)} />
            </Row>
          </div>
        ) : (
          <div className="mx-auto max-w-xl space-y-5">
            <Row label="Yêu Cầu">
              <Select value={form.requestType} onValueChange={(v) => set("requestType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEFECT_REQUEST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Số Yêu Cầu">
              <Input value={form.requestNumber} onChange={(e) => set("requestNumber", e.target.value)} />
            </Row>
            <Row label="Nội Dung">
              <Textarea value={form.content} onChange={(e) => set("content", e.target.value)} rows={2} />
            </Row>
            <Row label="Tình Trạng Khiếm Khuyết">
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEFECT_STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{DEFECT_STATUS[s].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Ghi Chú">
              <Textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} />
            </Row>
          </div>
        )}
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-center gap-4">
      <Label className="whitespace-nowrap text-right text-muted-foreground">{label}</Label>
      <div>{children}</div>
    </div>
  );
}
