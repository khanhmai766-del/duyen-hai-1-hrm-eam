"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EquipmentTreePicker, type PickerEquipmentNode } from "@/components/devices/equipment-tree-picker";
import { LubricantMaterialPicker } from "@/components/materials/lubricant-material-picker";
import { useCreateReplacement, useLubricantMaterials, useUpdateLubricantRowLink } from "@/hooks/useReplacements";
import { excelIntervalMonths, parseExcelLastDate } from "@/lib/lubricant-excel-dates";
import { foldVn } from "@/lib/vibration/parse";
import { usePositions } from "@/hooks/useUsers";
import { lubricantNextDue } from "@/lib/constants";
import { selectableManagingPositionOptions } from "@/lib/positions";
import { parseScopeParam } from "@/lib/equipment-units";
import { formatDateInput } from "@/lib/utils";

const MACHINES = ["S1", "S2", "COMMON"] as const;
const CUSTOM_GROUP = "__custom__";
const AUTO_POSITION = "__auto__";

/** Tổ máy mặc định theo nhóm: "Lò S1"/"Tuabin S2" → S1/S2, còn lại (BOP, Máy nén khí, Điện) → COMMON. */
export const defaultMachineOfGroup = (group: string) => /S([12])$/.exec(group.trim())?.[0] ?? "COMMON";

/** Dòng Excel "Theo Excel"/"Chưa liên kết" cần tạo điểm thay thế rồi liên kết. */
export type LubricantExcelSource = { sourceKey: string; group: string; cells: string[]; lastDate?: string };

/** Khớp dầu trong Excel với danh mục: ưu tiên mã, sau đó tên dài nhất nằm trong ô "Loại dầu". */
function matchExcelMaterial<M extends { id: string; code: string; name: string; machine: string | null }>(materials: M[], cells: string[], machine: string) {
  const pool = materials.filter((material) => !material.machine || material.machine === machine);
  const code = cells[4]?.trim();
  const byCode = code && pool.find((material) => material.code === code);
  if (byCode) return byCode;
  const text = foldVn(cells[3] ?? "").replace(/\s+/g, " ");
  return pool
    .filter((material) => {
      const name = foldVn(material.name).replace(/^(dau|mo)\s+(nhon\s+|boi tron\s+)?/, "").trim();
      return name.length > 3 && text.includes(name);
    })
    .sort((a, b) => b.name.length - a.name.length)[0];
}

/** Hộp thoại thêm một điểm theo dõi dầu mỡ (tạo qua POST /api/material-replacements).
 *  Có `fromExcel`: điền sẵn theo dòng Excel, tạo xong thì liên kết dòng đó với điểm mới. */
