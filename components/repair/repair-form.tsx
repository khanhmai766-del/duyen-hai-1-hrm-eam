"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateRepair, useUpdateRepair } from "@/hooks/useRepair";
import { useDevices } from "@/hooks/useDevices";
import { useEquipmentTree } from "@/hooks/useEquipment";
import { useCurrentPosition } from "@/hooks/useCurrentPosition";
import { usePositionSystemScopes } from "@/hooks/usePositionSystemScopes";
import { usePositions } from "@/hooks/useUsers";
import { isSelectableManagingPosition, PRIORITY, PRIORITY_ORDER, REPAIR_STATUS, REPAIR_STATUS_ORDER } from "@/lib/constants";
import { createPositionAccessResolver } from "@/lib/position-system-scopes";
import { formatDateTimeInput } from "@/lib/utils";
import type { RepairLogWithRelations } from "@/types";

export function RepairForm({
  repair,
  defaultDeviceId,
  onDone,
}: {
  repair?: RepairLogWithRelations | null;
  defaultDeviceId?: string;
  onDone?: () => void;
}) {
  const create = useCreateRepair();
  const update = useUpdateRepair();
  const currentPosition = useCurrentPosition();
  const { data: devicesData } = useDevices({});
  const { data: equipmentTreeData } = useEquipmentTree();
  const scopesQuery = usePositionSystemScopes();
  const allPositions = usePositions();
  const positions = React.useMemo(() => allPositions.filter(isSelectableManagingPosition), [allPositions]);
  const devices = React.useMemo(() => devicesData?.data ?? [], [devicesData]);
  const equipmentNodes = React.useMemo(() => equipmentTreeData?.data ?? [], [equipmentTreeData]);
  const positionScopes = React.useMemo(() => scopesQuery.data?.data ?? [], [scopesQuery.data]);
  const isEdit = !!repair;
  const [deviceSearch, setDeviceSearch] = React.useState("");
  const [selectedPosition, setSelectedPosition] = React.useState(() => {
    const current = currentPosition.position;
    return isSelectableManagingPosition(current) ? current : "";
  });

  const [form, setForm] = React.useState({
    deviceId: repair?.deviceId ?? defaultDeviceId ?? "",
    title: repair?.title ?? "",
    symptom: repair?.symptom ?? "",
    cause: repair?.cause ?? "",
    action: repair?.action ?? "",
    result: repair?.result ?? "",
    description: repair?.description ?? "",
    priority: repair?.priority ?? "MEDIUM",
    status: repair?.status ?? "OPEN",
    startedAt: repair?.startedAt ? formatDateTimeInput(repair.startedAt) : formatDateTimeInput(),
    completedAt: repair?.completedAt ? formatDateTimeInput(repair.completedAt) : "",
    cost: repair?.cost?.toString() ?? "",
    downtime: repair?.downtime?.toString() ?? "",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  React.useEffect(() => {
    const current = currentPosition.position;
    if (!selectedPosition && isSelectableManagingPosition(current)) setSelectedPosition(current);
  }, [currentPosition.position, selectedPosition]);

  const accessResolver = React.useMemo(
    () => createPositionAccessResolver(selectedPosition, equipmentNodes, positionScopes),
    [selectedPosition, equipmentNodes, positionScopes]
  );

  const filteredDevices = React.useMemo(() => {
    const query = deviceSearch.toLowerCase();
    return devices.filter((d) => {
      const matchesSearch = !query || `${d.code} ${d.name}`.toLowerCase().includes(query);
      const matchesPosition =
        !selectedPosition ||
        d.id === form.deviceId ||
        accessResolver.accessForDevice(d) !== "none";
      return matchesSearch && matchesPosition;
    });
  }, [accessResolver, deviceSearch, devices, form.deviceId, selectedPosition]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.deviceId) return toast.error("Vui lòng chọn thiết bị");
    if (!form.title || !form.action) return toast.error("Nhập tiêu đề và hành động");
    try {
      const payload = {
        ...form,
        cost: form.cost ? Number(form.cost) : null,
        downtime: form.downtime ? Number(form.downtime) : null,
        completedAt: form.completedAt || null,
      };
      if (isEdit) await update.mutateAsync({ id: repair!.id, ...payload });
      else await create.mutateAsync(payload as any);
      toast.success(isEdit ? "Đã cập nhật phiếu" : "Đã tạo phiếu sửa chữa");
      onDone?.();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label className="mb-1.5 block">Cương vị quản lý</Label>
        <Select
          value={selectedPosition || "NONE"}
          onValueChange={(value) => {
            const nextPosition = value === "NONE" ? "" : value;
            setSelectedPosition(nextPosition);
            const selectedDevice = devices.find((device) => device.id === form.deviceId);
            const nextResolver = createPositionAccessResolver(nextPosition, equipmentNodes, positionScopes);
            if (selectedDevice && nextPosition && nextResolver.accessForDevice(selectedDevice) === "none") {
              set("deviceId", "");
            }
          }}
          disabled={isEdit}
        >
          <SelectTrigger><SelectValue placeholder="Chọn cương vị để lọc thiết bị" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">— Không lọc —</SelectItem>
            {positions.map((position) => (
              <SelectItem key={position} value={position}>{position}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-1.5 block">Thiết bị *</Label>
        {!isEdit && (
          <Input
            placeholder="Tìm thiết bị..."
            value={deviceSearch}
            onChange={(e) => setDeviceSearch(e.target.value)}
            className="mb-2"
          />
        )}
        <Select value={form.deviceId} onValueChange={(v) => set("deviceId", v)} disabled={isEdit}>
          <SelectTrigger><SelectValue placeholder="Chọn thiết bị" /></SelectTrigger>
          <SelectContent>
            {filteredDevices.slice(0, 50).map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.code} — {d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-1.5 block">Tiêu đề *</Label>
        <Input value={form.title} onChange={(e) => set("title", e.target.value)} required />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label className="mb-1.5 block">Hiện tượng</Label>
          <Textarea value={form.symptom} onChange={(e) => set("symptom", e.target.value)} rows={2} />
        </div>
        <div>
          <Label className="mb-1.5 block">Nguyên nhân</Label>
          <Textarea value={form.cause} onChange={(e) => set("cause", e.target.value)} rows={2} />
        </div>
      </div>

      <div>
        <Label className="mb-1.5 block">Hành động xử lý *</Label>
        <Textarea value={form.action} onChange={(e) => set("action", e.target.value)} rows={2} required />
      </div>
      <div>
        <Label className="mb-1.5 block">Kết quả</Label>
        <Textarea value={form.result} onChange={(e) => set("result", e.target.value)} rows={2} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="mb-1.5 block">Mức ưu tiên</Label>
          <Select value={form.priority} onValueChange={(v) => set("priority", v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITY_ORDER.map((p) => <SelectItem key={p} value={p}>{PRIORITY[p].label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1.5 block">Trạng thái</Label>
          <Select value={form.status} onValueChange={(v) => set("status", v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {REPAIR_STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{REPAIR_STATUS[s].label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1.5 block">Bắt đầu</Label>
          <Input type="datetime-local" value={form.startedAt} onChange={(e) => set("startedAt", e.target.value)} />
        </div>
        <div>
          <Label className="mb-1.5 block">Hoàn thành</Label>
          <Input type="datetime-local" value={form.completedAt} onChange={(e) => set("completedAt", e.target.value)} />
        </div>
        <div>
          <Label className="mb-1.5 block">Chi phí (VND)</Label>
          <Input type="number" value={form.cost} onChange={(e) => set("cost", e.target.value)} />
        </div>
        <div>
          <Label className="mb-1.5 block">Thời gian dừng (phút)</Label>
          <Input type="number" value={form.downtime} onChange={(e) => set("downtime", e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? "Lưu thay đổi" : "Tạo phiếu"}
        </Button>
      </div>
    </form>
  );
}
