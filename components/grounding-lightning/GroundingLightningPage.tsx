"use client";
/* eslint-disable @next/next/no-img-element -- ảnh riêng tư được phục vụ qua proxy S3 của ứng dụng */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  FileClock,
  Filter,
  History,
  ImagePlus,
  Pencil,
  Plus,
  RadioTower,
  Save,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { POSITION_CATALOG } from "@/lib/position-catalog";
import {
  GROUNDING_STATUS_LABEL,
  GROUNDING_TYPE_LABEL,
  type GroundingStatus,
  type GroundingType,
} from "@/lib/grounding-lightning-shared";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import {
  useCreateGroundingItem,
  useDeleteGroundingImage,
  useDeleteGroundingItem,
  useGroundingAreaOptions,
  useGroundingHistory,
  useGroundingItems,
  useSignGroundingItem,
  useUpdateGroundingItem,
  useUploadGroundingImage,
  type GroundingFilters,
  type GroundingItem,
} from "@/hooks/useGroundingLightning";

const CONTROL =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-900";
const MACHINES = [
  { value: "ALL", label: "Tất cả tổ máy" },
  { value: "S1", label: "Tổ máy 1" },
  { value: "S2", label: "Tổ máy 2" },
  { value: "COMMON", label: "Common" },
];

function machineLabel(value: string) {
  return MACHINES.find((item) => item.value === value)?.label ?? value;
}
function fmtDate(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}

function StatusPill({ status }: { status: GroundingStatus }) {
  const config =
    status === "NORMAL"
      ? {
          icon: CheckCircle2,
          className: "border-emerald-200 bg-emerald-50 text-emerald-700",
          label: "Bình thường",
        }
      : status === "DEFECT"
        ? {
            icon: AlertTriangle,
            className: "border-rose-200 bg-rose-50 text-rose-700",
            label: "Có khiếm khuyết",
          }
        : {
            icon: Clock3,
            className: "border-amber-200 bg-amber-50 text-amber-700",
            label: "Chưa kiểm tra",
          };
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        config.className,
      )}
    >
      <Icon className="size-3.5" />
      {config.label}
    </span>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Zap;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/70 bg-white/85 p-4 shadow-[0_14px_40px_rgba(15,39,64,0.08)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/80">
      <div className={cn("absolute inset-y-0 left-0 w-1", tone)} />
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-10 place-items-center rounded-xl text-white shadow-sm",
            tone,
          )}
        >
          <Icon className="size-5" />
        </span>
        <div>
          <div className="text-2xl font-black tracking-tight text-ink">
            {value}
          </div>
          <div className="text-xs font-medium text-muted-foreground">
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}

type CatalogForm = {
  areaEquipment: string;
  positionCode: string;
  machine: string;
  types: GroundingType[];
  note: string;
};
const EMPTY_FORM: CatalogForm = {
  areaEquipment: "",
  positionCode: "",
  machine: "COMMON",
  types: ["GROUNDING"],
  note: "",
};