export function LubricantPointDialog({ open, onOpenChange, groupNames, defaultGroup, fromExcel }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupNames: string[];
  defaultGroup?: string;
  fromExcel?: LubricantExcelSource | null;
}) {
  const create = useCreateReplacement();
  const link = useUpdateLubricantRowLink();
  const materialsQuery = useLubricantMaterials(open);
  const allPositions = usePositions();
  const positions = React.useMemo(() => selectableManagingPositionOptions(allPositions), [allPositions]);
  const initial = React.useCallback(() => {
    const wanted = fromExcel?.group ?? defaultGroup;
    const group = wanted && groupNames.includes(wanted) ? wanted : groupNames[0] ?? CUSTOM_GROUP;
    const cells = fromExcel?.cells ?? [];
    // Ô ngày Excel: "07/07/2025" hoặc chỉ tháng "05/2025" (lấy ngày 1).
    const parsed = parseExcelLastDate(cells[6]);
    const monthOnly = /^\s*(\d{1,2})\/(\d{4})\s*$/.exec(cells[6] ?? "");
    const excelDate = fromExcel?.lastDate
      || (parsed ? formatDateInput(parsed) : monthOnly ? `${monthOnly[2]}-${monthOnly[1].padStart(2, "0")}-01` : "");
    const excelPosition = foldVn(cells[1] ?? "").trim();
    const position = excelPosition
      ? positions.find((name) => foldVn(name) === excelPosition)
        ?? positions.find((name) => excelPosition.startsWith(foldVn(name)))
      : undefined;
    return {
      groupChoice: group, customGroup: "", machine: defaultMachineOfGroup(group), position: position ?? AUTO_POSITION,
      freeLocation: false, deviceId: "", deviceName: "", location: cells[2]?.trim() ?? "",
      materialIds: [] as string[], alternateIds: [] as string[], materialMatched: !fromExcel,
      quantity: fromExcel ? String(Number(/\d+(?:[.,]\d+)?/.exec(cells[5] ?? "")?.[0].replace(",", ".") ?? 0) || 0) : "0",
      intervalMonths: String((fromExcel && excelIntervalMonths(cells[7])) || 6), intervalNote: "",
      lastReplacedAt: excelDate || formatDateInput(),
    };
  }, [defaultGroup, groupNames, fromExcel, positions]);
  const [form, setForm] = React.useState(initial);
  const [wasOpen, setWasOpen] = React.useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(initial());
  }
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

  const materials = materialsQuery.data ?? [];
  // Dầu của dòng Excel được khớp khi danh mục dầu đã tải xong (một lần mỗi lần mở).
  if (open && fromExcel && !form.materialMatched && materials.length) {
    const found = matchExcelMaterial(materials, fromExcel.cells, form.machine);
    setForm((current) => ({ ...current, materialMatched: true, materialIds: found ? [found.id] : current.materialIds }));
  }
  const mainId = form.materialIds[0];
  const main = materials.find((material) => material.id === mainId);
  const group = form.groupChoice === CUSTOM_GROUP ? form.customGroup.trim() : form.groupChoice;

  function setGroup(choice: string) {
    setForm((current) => ({
      ...current, groupChoice: choice,
      machine: choice === CUSTOM_GROUP ? current.machine : defaultMachineOfGroup(choice),
      materialIds: [], alternateIds: [], deviceId: "", deviceName: "",
    }));
  }
  function setMachine(machine: string) {
    setForm((current) => ({ ...current, machine, materialIds: [], alternateIds: [], deviceId: "", deviceName: "" }));
  }
  function pickDevice(node: PickerEquipmentNode | null) {
    setForm((current) => ({ ...current, deviceId: node?.seq ?? "", deviceName: node?.name ?? "" }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!group) return toast.error("Chọn hoặc nhập nhóm/khu vực");
    if (!main) return toast.error("Chọn dầu mỡ chính trong danh mục");
    const months = Math.round(Number(form.intervalMonths));
    if (!Number.isFinite(months) || months <= 0) return toast.error("Chu kỳ phải lớn hơn 0 tháng");
    if (form.freeLocation ? !form.location.trim() : !form.deviceId) return toast.error(form.freeLocation ? "Nhập vị trí thiết bị" : "Chọn thiết bị");
    const position = form.position === AUTO_POSITION ? "" : form.position;
    if (form.freeLocation && !position) return toast.error("Chọn cương vị quản lý");
    if (!form.lastReplacedAt) return toast.error("Nhập ngày thay gần nhất để tính hạn");
    const nextDueAt = lubricantNextDue(form.lastReplacedAt, months);
    try {
      const created = await create.mutateAsync({
        materialId: main.id,
        alternateMaterialIds: form.alternateIds,
        deviceSeq: form.freeLocation ? undefined : form.deviceId,
        location: form.freeLocation ? form.location.trim() : undefined,
        system: form.freeLocation ? main.system ?? group : undefined,
        managingPosition: position || undefined,
        lubricantGroup: group,
        quantity: Number(form.quantity) || 0,
        intervalMonths: months,
        intervalNote: form.intervalNote,
        lastReplacedAt: form.lastReplacedAt,
        nextDueAt: nextDueAt ? formatDateInput(nextDueAt) : undefined,
      });
      if (fromExcel) await link.mutateAsync({ sourceKey: fromExcel.sourceKey, mode: "point", replacementId: created.id });
      toast.success(fromExcel ? "Đã tạo điểm thay thế và liên kết dòng Excel" : "Đã thêm thiết bị theo dõi dầu mỡ");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thêm được thiết bị");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!create.isPending && !link.isPending) onOpenChange(next); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{fromExcel ? "Tạo điểm thay thế từ dòng Excel" : "Thêm thiết bị theo dõi dầu mỡ"}</DialogTitle>
          {fromExcel && (
            <p className="text-sm text-muted-foreground">
              {fromExcel.cells[2]} · {fromExcel.cells[3]?.split(/\n/)[0]} — chọn thiết bị trên cây, lưu xong dòng chuyển sang “Đã liên kết”.
            </p>
          )}
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block">Nhóm / khu vực *</Label>
            <Select value={form.groupChoice} onValueChange={setGroup}>
              <SelectTrigger aria-label="Nhóm / khu vực"><SelectValue /></SelectTrigger>
              <SelectContent>
                {groupNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                <SelectItem value={CUSTOM_GROUP}>Khác (nhập tự do)…</SelectItem>
              </SelectContent>
            </Select>
            {form.groupChoice === CUSTOM_GROUP && (
              <Input className="mt-2" value={form.customGroup} maxLength={80} placeholder="Tên nhóm / khu vực" aria-label="Tên nhóm tự do"
                onChange={(event) => set("customGroup", event.target.value)} />
            )}
          </div>
          <div>
            <Label className="mb-1.5 block">Tổ máy *</Label>
            <Select value={form.machine} onValueChange={setMachine}>
              <SelectTrigger aria-label="Tổ máy"><SelectValue /></SelectTrigger>
              <SelectContent>{MACHINES.map((machine) => <SelectItem key={machine} value={machine}>{machine === "COMMON" ? "Chung (COMMON)" : machine}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2">
            <Label className="mb-1.5 block">Cương vị quản lý{form.freeLocation ? " *" : ""}</Label>
            <Select value={form.position} onValueChange={(value) => set("position", value)}>
              <SelectTrigger aria-label="Cương vị"><SelectValue /></SelectTrigger>
              <SelectContent>
                {!form.freeLocation && <SelectItem value={AUTO_POSITION}>Theo phân công của thiết bị trên cây</SelectItem>}
                {positions.map((position) => <SelectItem key={position} value={position}>{position}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <Label>Thiết bị *</Label>
              <button type="button" className="text-xs text-navy hover:underline"
                onClick={() => { set("freeLocation", !form.freeLocation); if (!form.freeLocation && form.position === AUTO_POSITION) set("position", ""); else if (form.freeLocation && !form.position) set("position", AUTO_POSITION); }}>
                {form.freeLocation ? "Chọn từ cây thiết bị" : "Không có trong cây? Nhập vị trí tự do"}
              </button>
            </div>
            {form.freeLocation ? (
              <Input value={form.location} maxLength={200} placeholder="VD: Quạt gió chèn 2B" aria-label="Vị trí thiết bị"
                onChange={(event) => set("location", event.target.value)} />
            ) : (
              <EquipmentTreePicker value={form.deviceId} onChange={pickDevice} includeLeaves leafOnly allowClear
                scope={parseScopeParam(form.machine) ?? undefined} permissionScope="replacement-manage"
                placeholder="Chọn hoặc tìm thiết bị (tên, mã KKS)" selectionLabel={form.deviceName || undefined} />
            )}
          </div>

          <div className="sm:col-span-2">
            <Label className="mb-1.5 block">Dầu mỡ chính *</Label>
            <LubricantMaterialPicker loading={materialsQuery.isLoading} materials={materials} machine={form.machine} value={form.materialIds}
              onChange={(ids) => setForm((current) => ({ ...current, materialIds: ids, alternateIds: current.alternateIds.filter((id) => id !== ids[0]) }))} />
            <p className="mt-1 text-xs text-muted-foreground">
              Chưa có trong danh mục? <Link href="/materials" className="text-navy hover:underline">Thêm ở Danh mục vật tư</Link>
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1.5 block">Dầu thay thế lẫn nhau (tuỳ chọn)</Label>
            <LubricantMaterialPicker multiple loading={materialsQuery.isLoading} materials={materials} machine={form.machine} excludeIds={mainId ? [mainId] : []}
              value={form.alternateIds} onChange={(ids) => set("alternateIds", ids)} placeholder="Tìm dầu có thể dùng thay" />
          </div>

          <div>
            <Label className="mb-1.5 block">Khối lượng mỗi lần thay</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={0} step={1} value={form.quantity} onChange={(event) => set("quantity", event.target.value)} aria-label="Khối lượng" />
              <span className="shrink-0 text-sm text-muted-foreground">{main?.unit ?? "ĐVT"}</span>
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Chu kỳ (tháng) *</Label>
            <Input type="number" min={1} value={form.intervalMonths} onChange={(event) => set("intervalMonths", event.target.value)} aria-label="Chu kỳ tháng" />
          </div>
          <div>
            <Label className="mb-1.5 block">Ghi chú giờ chạy</Label>
            <Input value={form.intervalNote} placeholder="VD: 2500h" onChange={(event) => set("intervalNote", event.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">Ngày thay gần nhất *</Label>
            <Input type="date" value={form.lastReplacedAt} onChange={(event) => set("lastReplacedAt", event.target.value)} />
          </div>

          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Hủy</Button>
            <Button type="submit" disabled={create.isPending || link.isPending}>
              {(create.isPending || link.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}{fromExcel ? "Tạo và liên kết" : "Thêm thiết bị"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

