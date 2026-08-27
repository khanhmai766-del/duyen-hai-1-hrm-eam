"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EquipmentTreePicker, type PickerEquipmentNode } from "@/components/devices/equipment-tree-picker";
import { useEquipmentNode } from "@/hooks/useEquipment";
import { useUpdateReplacement, type ReplacementItem } from "@/hooks/useReplacements";
import { usePositions } from "@/hooks/useUsers";
import { addMonths } from "@/lib/constants";
import { positionLabelOf } from "@/lib/position-catalog";
import { selectableManagingPositionOptions } from "@/lib/positions";
import { parseScopeParam } from "@/lib/equipment-units";
import { formatDateInput } from "@/lib/utils";

function toDateInput(v: Date | string | null | undefined): string {
  return formatDateInput(v);
}

const NO_POSITION = "__none__";

export function ReplacementPointForm({
  materialId,
  point,
  defaultSystem,
  onDone,
}: {
  materialId: string;
  point?: ReplacementItem | null;
  /** Hệ thống mặc định khi tạo mới — lấy theo hệ thống của vật tư. */
  defaultSystem?: string | null;
  onDone?: () => void;
}) {
  const update = useUpdateReplacement();
  const allPositions = usePositions();
  const devicePositions = React.useMemo(
    () => selectableManagingPositionOptions(allPositions),
    [allPositions]
  );
  const scope = parseScopeParam(point?.machine) ?? undefined;

  const [form, setForm] = React.useState({
    deviceId: point?.deviceId ?? "",
    managingPosition: positionLabelOf(point?.managingPosition),
    system: point ? (point.system ?? "") : (defaultSystem ?? ""),
    intervalMonths: String(point?.intervalMonths ?? 6),
    intervalNote: point?.intervalNote ?? "",
    lastReplacedAt: toDateInput(point?.lastReplacedAt),
    nextDueAt: toDateInput(point?.nextDueAt),
    note: point?.note ?? "",
    samplingOnly: point?.samplingOnly === true,
  });
  const [selectedParentSeq, setSelectedParentSeq] = React.useState<string | null>(null);
  const parentQuery = useEquipmentNode(
    selectedParentSeq,
    scope,
    "replacement-manage",
    form.managingPosition || null
  );

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function setDevice(node: PickerEquipmentNode | null) {
    setSelectedParentSeq(node?.parentSeq ?? null);
    setForm((current) => ({
      ...current,
      deviceId: node?.seq ?? "",
      // Khi chọn node lá, tên hệ thống cha được lấy bằng đúng API node nhẹ bên dưới.
      // Giữ rỗng trong lúc tải để không vô tình lưu tên hệ thống của thiết bị trước.
      system: node?.hasChildren ? node.name : "",
    }));
  }
  function setPosition(position: string) {
    const managingPosition = position === NO_POSITION ? "" : position;
    setSelectedParentSeq(null);
    setForm((current) => current.managingPosition === managingPosition
      ? current
      : { ...current, managingPosition, deviceId: "", system: "" });
  }

  React.useEffect(() => {
    const parent = parentQuery.data?.data;
    if (!selectedParentSeq || !parent || parent.seq !== selectedParentSeq) return;
    setForm((current) => current.system === parent.name
      ? current
      : { ...current, system: parent.name });
  }, [parentQuery.data, selectedParentSeq]);

  function recompute(next: typeof form) {
    const base = next.lastReplacedAt ? new Date(next.lastReplacedAt) : new Date();
    const months = Number(next.intervalMonths) || 0;
    return months > 0 ? toDateInput(addMonths(base, months)) : next.nextDueAt;
  }
  function onIntervalChange(v: string) {
    setForm((f) => ({ ...f, intervalMonths: v, nextDueAt: recompute({ ...f, intervalMonths: v }) }));
  }
  function onLastChange(v: string) {
    setForm((f) => ({ ...f, lastReplacedAt: v, nextDueAt: recompute({ ...f, lastReplacedAt: v }) }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.managingPosition) return toast.error("Vui lòng chọn cương vị");
    if (!form.system) return toast.error("Vui lòng chọn hệ thống");
    if (!form.deviceId) return toast.error("Vui lòng chọn thiết bị");
    if (Number(form.intervalMonths) > 0 && !form.nextDueAt) return toast.error("Vui lòng nhập ngày đến hạn");

    const payload = {
      materialId,
      deviceId: form.deviceId,
      location: null,
      system: form.system || null,
      managingPosition: form.managingPosition,
      intervalMonths: Number(form.intervalMonths),
      intervalNote: form.intervalNote,
      lastReplacedAt: form.lastReplacedAt || null,
      nextDueAt: form.nextDueAt || null,
      note: form.note,
      samplingOnly: form.samplingOnly,
    };
    try {
      if (!point) return toast.error("Không tìm thấy điểm thay thế cần cập nhật");
      await update.mutateAsync({ id: point.id, ...payload });
      toast.success("Đã cập nhật điểm thay thế");
      onDone?.();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const pending = update.isPending;

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label className="mb-1.5 block">Cương vị *</Label>
        <Select value={form.managingPosition || NO_POSITION} onValueChange={setPosition}>
          <SelectTrigger><SelectValue placeholder="Chọn cương vị" /></SelectTrigger>
          <SelectContent>
            {devicePositions.map((position) => (
              <SelectItem key={position} value={position}>{position}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="sm:col-span-2">
        <Label className="mb-1.5 block">Thiết bị *</Label>
        <EquipmentTreePicker
          value={form.deviceId}
          onChange={setDevice}
          position={form.managingPosition || null}
          accessFilter="edit"
          includeLeaves
          leafOnly
          scope={scope}
          permissionScope="replacement-manage"
          placeholder={form.managingPosition ? "Chọn hoặc tìm thiết bị" : "Chọn cương vị trước"}
          disabled={!form.managingPosition}
          allowClear={false}
          selectionLabel={form.deviceId === point?.deviceId ? point?.device?.name : undefined}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {parentQuery.isLoading
            ? "Đang xác định hệ thống cha…"
            : form.system
              ? <>Hệ thống: <b className="font-medium text-ink">{form.system}</b></>
              : "Tìm theo tên, mã KKS hoặc bung cây đến thiết bị cần chọn."}
        </p>
      </div>

      <Field label="Chu kỳ thay thế (tháng) *">
        <Input type="number" min={0} value={form.intervalMonths} onChange={(e) => onIntervalChange(e.target.value)} />
        <p className="mt-1 text-xs text-muted-foreground">Nhập 0 để không theo dõi lịch thay thế</p>
      </Field>
      <Field label="Ghi chú chu kỳ">
        <Input value={form.intervalNote} onChange={(e) => set("intervalNote", e.target.value)} placeholder="VD: 2500h" />
      </Field>

      {/* Đổi được nhóm sau khi tạo: điểm lỡ khai là thay thế định kỳ có thể
          chuyển sang chỉ lấy mẫu mà không phải xoá rồi tạo lại. */}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2.5 sm:col-span-2">
        <input
          type="checkbox"
          checked={form.samplingOnly}
          onChange={(e) => set("samplingOnly", e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#00558F]"
        />
        <span className="text-sm leading-5">
          <span className="font-semibold text-ink">Vật tư lấy mẫu định kỳ</span>
          <span className="block text-xs text-muted-foreground">
            Theo O&amp;M chỉ lấy mẫu, theo dõi hoặc châm bổ sung — không thay thế định kỳ.
            Vẫn nhắc theo chu kỳ nhưng hiển thị riêng và không tính vào cảnh báo quá hạn thay thế.
          </span>
        </span>
      </label>

      <Field label="Lần thay gần nhất">
        <Input type="date" value={form.lastReplacedAt} onChange={(e) => onLastChange(e.target.value)} />
      </Field>
      <Field label={Number(form.intervalMonths) > 0 ? "Đến hạn kế tiếp *" : "Đến hạn kế tiếp"}>
        <Input type="date" value={form.nextDueAt} onChange={(e) => set("nextDueAt", e.target.value)} required={Number(form.intervalMonths) > 0} disabled={Number(form.intervalMonths) === 0} />
      </Field>

      <Field label="Ghi chú" className="sm:col-span-2">
        <Textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} placeholder="Ghi chú thêm..." />
      </Field>

      <div className="flex justify-end gap-2 pt-1 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Lưu thay đổi
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
