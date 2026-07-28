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
import { useEquipmentNode } from "@/hooks/useEquipment";
import {
  EquipmentTreePicker,
  type PickerEquipmentNode,
} from "@/components/devices/equipment-tree-picker";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { blockForPosition, isSelectableManagingPosition } from "@/lib/constants";
import {
  canonicalSeq,
  defaultScopeOf,
  scopeCode,
  seqInScope,
  TREE_SCOPES,
  type TreeScope,
} from "@/lib/equipment-units";
import { announcementShiftRosterPositionOptions } from "@/lib/positions";
import { cn } from "@/lib/utils";

const NONE = "__none__";

export function DeviceForm({
  device,
  initialParentSeq,
  initialScope,
  onDone,
}: {
  device?: DeviceRecord | null;
  initialParentSeq?: string;
  /** Cây đang mở khi bấm "Thêm mới" — quyết định nhóm nhánh và cách hiện mã. */
  initialScope?: TreeScope;
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
  // Phạm vi cây đang tạo. Với thiết bị đã có thì suy từ chính mã của nó.
  const [scope, setScope] = React.useState<TreeScope>(
    () => (device ? defaultScopeOf(device.code) : initialScope ?? (initialParentSeq ? defaultScopeOf(initialParentSeq) : "S1"))
  );

  const [form, setForm] = React.useState({
    // `code` giữ MÃ HIỂN THỊ theo phạm vi; quy về mã chuẩn ngay trước khi gửi.
    code: device?.code ?? (initialParentSeq ? `${scopeCode(initialParentSeq, scope)}.` : ""),
    name: device?.name ?? "",
    kks: device?.kks ?? "",
    system: device?.system ?? "",
    systemSeq: initialParentSeq ?? "",
    managingPosition: device?.managingPosition ?? "",
    images: device?.images ?? [],
    attachedInfo: device?.attachedInfo ?? "",
    documentUrl: device?.documentUrl ?? "",
  });

  // Chỉ tải ĐÚNG node cha để lấy tên, thay vì kéo cả cây ~22k node (3,5 MB) như trước.
  const parentNodeQuery = useEquipmentNode(!isEdit && initialParentSeq ? initialParentSeq : null, scope);
  React.useEffect(() => {
    const parentName = parentNodeQuery.data?.data?.name;
    if (isEdit || !initialParentSeq || !parentName) return;
    setForm((current) => (current.system ? current : { ...current, system: parentName }));
  }, [parentNodeQuery.data, initialParentSeq, isEdit]);

  /** Đổi phạm vi: giữ cha nếu vẫn thuộc nhóm nhánh mới, ngược lại bỏ chọn. */
  function changeScope(next: TreeScope) {
    setScope(next);
    setForm((current) => {
      const canonicalParent = current.systemSeq ? canonicalSeq(current.systemSeq) : "";
      if (canonicalParent && !seqInScope(canonicalParent, next)) {
        // Nhánh dùng chung và nhánh tổ máy không giao nhau — cha cũ không còn hợp lệ.
        return { ...current, code: "", system: "", systemSeq: "" };
      }
      // Cùng nhóm nhánh: chỉ vẽ lại mã theo tổ máy mới.
      return { ...current, code: current.code ? scopeCode(canonicalSeq(current.code), next) : "" };
    });
  }

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Đảm bảo cương vị hiện tại luôn có trong danh sách (kể cả khi đã đổi tên/xoá).
  const positionOptions =
    form.managingPosition && !positions.includes(form.managingPosition)
      ? [form.managingPosition, ...positions]
      : positions;
  // Ô chọn cây nhận MÃ CHUẨN (seq), không phải mã hiển thị theo tổ máy.
  const systemSeqValue = form.systemSeq ? canonicalSeq(form.systemSeq) : "";
  const currentLevel = form.code.trim() ? form.code.trim().split(".").length : null;

  function selectParent(node: PickerEquipmentNode | null) {
    setForm((current) => {
      if (isEdit) {
        return { ...current, system: node?.name ?? "", systemSeq: node?.seq ?? "" };
      }

      let code = current.code;
      const oldParentDisplay = current.systemSeq ? scopeCode(canonicalSeq(current.systemSeq), scope) : "";
      if (!node) {
        // Chỉ xoá tiền tố tự điền khi người dùng chưa nhập mã con.
        if (oldParentDisplay && code === `${oldParentDisplay}.`) code = "";
      } else {
        const oldPrefix = oldParentDisplay ? `${oldParentDisplay}.` : "";
        const previousChildPart = oldPrefix && code.startsWith(oldPrefix)
          ? code.slice(oldPrefix.length)
          : "";
        const childPart = /^\d+$/.test(previousChildPart) ? previousChildPart : "";
        // Thư mục cha là nguồn chuẩn của tiền tố. Khi đổi cha, chỉ giữ lại đúng
        // một đoạn mã con đã nhập; mã không cùng nhánh sẽ được thay bằng tiền tố mới.
        code = `${node.fullCode}.${childPart}`;
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
    // Cây vật lý chỉ có mã chuẩn — mã đang hiển thị theo tổ máy phải quy về trước khi gửi.
    const payload = { ...form, code: canonicalSeq(form.code.trim()) };
    try {
      const result = isEdit
        ? await update.mutateAsync({ id: device!.id, ...payload })
        : await create.mutateAsync(payload);
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
          {!isEdit && (
            <Field label="Thiết bị thuộc" className="md:col-span-2">
              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
                {TREE_SCOPES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => changeScope(s.key)}
                    className={cn(
                      "h-9 rounded-md px-4 text-sm font-semibold transition-colors",
                      scope === s.key ? "bg-navy text-white shadow-sm" : "text-muted-foreground hover:text-ink"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {scope === "COMMON"
                  ? "Thiết bị dùng chung cho 2 tổ máy (nhánh 5, 6)."
                  : "Cấu trúc cây dùng chung: thiết bị này sẽ có ở CẢ Tổ máy S1 và S2. Lịch sử sửa chữa, khiếm khuyết và vật tư vẫn tách riêng theo từng tổ máy."}
              </p>
            </Field>
          )}
          <Field label="Mã thiết bị *">
            <Input value={form.code} onChange={(e) => set("code", e.target.value)} disabled={!canEditCode} required placeholder={`VD: ${scopeCode("DH1.S1.1.4.11.2.2", scope)}`} />
            <p className="mt-1 text-xs text-muted-foreground">
              {currentLevel
                ? `Thiết bị đang ở cấp ${currentLevel}/16.`
                : `Mã bắt đầu bằng ${scopeCode("DH1.S1", scope)}, các cấp sau là số — hỗ trợ tối đa 16 cấp.`}
            </p>
          </Field>
          <Field label="Tên thiết bị *">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field label="Mã KKS">
            <Input value={form.kks} onChange={(e) => set("kks", e.target.value)} placeholder="VD: X0HFV11BB001" />
            {scope === "S2" && (
              <p className="mt-1 text-xs text-amber-700">
                Nhập KKS của <b>Tổ máy S1</b> (bắt đầu bằng 1…). KKS S2 được suy ra tự động bằng cách đổi ký tự đầu 1 → 2.
              </p>
            )}
          </Field>
          <Field label="Hệ thống thiết bị">
            <EquipmentTreePicker
              value={systemSeqValue}
              position={form.managingPosition || null}
              includeLeaves
              maxSelectableDepth={15}
              // Giới hạn đúng nhóm nhánh của phạm vi đang chọn, tránh đặt thiết bị tổ máy
              // vào nhánh dùng chung (và ngược lại).
              scope={scope}
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