function CatalogDialog({
  open,
  onOpenChange,
  item,
  canDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: GroundingItem | null;
  canDelete: boolean;
}) {
  const create = useCreateGroundingItem();
  const update = useUpdateGroundingItem();
  const initial = item
    ? {
        areaEquipment: item.areaEquipment,
        positionCode: item.positionCode ?? "",
        machine: item.machine,
        types: item.points.map((point) => point.type),
        note: item.note ?? "",
      }
    : EMPTY_FORM;
  const [form, setForm] = useState<CatalogForm>(initial);
  const areaOptions = useGroundingAreaOptions(form.positionCode, form.machine);
  const normalizedArea = form.areaEquipment
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("vi-VN");
  const matchedArea = !item
    ? areaOptions.data?.data.find(
        (candidate) =>
          candidate.areaEquipment
            .replace(/\s+/g, " ")
            .trim()
            .toLocaleLowerCase("vi-VN") === normalizedArea,
      )
    : undefined;
  const key = `${item?.id ?? "new"}-${open}`;
  const toggleType = (type: GroundingType) => {
    if (
      item?.points.some((point) => point.type === type) &&
      form.types.includes(type) &&
      !canDelete
    ) {
      toast.warning("Bạn không có quyền xoá loại kiểm tra đã tồn tại");
      return;
    }
    setForm((old) => ({
      ...old,
      types: old.types.includes(type)
        ? old.types.filter((value) => value !== type)
        : [...old.types, type],
    }));
  };
  const submit = async () => {
    try {
      if (item) await update.mutateAsync({ id: item.id, ...form });
      else await create.mutateAsync(form);
      toast.success(
        item
          ? "Đã cập nhật danh mục"
          : matchedArea
            ? "Đã gộp vào khu vực/thiết bị hiện có"
            : "Đã thêm khu vực/thiết bị",
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không lưu được danh mục",
      );
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent key={key} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {item ? "Sửa danh mục kiểm tra" : "Thêm khu vực/thiết bị"}
          </DialogTitle>
          <DialogDescription>
            Chọn đúng loại áp dụng; thiết bị có cả hai sẽ tạo hai điểm kiểm tra
            riêng.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tổ máy">
            <select
              className={CONTROL}
              value={form.machine}
              onChange={(e) => setForm({ ...form, machine: e.target.value })}
            >
              {MACHINES.slice(1).map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cương vị" span>
            <select
              className={CONTROL}
              value={form.positionCode}
              onChange={(e) =>
                setForm({ ...form, positionCode: e.target.value })
              }
            >
              <option value="">— Chọn cương vị —</option>
              {POSITION_CATALOG.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Khu vực/thiết bị" span>
            <input
              className={CONTROL}
              list={!item ? "grounding-area-options" : undefined}
              value={form.areaEquipment}
              onChange={(e) =>
                setForm({ ...form, areaEquipment: e.target.value })
              }
              placeholder={
                !item
                  ? "Chọn tên đã có hoặc nhập tên mới"
                  : "Ví dụ: Động cơ bơm tuần hoàn 1A"
              }
            />
            {!item && (
              <>
                <datalist id="grounding-area-options">
                  {(areaOptions.data?.data ?? []).map((candidate) => (
                    <option
                      key={candidate.id}
                      value={candidate.areaEquipment}
                    />
                  ))}
                </datalist>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Danh sách được lọc theo cương vị và tổ máy. Chọn tên đã có để
                  gộp, hoặc nhập tên mới.
                </p>
                {matchedArea && (
                  <div className="mt-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800">
                    Khu vực này đã tồn tại. Khi lưu, loại kiểm tra được bổ sung
                    vào cùng một dòng.
                  </div>
                )}
              </>
            )}
          </Field>
          <Field label="Loại kiểm tra" span>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["LIGHTNING", "GROUNDING"] as GroundingType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 text-left transition",
                    form.types.includes(type)
                      ? "border-cyan-400 bg-cyan-50 text-cyan-900"
                      : "border-slate-200 bg-white text-slate-600",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded border",
                      form.types.includes(type) &&
                        "border-cyan-600 bg-cyan-600 text-white",
                    )}
                  >
                    {form.types.includes(type) && (
                      <CheckCircle2 className="size-3.5" />
                    )}
                  </span>
                  <b>{GROUNDING_TYPE_LABEL[type]}</b>
                </button>
              ))}
            </div>
          </Field>
          <Field label="Ghi chú" span>
            <textarea
              className={cn(CONTROL, "h-24 py-2")}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={submit}
            disabled={
              create.isPending ||
              update.isPending ||
              !form.areaEquipment ||
              !form.positionCode ||
              !form.types.length
            }
          >
            <Save />
            Lưu danh mục
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  span,
  children,
}: {
  label: string;
  span?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("space-y-1.5", span && "sm:col-span-2")}>
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function InspectionDialog({
  item,
  onClose,
}: {
  item: GroundingItem | null;
  onClose: () => void;
}) {
  const update = useUpdateGroundingItem();
  const upload = useUploadGroundingImage();
  const removeImage = useDeleteGroundingImage();
  const [note, setNote] = useState(item?.note ?? "");
  const [results, setResults] = useState(
    () =>
      Object.fromEntries(
        (item?.points ?? []).map((p) => [
          p.type,
          {
            status: p.status,
            defectDescription: p.defectDescription ?? "",
            files: [] as File[],
          },
        ]),
      ) as Record<
        GroundingType,
        { status: GroundingStatus; defectDescription: string; files: File[] }
      >,
  );
  if (!item) return null;
  const save = async () => {
    try {
      const saved = await update.mutateAsync({
        id: item.id,
        note,
        results: item.points.map((point) => ({
          type: point.type,
          status: results[point.type].status,
          defectDescription: results[point.type].defectDescription,
        })),
      });
      for (const point of saved.points)
        for (const file of results[point.type]?.files ?? [])
          await upload.mutateAsync({
            itemId: item.id,
            pointId: point.id,
            file,
          });
      toast.success("Đã lưu kết quả kiểm tra");
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không lưu được kết quả",
      );
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Cập nhật kết quả kiểm tra</DialogTitle>
          <DialogDescription>
            {item.areaEquipment} · {item.position} ·{" "}
            {machineLabel(item.machine)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {item.points.map((point) => {
            const value = results[point.type];
            return (
              <section
                key={point.id}
                className={cn(
                  "rounded-2xl border p-4",
                  value.status === "DEFECT"
                    ? "border-rose-200 bg-rose-50/60"
                    : value.status === "NORMAL"
                      ? "border-emerald-200 bg-emerald-50/50"
                      : "border-amber-200 bg-amber-50/40",
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 font-bold text-ink">
                    {point.type === "LIGHTNING" ? (
                      <RadioTower className="size-5 text-amber-600" />
                    ) : (
                      <Zap className="size-5 text-cyan-700" />
                    )}
                    {GROUNDING_TYPE_LABEL[point.type]}
                  </h3>
                  <StatusPill status={value.status} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Kết quả">
                    <select
                      className={CONTROL}
                      value={value.status}
                      onChange={(e) =>
                        setResults({
                          ...results,
                          [point.type]: {
                            ...value,
                            status: e.target.value as GroundingStatus,
                            defectDescription:
                              e.target.value === "DEFECT"
                                ? value.defectDescription
                                : "",
                            files:
                              e.target.value === "DEFECT" ? value.files : [],
                          },
                        })
                      }
                    >
                      {Object.entries(GROUNDING_STATUS_LABEL).map(
                        ([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                  {value.status === "DEFECT" && (
                    <Field label="Nội dung khiếm khuyết">
                      <textarea
                        className={cn(CONTROL, "h-24 py-2")}
                        value={value.defectDescription}
                        onChange={(e) =>
                          setResults({
                            ...results,
                            [point.type]: {
                              ...value,
                              defectDescription: e.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                  )}
                </div>
                {value.status === "DEFECT" && (
                  <div className="mt-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-cyan-400 bg-white px-3 py-2 text-sm font-semibold text-cyan-800">
                      <ImagePlus className="size-4" />
                      Thêm hình ảnh
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        multiple
                        className="hidden"
                        onChange={(e) =>
                          setResults({
                            ...results,
                            [point.type]: {
                              ...value,
                              files: [
                                ...value.files,
                                ...Array.from(e.target.files ?? []),
                              ],
                            },
                          })
                        }
                      />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {point.attachments.map((image) => (
                        <div key={image.id} className="group relative">
                          <a href={image.url} target="_blank" rel="noreferrer">
                            <img
                              src={image.url}
                              alt={image.originalName ?? "Ảnh khiếm khuyết"}
                              className="h-20 w-24 rounded-xl border bg-white object-cover"
                            />
                          </a>
                          <button
                            type="button"
                            title="Xoá ảnh"
                            onClick={async () => {
                              if (!confirm("Xoá ảnh này khỏi server S3?"))
                                return;
                              try {
                                await removeImage.mutateAsync(image.id);
                                toast.success("Đã xoá ảnh");
                              } catch (error) {
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "Không xoá được ảnh",
                                );
                              }
                            }}
                            className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-rose-600 text-white shadow"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ))}
                      {value.files.map((file, index) => (
                        <span
                          key={`${file.name}-${index}`}
                          className="inline-flex h-20 max-w-40 items-center gap-2 rounded-xl border bg-white px-3 text-xs"
                        >
                          <Camera className="size-4 text-cyan-700" />
                          <span className="truncate">{file.name}</span>
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-rose-700">
                      Chuyển hạng mục sang “Bình thường” sẽ xóa toàn bộ ảnh của
                      hạng mục này khỏi S3 khi lưu.
                    </p>
                  </div>
                )}
              </section>
            );
          })}
          <Field label="Ghi chú chung">
            <textarea
              className={cn(CONTROL, "h-24 py-2")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nội dung cần chú ý trong lần kiểm tra"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={save}
            disabled={update.isPending || upload.isPending}
          >
            <Save />
            Lưu kết quả
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  item,
  onClose,
}: {
  item: GroundingItem | null;
  onClose: () => void;
}) {
  const history = useGroundingHistory(item?.id ?? null);
  if (!item) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Lịch sử kiểm tra</DialogTitle>
          <DialogDescription>{item.areaEquipment}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {history.isLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Đang tải lịch sử…
            </div>
          )}
          {history.data?.data.map((entry) => (
            <article
              key={entry.id}
              className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <b className="text-ink">{entry.inspectorName}</b>
                  <div className="text-xs text-muted-foreground">
                    {entry.inspectorPosition || "Không ghi cương vị"} ·{" "}
                    {fmtDate(entry.signedAt)}
                  </div>
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  Đã xác nhận
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {entry.results.map((result) => (
                  <div key={result.id} className="rounded-xl bg-white p-3">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs font-bold">
                      <span>{GROUNDING_TYPE_LABEL[result.type]}</span>
                      <StatusPill status={result.status} />
                    </div>
                    {result.defectDescription && (
                      <p className="whitespace-pre-line text-sm text-rose-700">
                        {result.defectDescription}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {entry.note && (
                <p className="mt-3 text-sm text-slate-600">
                  Ghi chú: {entry.note}
                </p>
              )}
            </article>
          ))}
          {!history.isLoading && !history.data?.data.length && (
            <div className="rounded-2xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              Chưa có lần kiểm tra nào được xác nhận.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function GroundingLightningPage() {
  const { can } = useRbacAccess();
  const canManage = can("grounding-lightning-manage", [
    "personal",
    "manage",
    "full",
  ]);
  const canCatalog = can("grounding-lightning-catalog", ["manage", "full"]);
  const canDelete = can("grounding-lightning-delete", ["manage", "full"]);
  const [filters, setFilters] = useState<GroundingFilters>({
    q: "",
    positionCode: "ALL",
    machine: "ALL",
    type: "ALL",
    status: "ALL",
  });
  const query = useGroundingItems(filters);
  const items = useMemo(() => query.data?.data ?? [], [query.data?.data]);
  const positions = query.data?.meta?.positions ?? [];
  const [catalog, setCatalog] = useState<{
    open: boolean;
    item: GroundingItem | null;
  }>({ open: false, item: null });
  const [inspection, setInspection] = useState<GroundingItem | null>(null);
  const [history, setHistory] = useState<GroundingItem | null>(null);
  const removeItem = useDeleteGroundingItem();
  const sign = useSignGroundingItem();
  const metrics = useMemo(
    () => ({
      total: items.length,
      normal: items.filter((item) =>
        item.points.every((point) => point.status === "NORMAL"),
      ).length,
      defect: items.filter((item) =>
        item.points.some((point) => point.status === "DEFECT"),
      ).length,
      unsigned: items.filter((item) => item.needsSignature).length,
    }),
    [items],
  );
  const doSign = async (item: GroundingItem) => {
    if (!confirm(`Xác nhận đã kiểm tra “${item.areaEquipment}”?`)) return;
    try {
      await sign.mutateAsync(item.id);
      toast.success("Đã xác nhận kiểm tra");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không xác nhận được",
      );
    }
  };
  const doDelete = async (item: GroundingItem) => {
    if (
      !confirm(
        `Xoá “${item.areaEquipment}” cùng toàn bộ lịch sử và ảnh khỏi hệ thống?`,
      )
    )
      return;
    try {
      await removeItem.mutateAsync(item.id);
      toast.success("Đã xoá khu vực/thiết bị");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không xoá được");
    }
  };
  return (
    <div className="relative min-h-[calc(100vh-7rem)] space-y-5 pb-10">
      <div className="pointer-events-none absolute -right-10 -top-12 -z-10 size-72 rounded-full bg-cyan-200/20 blur-3xl" />
      <PageHeader
        title="Tiếp địa & chống sét"
        description="Kiểm tra theo từng điểm áp dụng, lưu ảnh khiếm khuyết trên S3 và ghi nhận người xác nhận từng lượt."
        mobileTitle="Tiếp địa & chống sét"
      >
        <>
          {canCatalog && (
            <Button
              size="toolbar"
              onClick={() => setCatalog({ open: true, item: null })}
            >
              <Plus />
              Thêm thiết bị
            </Button>
          )}
        </>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          icon={RadioTower}
          label="Khu vực/thiết bị"
          value={metrics.total}
          tone="bg-slate-700"
        />
        <Metric
          icon={CheckCircle2}
          label="Hoàn toàn bình thường"
          value={metrics.normal}
          tone="bg-emerald-600"
        />
        <Metric
          icon={AlertTriangle}
          label="Có khiếm khuyết"
          value={metrics.defect}
          tone="bg-rose-600"
        />
        <Metric
          icon={FileClock}
          label="Chờ xác nhận"
          value={metrics.unsigned}
          tone="bg-amber-500"
        />
      </div>
      <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          <Filter className="size-4" />
          Bộ lọc hiện trường
        </div>
        <div className="grid gap-2 md:grid-cols-5">
          <input
            className={CONTROL}
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="Tìm khu vực, thiết bị…"
          />
          <select
            className={CONTROL}
            value={filters.positionCode}
            onChange={(e) =>
              setFilters({ ...filters, positionCode: e.target.value })
            }
          >
            <option value="ALL">Tất cả cương vị</option>
            {positions.map((p: any) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            className={CONTROL}
            value={filters.machine}
            onChange={(e) =>
              setFilters({ ...filters, machine: e.target.value })
            }
          >
            {MACHINES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            className={CONTROL}
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          >
            <option value="ALL">Mọi loại kiểm tra</option>
            <option value="LIGHTNING">Chống sét</option>
            <option value="GROUNDING">Tiếp địa</option>
          </select>
          <select
            className={CONTROL}
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="ALL">Mọi kết quả</option>
            {Object.entries(GROUNDING_STATUS_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_55px_rgba(15,39,64,0.08)] dark:border-slate-700 dark:bg-slate-900">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1120px] border-collapse text-sm">
            <thead className="bg-[linear-gradient(110deg,#0f2944,#0d5668)] text-white">
              <tr>
                {[
                  "Cương vị",
                  "Khu vực/thiết bị",
                  "Loại kiểm tra",
                  "Kết quả",
                  "Ghi chú · Hình ảnh",
                  "Người xác nhận",
                  "Thao tác",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-slate-100 align-top hover:bg-cyan-50/30"
                >
                  <td className="px-3 py-4">
                    <b className="block text-ink">{item.position || "—"}</b>
                    <span className="text-xs text-muted-foreground">
                      {machineLabel(item.machine)}
                    </span>
                  </td>
                  <td className="max-w-64 px-3 py-4 font-semibold text-ink">
                    {item.areaEquipment}
                  </td>
                  <td className="px-3 py-4">
                    <div className="space-y-3">
                      {item.points.map((p) => (
                        <div key={p.id} className="h-12 font-semibold">
                          {GROUNDING_TYPE_LABEL[p.type]}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="space-y-3">
                      {item.points.map((p) => (
                        <div key={p.id} className="min-h-12">
                          <StatusPill status={p.status} />
                          {p.defectDescription && (
                            <p className="mt-1 max-w-72 whitespace-pre-line text-xs text-rose-700">
                              {p.defectDescription}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="max-w-64 px-3 py-4">
                    <p className="text-xs text-slate-600">{item.note || "—"}</p>
                    {item.points.some((p) => p.attachments.length) && (
                      <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-cyan-700">
                        <Camera className="size-4" />
                        {item.points.reduce(
                          (n, p) => n + p.attachments.length,
                          0,
                        )}{" "}
                        ảnh
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-4">
                    {item.latestInspection ? (
                      <div className="min-w-32">
                        <b className="block text-xs">
                          {item.latestInspection.inspectorName}
                        </b>
                        <span className="text-[11px] text-muted-foreground">
                          {fmtDate(item.latestInspection.signedAt)}
                        </span>
                        {item.needsSignature && (
                          <span className="mt-1 block text-[11px] font-bold text-amber-700">
                            Có thay đổi, cần xác nhận lại
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Chưa xác nhận
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex min-w-32 flex-wrap gap-1">
                      {canManage && (
                        <Button
                          size="sm"
                          variant="soft"
                          onClick={() => setInspection(item)}
                        >
                          <ShieldCheck />
                          Kiểm tra
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => doSign(item)}
                          disabled={sign.isPending}
                        >
                          <Save />
                          Xác nhận
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Lịch sử"
                        className="size-8"
                        onClick={() => setHistory(item)}
                      >
                        <History />
                      </Button>
                      {canDelete && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Sửa danh mục"
                          className="size-8"
                          onClick={() => setCatalog({ open: true, item })}
                        >
                          <Pencil />
                        </Button>
                      )}
                      {canCatalog && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Xoá"
                          className="size-8 text-rose-600"
                          onClick={() => doDelete(item)}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divide-y md:hidden">
          {items.map((item) => (
            <article key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-cyan-700">
                    {item.position} · {machineLabel(item.machine)}
                  </span>
                  <h3 className="mt-1 font-bold text-ink">
                    {item.areaEquipment}
                  </h3>
                </div>
                {item.needsSignature && (
                  <span
                    className="size-2.5 shrink-0 rounded-full bg-amber-500"
                    title="Chờ xác nhận"
                  />
                )}
              </div>
              <div className="mt-3 space-y-2">
                {item.points.map((p) => (
                  <div key={p.id} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-sm">{GROUNDING_TYPE_LABEL[p.type]}</b>
                      <StatusPill status={p.status} />
                    </div>
                    {p.defectDescription && (
                      <p className="mt-2 whitespace-pre-line text-sm text-rose-700">
                        {p.defectDescription}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {canManage && (
                  <Button size="sm" onClick={() => setInspection(item)}>
                    <ShieldCheck />
                    Kiểm tra
                  </Button>
                )}
                {canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => doSign(item)}
                  >
                    Xác nhận
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setHistory(item)}
                >
                  <History />
                  Lịch sử
                </Button>
                {canCatalog && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCatalog({ open: true, item })}
                  >
                    <Pencil />
                    Sửa
                  </Button>
                )}
                {canDelete && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-rose-600"
                    onClick={() => doDelete(item)}
                  >
                    <Trash2 />
                    Xoá
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
        {query.isLoading && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Đang tải danh mục kiểm tra…
          </div>
        )}
        {query.isError && (
          <div className="py-16 text-center text-sm text-rose-600">
            {query.error.message}
          </div>
        )}
        {!query.isLoading && !query.isError && !items.length && (
          <div className="py-16 text-center">
            <RadioTower className="mx-auto mb-3 size-10 text-slate-300" />
            <b className="text-ink">Chưa có dữ liệu phù hợp</b>
            <p className="mt-1 text-sm text-muted-foreground">
              Thêm khu vực/thiết bị mới hoặc thay đổi bộ lọc.
            </p>
          </div>
        )}
      </section>
      {catalog.open && (
        <CatalogDialog
          key={`${catalog.item?.id ?? "new"}-${catalog.open}`}
          open={catalog.open}
          onOpenChange={(open) => setCatalog((old) => ({ ...old, open }))}
          item={catalog.item}
          canDelete={canDelete}
        />
      )}
      {inspection && (
        <InspectionDialog
          key={inspection.id}
          item={inspection}
          onClose={() => setInspection(null)}
        />
      )}
      {history && (
        <HistoryDialog item={history} onClose={() => setHistory(null)} />
      )}
    </div>
  );
}
