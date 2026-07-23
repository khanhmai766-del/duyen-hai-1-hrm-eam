"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiImagePicker } from "@/components/shared/multi-image-picker";
import { useCreateDevice, useUpdateDevice, type DeviceRecord } from "@/hooks/useDevices";
import { useEquipmentTree } from "@/hooks/useEquipment";
import { EquipmentTreePicker } from "@/components/devices/equipment-tree-picker";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { blockForPosition, isSelectableManagingPosition } from "@/lib/constants";
import { announcementShiftRosterPositionOptions } from "@/lib/positions";

const NONE = "__none__";

export function DeviceForm({
  device,
  initialParentSeq,
  onDone,
}: {
  device?: DeviceRecord | null;
  initialParentSeq?: string;
  onDone?: (d: DeviceRecord) => void;
}) {
  const { data: session } = useSession();
  const create = useCreateDevice();
  const update = useUpdateDevice();
  const isEdit = !!device;
  const rbac = useRbacAccess();
  const canEditCode = !isEdit || rbac.can("device-code", ["full"]);
  const positions = React.useMemo<string[]>(
    () => announcementShiftRosterPositionOptions().filter(isSelectableManagingPosition),
    []
  );
  const { data: equipmentTreeData } = useEquipmentTree();
  const equipmentNodes = React.useMemo(() => equipmentTreeData?.data ?? [], [equipmentTreeData]);

  const [form, setForm] = React.useState({
    code: device?.code ?? (initialParentSeq ? `${initialParentSeq}.` : ""),
    name: device?.name ?? "",
    system: device?.system ?? "",
    systemSeq: initialParentSeq ?? "",
    managingPosition: device?.managingPosition ?? "",
    images: device?.images ?? [],
    attachedInfo: device?.attachedInfo ?? "",
    documentUrl: device?.documentUrl ?? "",
  });

  // Khi đi từ cây thiết bị sang tab Thêm mới, dữ liệu cây có thể về sau lần render
  // đầu tiên. Đồng bộ tên hệ thống mà không ghi đè các trường người dùng đang nhập.
  React.useEffect(() => {
    if (isEdit || !initialParentSeq || form.system) return;
    const parent = equipmentNodes.find((node) => node.seq === initialParentSeq);
    if (parent) setForm((current) => ({ ...current, system: parent.name }));
  }, [equipmentNodes, form.system, initialParentSeq, isEdit]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Đảm bảo cương vị hiện tại luôn có trong danh sách (kể cả khi đã đổi tên/xoá).
  const positionOptions =
    form.managingPosition && !positions.includes(form.managingPosition)
      ? [form.managingPosition, ...positions]
      : positions;
  // Seq đang chọn cho ô cây: ưu tiên systemSeq; nếu (sửa) chỉ có tên thì dò seq theo tên.
  const systemSeqValue =
    form.systemSeq || (form.system ? equipmentNodes.find((n) => n.name === form.system)?.seq ?? "" : "");
  const currentLevel = form.code.trim() ? form.code.trim().split(".").length : null;

  function selectParent(node: (typeof equipmentNodes)[number] | null) {
    setForm((current) => {
      if (isEdit) {
        return { ...current, system: node?.name ?? "", systemSeq: node?.seq ?? "" };
      }

      let code = current.code;
      if (!node) {
        // Chỉ xoá tiền tố tự điền khi người dùng chưa nhập mã con.
        if (current.systemSeq && code === `${current.systemSeq}.`) code = "";
      } else {
        const oldParent = current.systemSeq;
        const oldPrefix = oldParent ? `${oldParent}.` : "";
        const previousChildPart = oldPrefix && code.startsWith(oldPrefix)
          ? code.slice(oldPrefix.length)
          : "";
        const childPart = /^\d+$/.test(previousChildPart) ? previousChildPart : "";
        // Thư mục cha là nguồn chuẩn của tiền tố. Khi đổi cha, chỉ giữ lại đúng
        // một đoạn mã con đã nhập; mã không cùng nhánh sẽ được thay bằng tiền tố mới.
        code = `${node.seq}.${childPart}`;
      }

      return {
        ...current,
        code,
        system: node?.name ?? "",
        systemSeq: node?.seq ?? "",
      };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) return toast.error("Nhập Số thứ tự và Tên thiết bị");
    try {
      const result = isEdit
        ? await update.mutateAsync({ id: device!.id, ...form })
        : await create.mutateAsync(form);
      toast.success(isEdit ? "Đã cập nhật thiết bị" : "Đã thêm thiết bị mới");
      onDone?.(result);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEdit ? `Chỉnh sửa: ${device!.code}` : "Thêm thiết bị mới"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Mã thiết bị *">
            <Input value={form.code} onChange={(e) => set("code", e.target.value)} disabled={!canEditCode} required placeholder="VD: DH1.S1.1.4.11.2.2" />
            <p className="mt-1 text-xs text-muted-foreground">
              {currentLevel ? `Thiết bị đang ở cấp ${currentLevel}/16.` : "Mã bắt đầu bằng DH1.S1, các cấp sau là số — hỗ trợ tối đa 16 cấp."}
            </p>
          </Field>
          <Field label="Tên thiết bị *">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field label="Hệ thống thiết bị">
            <EquipmentTreePicker
              value={systemSeqValue}
              position={form.managingPosition || null}
              includeLeaves
              maxSelectableDepth={15}
              placeholder="Chọn thư mục hoặc thiết bị cha (tối đa cấp 15)"
              onChange={selectParent}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Có thể chọn thiết bị hiện tại làm thư mục cha. Số thứ tự phía trên sẽ tự điền mã cha; chỉ cần nhập thêm số cấp con.
            </p>
          </Field>
          <Field label="Cương vị quản lý">
            <Select value={form.managingPosition || NONE} onValueChange={(v) => set("managingPosition", v === NONE ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Chọn cương vị" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Không chọn —</SelectItem>
                {positionOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Khối quản lý">
            <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-ink">
              {blockForPosition(form.managingPosition)}
            </div>
          </Field>
          <Field label="Ảnh (tối đa 3)" className="md:col-span-2">
            <MultiImagePicker value={form.images} onChange={(v) => set("images", v)} max={3} allowUrl />
          </Field>
          <Field label="Thông tin đính kèm theo" className="md:col-span-2">
            <Textarea value={form.attachedInfo} onChange={(e) => set("attachedInfo", e.target.value)} rows={3} placeholder="Ghi chú, thông số, lưu ý…" />
          </Field>
          <Field label="Tài liệu đính kèm (link)" className="md:col-span-2">
            <Input value={form.documentUrl} onChange={(e) => set("documentUrl", e.target.value)} placeholder="https://… (PDF / Google Drive)" />
          </Field>
          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Lưu thay đổi" : "Thêm thiết bị"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
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
