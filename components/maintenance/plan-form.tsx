"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDevices } from "@/hooks/useDevices";
import { useUsers } from "@/hooks/useUsers";
import { useCreatePlan, useUpdatePlan, type MaintenancePlanItem } from "@/hooks/useMaintenance";
import { MAINTENANCE_INTERVALS, PRIORITY_ORDER, PRIORITY, addDays } from "@/lib/constants";

function toDateInput(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function PlanForm({
  plan,
  deviceId,
  onDone,
}: {
  plan?: MaintenancePlanItem | null;
  /** Khoá thiết bị (vd khi tạo từ trang chi tiết thiết bị). */
  deviceId?: string;
  onDone?: () => void;
}) {
  const isEdit = !!plan;
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const { data: devicesData } = useDevices({});
  const { data: usersData } = useUsers();
  const devices = devicesData?.data ?? [];
  const users = usersData?.data ?? [];

  const [form, setForm] = React.useState({
    deviceId: plan?.deviceId ?? deviceId ?? "",
    title: plan?.title ?? "",
    description: plan?.description ?? "",
    intervalDays: String(plan?.intervalDays ?? 30),
    priority: plan?.priority ?? "MEDIUM",
    assigneeId: plan?.assigneeId ?? "",
    nextDueAt: toDateInput(plan?.nextDueAt) || toDateInput(addDays(new Date(), plan?.intervalDays ?? 30)),
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Khi đổi chu kỳ lúc tạo mới, gợi ý lại ngày đến hạn = hôm nay + chu kỳ.
  function onIntervalChange(days: string) {
    setForm((f) => ({
      ...f,
      intervalDays: days,
      nextDueAt: isEdit ? f.nextDueAt : toDateInput(addDays(new Date(), Number(days) || 30)),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.deviceId) return toast.error("Vui lòng chọn thiết bị");
    if (!form.title.trim()) return toast.error("Vui lòng nhập tên công việc");
    const payload = {
      ...form,
      intervalDays: Number(form.intervalDays),
      assigneeId: form.assigneeId || null,
    };
    try {
      if (isEdit) await update.mutateAsync({ id: plan!.id, ...payload });
      else await create.mutateAsync(payload);
      toast.success(isEdit ? "Đã cập nhật kế hoạch" : "Đã tạo kế hoạch bảo trì");
      onDone?.();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Thiết bị *" className="sm:col-span-2">
        <Select value={form.deviceId} onValueChange={(v) => set("deviceId", v)} disabled={!!deviceId || isEdit}>
          <SelectTrigger><SelectValue placeholder="Chọn thiết bị" /></SelectTrigger>
          <SelectContent>
            {devices.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.code} — {d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Tên công việc *" className="sm:col-span-2">
        <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Vệ sinh, kiểm tra, hiệu chuẩn..." required />
      </Field>

      <Field label="Mô tả" className="sm:col-span-2">
        <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Nội dung công việc cần thực hiện..." />
      </Field>

      <Field label="Chu kỳ *">
        <Select value={form.intervalDays} onValueChange={onIntervalChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {MAINTENANCE_INTERVALS.map((i) => (
              <SelectItem key={i.days} value={String(i.days)}>{i.label} ({i.days} ngày)</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Đến hạn kế tiếp *">
        <Input type="date" value={form.nextDueAt} onChange={(e) => set("nextDueAt", e.target.value)} required />
      </Field>

      <Field label="Mức ưu tiên">
        <Select value={form.priority} onValueChange={(v) => set("priority", v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRIORITY_ORDER.map((p) => (
              <SelectItem key={p} value={p}>{PRIORITY[p].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Người phụ trách">
        <Select value={form.assigneeId || "NONE"} onValueChange={(v) => set("assigneeId", v === "NONE" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Chưa phân công" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">Chưa phân công</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}{u.position ? ` — ${u.position}` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="flex justify-end gap-2 pt-1 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? "Lưu thay đổi" : "Tạo kế hoạch"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}
