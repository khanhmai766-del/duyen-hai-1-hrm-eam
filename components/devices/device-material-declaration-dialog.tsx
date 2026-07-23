"use client";

import * as React from "react";
import { CalendarClock, Loader2, PackagePlus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePositions } from "@/hooks/useUsers";
import {
  useCreateDeviceMaterialDeclaration,
  useDeviceMaterialOptions,
} from "@/hooks/useDeviceMaterialDeclarations";
import { MATERIAL_CATEGORIES, isSelectableManagingPosition, materialCategoryMatches } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";

const NONE = "__none__";

export function DeviceMaterialDeclarationDialog({
  open,
  onOpenChange,
  device,
  machine,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: { code: string; displayCode?: string; name: string; system: string | null; managingPosition: string | null };
  machine: string;
}) {
  const positions = usePositions().filter(isSelectableManagingPosition);
  const optionsQuery = useDeviceMaterialOptions(device.code, machine, open);
  const create = useCreateDeviceMaterialDeclaration();
  const options = React.useMemo(() => optionsQuery.data?.data ?? [], [optionsQuery.data]);
  // Đồng bộ với tab Danh mục vật tư PXVH1: luôn hiện đủ các loại chuẩn
  // (Dầu bôi trơn, Lõi lọc dầu, Thiết bị C&I, Hóa Chất, Bi Nghiền Than),
  // kèm loại lạ còn sót trong dữ liệu nhưng chưa quy về nhãn chuẩn.
  const categories = React.useMemo(() => {
    const available = new Set(options.map((item) => item.category).filter((value): value is string => Boolean(value)));
    return [
      ...MATERIAL_CATEGORIES,
      ...Array.from(available).filter(
        (category) => !MATERIAL_CATEGORIES.some((standard) => materialCategoryMatches(category, standard))
      ),
    ];
  }, [options]);

  const [category, setCategory] = React.useState("");
  const [materialId, setMaterialId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [deviceCount, setDeviceCount] = React.useState("1");
  const [intervalMonths, setIntervalMonths] = React.useState("0");
  const [intervalNote, setIntervalNote] = React.useState("");
  const [lastReplacedAt, setLastReplacedAt] = React.useState("");
  const [managingPosition, setManagingPosition] = React.useState(device.managingPosition ?? "");
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setCategory("");
    setMaterialId("");
    setSearch("");
    setQuantity("1");
    setDeviceCount("1");
    setIntervalMonths("0");
    setIntervalNote("");
    setLastReplacedAt("");
    setManagingPosition(device.managingPosition ?? "");
    setNote("");
  }, [open, device.managingPosition]);

  React.useEffect(() => {
    if (!categories.length) return;
    setCategory((current) => (categories.includes(current) ? current : categories[0]));
  }, [categories]);

  const filteredMaterials = React.useMemo(() => {
    const query = normalizeText(search);
    return options.filter((item) => {
      if (category && !materialCategoryMatches(item.category, category)) return false;
      if (!query) return true;
      return normalizeText(`${item.code} ${item.name}`).includes(query);
    });
  }, [options, category, search]);
  const selectedMaterial = options.find((item) => item.id === materialId) ?? null;

  async function submit() {
    if (!materialId) return toast.error("Vui lòng chọn vật tư trong danh mục PXVH1");
    if (Number(quantity) <= 0) return toast.error("Dung tích hoặc số lượng phải lớn hơn 0");
    try {
      await create.mutateAsync({
        deviceSeq: device.code,
        materialId,
        machine,
        system: device.system,
        location: device.name,
        managingPosition: managingPosition || null,
        quantity: Number(quantity),
        deviceCount: Math.max(1, Number(deviceCount) || 1),
        intervalMonths: Math.max(0, Number(intervalMonths) || 0),
        intervalNote: intervalNote || null,
        lastReplacedAt: lastReplacedAt || null,
        note: note || null,
      });
      toast.success("Đã khai báo vật tư cho thiết bị");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể khai báo vật tư");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex max-h-[90dvh] max-w-4xl flex-col !overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border bg-gradient-to-r from-slate-50 to-blue-50/70 px-6 py-5">
          <DialogTitle className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy text-white shadow-sm">
              <PackagePlus className="h-5 w-5" />
            </span>
            <span>
              <span className="block">Khai báo vật tư cho thiết bị</span>
              <span className="mt-0.5 block text-sm font-normal text-muted-foreground">Chọn vật tư đã có trong Danh mục vật tư PXVH1</span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto overscroll-contain p-6 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="space-y-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Thiết bị được khai báo</div>
              <div className="mt-1 font-semibold text-ink">{device.name}</div>
              <div className="mt-0.5 font-mono text-xs text-muted-foreground">{device.displayCode ?? device.code}</div>
            </div>

            <Field label="Tổ máy áp dụng">
              <div className="flex min-h-11 items-center justify-between rounded-lg border border-blue-100 bg-blue-50/60 px-4">
                <span className="text-sm text-muted-foreground">Tự động theo nhánh thiết bị</span>
                <span className="rounded-full bg-navy px-3 py-1 text-xs font-bold text-white">
                  {machine === "COMMON" ? "COMMON · Dùng chung" : machine}
                </span>
              </div>
            </Field>

            <Field label="Loại vật tư *">
              <Select value={category || NONE} onValueChange={(value) => { setCategory(value === NONE ? "" : value); setMaterialId(""); }} disabled={optionsQuery.isLoading}>
                <SelectTrigger><SelectValue placeholder="Chọn loại vật tư" /></SelectTrigger>
                <SelectContent>
                  {categories.length ? categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>) : <SelectItem value={NONE}>Chưa có loại vật tư</SelectItem>}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Vật tư trong danh mục *">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Tìm theo mã hoặc tên vật tư..." />
              </div>
              <Select value={materialId || NONE} onValueChange={(value) => setMaterialId(value === NONE ? "" : value)} disabled={optionsQuery.isLoading || !category}>
                <SelectTrigger className="h-auto min-h-10 py-2 text-left"><SelectValue placeholder={optionsQuery.isLoading ? "Đang tải danh mục..." : "Chọn vật tư"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Chưa chọn —</SelectItem>
                  {filteredMaterials.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.code} — {item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!optionsQuery.isLoading && category && filteredMaterials.length === 0 && (
                <p className="mt-2 text-xs text-amber-700">Không tìm thấy vật tư phù hợp trong loại đã chọn.</p>
              )}
            </Field>
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-2 font-semibold text-ink"><CalendarClock className="h-4 w-4 text-accent" /> Chi tiết sử dụng và chu kỳ</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Dung tích / số lượng${selectedMaterial ? ` (${selectedMaterial.unit})` : ""} *`}>
                <Input type="number" min={0} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </Field>
              <Field label="Số lượng thiết bị *">
                <Input type="number" min={1} value={deviceCount} onChange={(event) => setDeviceCount(event.target.value)} />
              </Field>
              <Field label="Chu kỳ (tháng)">
                <Input type="number" min={0} value={intervalMonths} onChange={(event) => setIntervalMonths(event.target.value)} />
                <p className="mt-1 text-[11px] text-muted-foreground">Nhập 0 nếu chỉ khai báo, chưa theo dõi lịch.</p>
              </Field>
              <Field label="Chu kỳ O&M">
                <Input value={intervalNote} onChange={(event) => setIntervalNote(event.target.value)} placeholder="VD: 2500 giờ" />
              </Field>
              <Field label="Lần thay gần nhất">
                <Input type="date" value={lastReplacedAt} onChange={(event) => setLastReplacedAt(event.target.value)} />
              </Field>
              <Field label="Cương vị quản lý">
                <Select value={managingPosition || NONE} onValueChange={(value) => setManagingPosition(value === NONE ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="Chọn cương vị" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Không chọn —</SelectItem>
                    {(managingPosition && !positions.includes(managingPosition) ? [managingPosition, ...positions] : positions)
                      .map((position) => <SelectItem key={position} value={position}>{position}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Ghi chú">
              <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Thông tin vị trí lắp đặt hoặc lưu ý khi thay..." />
            </Field>
          </section>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-white px-6 py-4">
          <p className="hidden text-xs text-muted-foreground sm:block">Vật tư sẽ xuất hiện tại mục “Vật tư được khai báo”.</p>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Hủy</Button>
            <Button onClick={submit} disabled={create.isPending || optionsQuery.isLoading || !materialId}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />} Lưu khai báo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-sm font-medium text-slate-600">{label}</Label>
      {children}
    </div>
  );
}
