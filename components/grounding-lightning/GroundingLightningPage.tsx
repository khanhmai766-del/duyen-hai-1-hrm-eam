"use client";
/* eslint-disable @next/next/no-img-element -- ảnh riêng tư được phục vụ qua proxy S3 của ứng dụng */

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
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
import { ImageLightbox } from "@/components/shared/image-lightbox";
import { StatCard } from "@/components/shared/stat-card";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
/*
  Khuôn bảng dùng chung của PCCC / TBYCNN (thanh công cụ số dòng + tìm kiếm, đầu bảng
  xanh EVN có sắp xếp, nút "+" mở khối chi tiết, chân bảng đếm bản ghi + phân trang).
  Tên thư mục là `pccc` vì đó là bảng đầu tiên dùng nó, nhưng đây là bộ dùng chung —
  TbycnnPage cũng nhập từ đây.
*/
import {
  DetailField,
  DetailPanel,
  PcccTableCard,
  PlainHeader,
  ROW_HOVER,
  RowExpander,
  SortHeader,
  TABLE_SCROLLER,
  TD_EXPAND,
  TD_ROW,
  TH_EXPAND,
  TH_NAVY,
  TR_HEAD,
  PCCC_PAGE_SIZES,
  rowBackground,
  type SortState,
} from "@/components/pccc/pccc-table-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, initials } from "@/lib/utils";
import { POSITION_CATALOG } from "@/lib/position-catalog";
import {
  GROUNDING_STATUS_LABEL,
  GROUNDING_TYPES,
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
/*
  Số cột của bảng. Cột “Thao tác” chỉ hiện ở chế độ Sửa bảng (xem `tableEditing`) nên
  `colSpan` của dòng rỗng và dòng chi tiết phải đếm theo, không thể là một hằng số.
*/
const BASE_TABLE_COLUMNS = 8;
/*
  Khoá sắp xếp “giữ nguyên thứ tự máy chủ trả về” (cương vị → khu vực). Bảng này là sổ
  hiện trường: người đi kiểm tra đi theo đúng thứ tự đó, nên nó phải là mặc định và
  phải quay lại được sau khi trót sắp theo cột khác.
*/
/** Bốn thẻ KPI đầu trang — bấm để lọc bảng theo đúng thứ thẻ đang đếm. */
type GroundingKpi = "normal" | "defect" | "unsigned";
const SOURCE_ORDER = "source";
const DEFAULT_SORT: SortState = { key: SOURCE_ORDER, dir: "asc" };
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
        // `whitespace-nowrap`: trong ô bảng hẹp, “Bình thường” gãy đôi dòng làm cả hàng
        // cao gấp đôi, đúng thứ bảng mới vừa dẹp đi được.
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold",
        config.className,
      )}
    >
      <Icon className="size-3.5" />
      {config.label}
    </span>
  );
}

/**
 * Ảnh đại diện người xác nhận. Không có ảnh thì hiện chữ cái đầu trên nền xanh — cùng lối
 * với cột "Người cập nhật" của Lịch sử sửa chữa, để hai bảng nhận ra nhau.
 */
function InspectorAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl?: string | null;
}) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-[10px] font-bold text-white ring-1 ring-border">
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/**
 * Chip tổ máy — GIỐNG HỆT MachineBadge của sổ TBYCNN (components/tbycnn/TbycnnPage.tsx):
 * S1 xanh dương nhạt, S2 tím nhạt, Common chỉ là chữ xám không viền. Hai sổ cùng nói về
 * tổ máy nên phải cùng một ngôn ngữ màu, đổi một nơi mà quên nơi kia là gieo lẫn lộn.
 */
function MachineChip({ machine }: { machine: string }) {
  if (machine === "COMMON") return <span className="text-[11px] text-muted-foreground">Common</span>;
  return (
    <Badge
      className={cn(
        "border-transparent font-mono",
        machine === "S1" ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800"
      )}
    >
      {machine}
    </Badge>
  );
}

/**
 * Ô kết quả của MỘT loại kiểm tra. Khu vực không khai loại đó thì để gạch ngang chứ
 * không bỏ trống — ô trống đọc ra là "quên nhập", gạch ngang là "không áp dụng".
 */
function PointCell({ item, type }: { item: GroundingItem; type: GroundingType }) {
  const point = item.points.find((p) => p.type === type);
  if (!point) return <span className="text-slate-300">—</span>;
  return (
    <span title={point.defectDescription || undefined}>
      <StatusPill status={point.status} />
    </span>
  );
}

/** Gom URL ảnh của MỌI hạng mục thuộc một khu vực, theo đúng thứ tự Tiếp địa → Chống sét. */
function itemPhotoUrls(item: GroundingItem) {
  return item.points.flatMap((point) => point.attachments.map((a) => a.url));
}

function countPhotos(item: GroundingItem) {
  return item.points.reduce((total, point) => total + point.attachments.length, 0);
}

/** Thứ hạng để sắp xếp cột kết quả: hỏng lên trước, rồi chưa kiểm tra, rồi bình thường. */
const STATUS_RANK: Record<GroundingStatus, number> = {
  DEFECT: 0,
  UNCHECKED: 1,
  NORMAL: 2,
};

type RowActionContext = {
  canManage: boolean;
  canCatalog: boolean;
  canDelete: boolean;
  onInspect: (item: GroundingItem) => void;
  onHistory: (item: GroundingItem) => void;
  onEdit: (item: GroundingItem) => void;
  onRemove: (item: GroundingItem) => void;
};

/**
 * Cụm nút của một dòng, dùng chung cho cả bảng (máy tính) lẫn thẻ (điện thoại) — trước
 * đây hai chỗ chép tay riêng nên quyền của nút Sửa và nút Xoá bị đổi chỗ cho nhau ở bản
 * bảng. Mốc đúng là phía máy chủ: sửa danh mục cần quyền `catalog`, xoá cần quyền `delete`.
 */
function RowActions({ item, ctx }: { item: GroundingItem; ctx: RowActionContext }) {
  return (
    // Trong BẢNG thì không cho gãy dòng: năm nút xếp ba tầng làm hàng cao 113px, gấp ba
    // mọi hàng khác — đúng thứ việc dựng lại bảng định dẹp đi; cột Thao tác đã đủ rộng.
    // Trên điện thoại thì ngược lại, phải cho xuống dòng kẻo tràn khỏi bề ngang màn hình.
    <div className="flex flex-wrap items-center justify-center gap-1 md:flex-nowrap">
      {ctx.canManage && (
        <Button size="sm" variant="soft" onClick={() => ctx.onInspect(item)}>
          <ShieldCheck />
          Kiểm tra
        </Button>
      )}
      {/* KHÔNG còn nút "Xác nhận" trên từng dòng: việc đó nay do nút Lưu trên thanh
          tiêu đề làm một lượt cho mọi dòng vừa sửa trong lượt Sửa bảng này. */}
      <Button
        size="icon"
        variant="ghost"
        title="Lịch sử"
        className="size-8"
        onClick={() => ctx.onHistory(item)}
      >
        <History />
      </Button>
      {ctx.canCatalog && (
        <Button
          size="icon"
          variant="ghost"
          title="Sửa danh mục"
          className="size-8"
          onClick={() => ctx.onEdit(item)}
        >
          <Pencil />
        </Button>
      )}
      {ctx.canDelete && (
        <Button
          size="icon"
          variant="ghost"
          title="Xoá"
          className="size-8 text-rose-600"
          onClick={() => ctx.onRemove(item)}
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}

/**
 * Khung bấm được của một thẻ KPI — CHÉP NGUYÊN từ TbycnnPage.tsx (hàm ở đó không export,
 * mỗi trang tự giữ một bản). Bọc quanh `StatCard` dùng chung (components/shared/stat-card)
 * — cùng một thẻ gradient bóng kính + hoạ tiết nền đang chạy ở Dashboard, HR, sổ TBYCNN —
 * để bốn thẻ ở đây nhìn ra ngay là "cùng hệ thống", không phải một góc tự vẽ riêng.
 */
function KpiCard({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group/kpi block w-full rounded-xl text-left transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/10",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
        // Thẻ đang được dùng làm bộ lọc: viền đậm để biết bảng bên dưới đang cắt theo thẻ nào.
        active && "ring-2 ring-accent ring-offset-2"
      )}
    >
      {children}
    </button>
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
  onSaved,
  onClose,
}: {
  item: GroundingItem | null;
  /** Báo lên trang là khu vực này vừa ghi kết quả — nút Lưu sẽ xác nhận đúng các dòng đó. */
  onSaved?: (id: string) => void;
  onClose: () => void;
}) {
  const update = useUpdateGroundingItem();
  const upload = useUploadGroundingImage();
  const removeImage = useDeleteGroundingImage();
  const [note, setNote] = useState(item?.note ?? "");
  /*
    Ảnh vừa xoá trong lượt mở hộp thoại này.

    `item` là ẢNH CHỤP lấy lúc bấm "Kiểm tra", không tự tươi lại khi danh sách được nạp
    lại — nên xoá ảnh xong thì ảnh cũ vẫn còn nằm đó và ô "còn chỗ cho ảnh" vẫn báo hết
    chỗ, đúng cảnh người dùng gặp khi tải nhầm ảnh rồi muốn tải lại ngay.
  */
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
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
      onSaved?.(item.id);
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
            const attachments = point.attachments.filter(
              (image) => !removedImageIds.includes(image.id),
            );
            // Còn chỗ cho ảnh không? Ảnh đã lưu và ảnh đang chờ tải cùng tranh MỘT chỗ.
            const imageSlotFree = attachments.length + value.files.length === 0;
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
                    {/*
                      MỘT ảnh cho mỗi hạng mục. Hết chỗ thì giấu hẳn nút chọn thay vì để
                      nó xám: nút xám không nói được vì sao bấm không ăn, còn dòng chữ
                      dưới đây chỉ thẳng việc phải làm là gỡ ảnh cũ đi.
                      Đếm CẢ ảnh đã lưu lẫn ảnh đang chờ tải — ảnh chờ cũng sẽ chiếm chỗ đó
                      ngay khi bấm Lưu, cho chọn thêm chỉ để máy chủ chặn là mất công.
                    */}
                    {imageSlotFree ? (
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-cyan-400 bg-white px-3 py-2 text-sm font-semibold text-cyan-800">
                        <ImagePlus className="size-4" />
                        Thêm hình ảnh
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          onChange={(e) => {
                            const picked = e.target.files?.[0];
                            // Dọn ô chọn tệp: không dọn thì gỡ ảnh ra rồi chọn LẠI ĐÚNG
                            // tệp đó sẽ không kích hoạt onChange, trông như nút hỏng.
                            e.target.value = "";
                            if (!picked) return;
                            setResults({
                              ...results,
                              [point.type]: { ...value, files: [picked] },
                            });
                          }}
                        />
                      </label>
                    ) : (
                      <p className="text-xs text-slate-500">
                        Mỗi hạng mục chỉ lưu <b>1 hình ảnh</b>. Gỡ ảnh hiện có nếu muốn thay ảnh khác.
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {attachments.map((image) => (
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
                                setRemovedImageIds((old) => [...old, image.id]);
                                toast.success("Đã xoá ảnh — có thể tải ảnh khác");
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
                      {/* Ảnh CHƯA tải lên: gỡ ngay tại chỗ, không phải huỷ cả hộp thoại
                          rồi mở lại — chọn nhầm tệp là chuyện thường. */}
                      {value.files.map((file, index) => (
                        <span
                          key={`${file.name}-${index}`}
                          className="relative inline-flex h-20 max-w-40 items-center gap-2 rounded-xl border bg-white px-3 text-xs"
                        >
                          <Camera className="size-4 shrink-0 text-cyan-700" />
                          <span className="truncate" title={file.name}>
                            {file.name}
                          </span>
                          <button
                            type="button"
                            title="Gỡ ảnh chưa tải lên"
                            onClick={() =>
                              setResults({
                                ...results,
                                [point.type]: {
                                  ...value,
                                  files: value.files.filter((_, i) => i !== index),
                                },
                              })
                            }
                            className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-slate-600 text-white shadow"
                          >
                            <X className="size-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-rose-700">
                      Chuyển hạng mục sang “Bình thường” sẽ xóa ảnh của hạng mục
                      này khỏi S3 khi lưu.
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
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PCCC_PAGE_SIZES[0]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /*
    Bấm thẻ KPI lọc bảng — nhưng KHÔNG tái dùng `filters.status` (bộ lọc "Kết quả" của
    hộp Bộ lọc): filter đó khớp "CÓ MỘT hạng mục mang trạng thái X" (server dùng
    `points: { some: { status } }`), còn thẻ "Hoàn toàn bình thường" đếm khu vực có
    TOÀN BỘ hạng mục là NORMAL — hai phép khớp khác hẳn nhau. "Chờ xác nhận" lại dựa vào
    `needsSignature`, thứ không tồn tại trong bộ lọc server. Lọc thêm một lớp Ở CLIENT
    trên chính `items` đã tải, giữ ý nghĩa đúng như số đang hiện trên từng thẻ.
  */
  const [activeKpi, setActiveKpi] = useState<GroundingKpi | null>(null);
  const toggleKpi = (kpi: GroundingKpi) =>
    setActiveKpi((old) => (old === kpi ? null : kpi));
  const matchesKpi = (item: GroundingItem, kpi: GroundingKpi) => {
    switch (kpi) {
      case "normal":
        return item.points.every((point) => point.status === "NORMAL");
      case "defect":
        return item.points.some((point) => point.status === "DEFECT");
      case "unsigned":
        return item.needsSignature;
    }
  };
  // Ảnh đang xem trong hộp phóng to — { urls, index } chứ không chỉ index, vì mỗi khu
  // vực có một danh sách ảnh riêng.
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  /*
    CHẾ ĐỘ SỬA BẢNG — cùng khuôn với sổ TBYCNN và trang PCCC.

    Xem thường thì cột "Thao tác" không hiện: nó rộng 320px và hầu hết thời gian người ta
    vào đây chỉ để ĐỌC. Bật Sửa bảng mới mở cột đó ra, đồng thời cặp Huỷ / Lưu thay chỗ
    nút Chỉnh sửa.

    `touchedIds` là các khu vực đã ghi kết quả kiểm tra TRONG lượt này — đúng và chỉ những
    dòng đó được nút Lưu xác nhận. Cố ý không ký cả 202 dòng đang chờ: đây là sổ an toàn,
    ký một dòng chưa ai đi kiểm tra là ghi nhận khống.
  */
  const [tableEditing, setTableEditing] = useState(false);
  const [touchedIds, setTouchedIds] = useState<string[]>([]);
  const tableColumns = BASE_TABLE_COLUMNS + (tableEditing ? 1 : 0);
  const toggleSort = (key: string) =>
    setSort((old) =>
      old.key === key
        ? { key, dir: old.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  /*
    Số ô lọc đang bật — hiện thành huy hiệu trên nút "Bộ lọc" để biết bảng đang bị cắt bớt
    mà không phải mở bảng chọn ra xem. Ô tìm kiếm KHÔNG tính vào đây: nó nằm ngay trên thanh
    công cụ của bảng, người dùng luôn nhìn thấy chữ mình vừa gõ.
  */
  const activeFilterCount = [
    filters.positionCode,
    filters.machine,
    filters.type,
    filters.status,
  ].filter((value) => value !== "ALL").length;
  const hasFilter = filters.q.trim() !== "" || activeFilterCount > 0 || activeKpi !== null;
  const clearFilters = () => {
    setFilters({
      q: "",
      positionCode: "ALL",
      machine: "ALL",
      type: "ALL",
      status: "ALL",
    });
    setActiveKpi(null);
  };
  /*
    Sắp xếp Ở CLIENT: máy chủ trả về toàn bộ danh mục (vài trăm dòng) trong một lượt, khác
    sổ PCCC/TBYCNN hàng nghìn dòng phải phân trang từ máy chủ. Giữ nguyên thứ tự gốc khi
    chưa chọn cột nào để sổ vẫn chạy theo tuyến đi hiện trường.
  */
  const kpiFiltered = useMemo(
    () => (activeKpi ? items.filter((item) => matchesKpi(item, activeKpi)) : items),
    [items, activeKpi],
  );
  const sorted = useMemo(() => {
    if (sort.key === SOURCE_ORDER) return kpiFiltered;
    const dir = sort.dir === "asc" ? 1 : -1;
    const text = (value?: string | null) => (value || "").toLocaleLowerCase("vi-VN");
    const statusRank = (item: GroundingItem, type: GroundingType) => {
      const point = item.points.find((p) => p.type === type);
      // Khu vực không khai loại này xuống cuối ở CẢ HAI chiều, không lẫn vào nhóm có dữ liệu.
      return point ? STATUS_RANK[point.status] : 99;
    };
    return [...kpiFiltered].sort((a, b) => {
      switch (sort.key) {
        case "position":
          return text(a.position).localeCompare(text(b.position), "vi") * dir;
        case "area":
          return a.areaEquipment.localeCompare(b.areaEquipment, "vi") * dir;
        case "machine":
          return a.machine.localeCompare(b.machine, "vi") * dir;
        case "GROUNDING":
        case "LIGHTNING":
          return (
            (statusRank(a, sort.key) - statusRank(b, sort.key)) * dir ||
            a.areaEquipment.localeCompare(b.areaEquipment, "vi")
          );
        case "signed": {
          // Chưa xác nhận là thứ cần nhìn thấy nhất — cho đứng đầu ở chiều tăng dần.
          const at = a.latestInspection?.signedAt ?? "";
          const bt = b.latestInspection?.signedAt ?? "";
          return at.localeCompare(bt) * dir;
        }
        default:
          return 0;
      }
    });
  }, [kpiFiltered, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize],
  );
  // Đổi bộ lọc / cách sắp xếp / cỡ trang thì trang hiện tại không còn nghĩa gì.
  useEffect(() => {
    setPage(1);
  }, [filters, sort, pageSize, activeKpi]);
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
  const rowActions: RowActionContext = {
    canManage,
    canCatalog,
    canDelete,
    onInspect: setInspection,
    onHistory: setHistory,
    onEdit: (item) => setCatalog({ open: true, item }),
    onRemove: doDelete,
  };
  const beginEdit = () => {
    setTouchedIds([]);
    setTableEditing(true);
  };
  /*
    Huỷ chỉ ĐÓNG chế độ sửa, KHÔNG hoàn tác kết quả đã ghi: hộp "Kiểm tra" lưu thẳng vào
    CSDL ngay lúc bấm (nó còn tải ảnh lên S3), nên không có bản nháp nào để bỏ đi. Thứ
    Huỷ bỏ qua là bước XÁC NHẬN — dòng vừa sửa ở lại trạng thái chờ xác nhận.
  */
  const cancelEdit = () => {
    setTouchedIds([]);
    setTableEditing(false);
  };
  const saveEdits = async () => {
    if (touchedIds.length === 0) {
      setTableEditing(false);
      return;
    }
    try {
      // Tuần tự chứ không song song: mỗi lượt ký là một request ghi, bắn 200 request cùng
      // lúc là tự làm nghẽn chính mình và lỗi giữa chừng thì không biết đã ký tới đâu.
      for (const id of touchedIds) await sign.mutateAsync(id);
      toast.success(`Đã xác nhận ${touchedIds.length} khu vực/thiết bị`);
      setTouchedIds([]);
      setTableEditing(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không xác nhận được",
      );
    }
  };
  return (
    <div className="relative min-h-[calc(100vh-7rem)] space-y-5 pb-10">
      <div className="pointer-events-none absolute -right-10 -top-12 -z-10 size-72 rounded-full bg-cyan-200/20 blur-3xl" />
      <PageHeader
        title="TIẾP ĐỊA & CHỐNG SÉT"
        description="Kiểm tra định kỳ V2, thứ 7 hằng tuần"
        mobileTitle="TIẾP ĐỊA & CHỐNG SÉT"
      >
        <>
          {/* Một cửa "Chỉnh sửa" như sổ TBYCNN và trang PCCC; đang mở khoá thì đổi thành
              cặp Huỷ / Lưu. */}
          {canManage &&
            (tableEditing ? (
              <>
                <Button
                  variant="outline"
                  size="toolbar"
                  onClick={cancelEdit}
                  disabled={sign.isPending}
                >
                  Huỷ
                </Button>
                <Button size="toolbar" onClick={saveEdits} disabled={sign.isPending}>
                  <Save className={cn("mr-1.5 size-4", sign.isPending && "animate-pulse")} />
                  {sign.isPending
                    ? "Đang lưu…"
                    : touchedIds.length > 0
                      ? `Lưu ${touchedIds.length} dòng`
                      : "Lưu"}
                </Button>
              </>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="soft" size="toolbar" className="group">
                    <Pencil className="mr-1.5 size-4 text-sky-600" />
                    Chỉnh sửa
                    <ChevronDown className="ml-1 size-3.5 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[268px]">
                  <DropdownMenuLabel className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Tiếp địa &amp; chống sét
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={beginEdit} className="gap-2">
                    <Pencil className="size-4 text-sky-600" />
                    <span className="min-w-0">
                      <span className="block font-medium">Sửa bảng</span>
                      <span className="block text-[11px] text-muted-foreground">
                        Mở cột thao tác, xác nhận một lượt khi bấm Lưu
                      </span>
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          {/* Bộ lọc gom vào MỘT nút, bấm mới sổ bảng chọn — cùng khuôn với trang PCCC và
              sổ TBYCNN, và trả lại chiều cao cho bảng thay vì một hàng ô lọc luôn chiếm
              chỗ dù hầu hết thời gian không dùng tới. */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="soft"
                size="toolbar"
                className="group min-w-[112px] justify-between"
              >
                <span className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-sky-600" />
                  Bộ lọc
                  {activeFilterCount > 0 && (
                    <span className="grid size-5 place-items-center rounded-full bg-accent text-[10px] font-bold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border-slate-200/90 bg-white p-0 shadow-[0_22px_55px_rgba(15,23,42,0.18)]"
            >
              <div className="flex items-center justify-between gap-3 border-b border-sky-100 bg-[linear-gradient(135deg,#f8fbff_0%,#edf7ff_58%,#f0fdfa_100%)] px-4 py-3.5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">
                    Lọc nội dung bảng
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">
                    Tiếp địa &amp; chống sét
                  </p>
                </div>
                {hasFilter && (
                  <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="mr-1.5 size-3.5" />
                    Xoá lọc
                  </Button>
                )}
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-slate-600">Cương vị</Label>
                  <Select
                    value={filters.positionCode}
                    onValueChange={(value) =>
                      setFilters({ ...filters, positionCode: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Cương vị" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Tất cả cương vị</SelectItem>
                      {positions.map((p: any) => (
                        <SelectItem key={p.code} value={p.code}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-slate-600">Tổ máy</Label>
                  <Select
                    value={filters.machine}
                    onValueChange={(value) => setFilters({ ...filters, machine: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Tổ máy" />
                    </SelectTrigger>
                    <SelectContent>
                      {MACHINES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-slate-600">
                    Loại kiểm tra
                  </Label>
                  <Select
                    value={filters.type}
                    onValueChange={(value) => setFilters({ ...filters, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Loại kiểm tra" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Mọi loại kiểm tra</SelectItem>
                      {GROUNDING_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {GROUNDING_TYPE_LABEL[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-slate-600">Kết quả</Label>
                  <Select
                    value={filters.status}
                    onValueChange={(value) => setFilters({ ...filters, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Kết quả" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Mọi kết quả</SelectItem>
                      {Object.entries(GROUNDING_STATUS_LABEL).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>
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
        {/* Thẻ Tổng KHÔNG lọc theo giá trị riêng — bấm nó để BỎ lọc KPI đang chọn, cùng
            việc active=true khi chưa chọn thẻ nào, cho biết "đang xem tất cả". Bốn tông
            màu — navy/green/red/amber — và bốn hoạ tiết — grid/dots/hazard/ticks — lấy
            đúng bộ đang dùng ở sổ TBYCNN, cùng ngôn ngữ hình ảnh cho cả hai sổ thiết bị. */}
        <KpiCard active={activeKpi === null} onClick={() => setActiveKpi(null)}>
          <StatCard
            compact
            labelTop
            texture="grid"
            label="Khu vực/thiết bị"
            value={metrics.total}
            icon={RadioTower}
            tint="navy"
          />
        </KpiCard>
        <KpiCard active={activeKpi === "normal"} onClick={() => toggleKpi("normal")}>
          <StatCard
            compact
            labelTop
            texture="dots"
            label="Hoàn toàn bình thường"
            value={metrics.normal}
            icon={CheckCircle2}
            tint="green"
          />
        </KpiCard>
        <KpiCard active={activeKpi === "defect"} onClick={() => toggleKpi("defect")}>
          <StatCard
            compact
            labelTop
            texture="hazard"
            label="Có khiếm khuyết"
            value={metrics.defect}
            icon={AlertTriangle}
            tint="red"
          />
        </KpiCard>
        <KpiCard active={activeKpi === "unsigned"} onClick={() => toggleKpi("unsigned")}>
          <StatCard
            compact
            labelTop
            texture="ticks"
            label="Chờ xác nhận"
            value={metrics.unsigned}
            icon={FileClock}
            tint="amber"
          />
        </KpiCard>
      </div>
      <PcccTableCard
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        search={filters.q}
        onSearchChange={(value) => setFilters({ ...filters, q: value })}
        searchPlaceholder="Tìm khu vực, thiết bị, khiếm khuyết…"
        page={page}
        pageCount={pageCount}
        total={sorted.length}
        filtered={hasFilter}
        onPageChange={setPage}
        toolbarExtra={
          sort.key !== SOURCE_ORDER ? (
            <Button variant="ghost" size="sm" onClick={() => setSort(DEFAULT_SORT)}>
              Về thứ tự hồ sơ gốc
            </Button>
          ) : null
        }
      >
        <div className="hidden md:block">
          <Table
            className={tableEditing ? "min-w-[1520px]" : "min-w-[1200px]"}
            wrapperClassName={TABLE_SCROLLER}
          >
            <TableHeader>
              <TableRow className={TR_HEAD}>
                <TableHead className={cn(TH_NAVY, TH_EXPAND)} />
                <TableHead className={cn(TH_NAVY, "w-[150px]")}>
                  <SortHeader label="Cương vị" sortKey="position" sort={sort} onSort={toggleSort} />
                </TableHead>
                {/* Cột định danh căn TRÁI: đây là chữ để đọc, không phải giá trị để dóng cột. */}
                <TableHead className={cn(TH_NAVY, "w-[260px]")}>
                  <SortHeader label="Khu vực/thiết bị" sortKey="area" sort={sort} onSort={toggleSort} align="left" />
                </TableHead>
                <TableHead className={cn(TH_NAVY, "w-[110px]")}>
                  <SortHeader label="Tổ máy" sortKey="machine" sort={sort} onSort={toggleSort} />
                </TableHead>
                {/*
                  Hai loại kiểm tra tách thành HAI CỘT thay vì xếp chồng trong một ô: mỗi khu
                  vực chỉ còn một dòng cao bằng mọi dòng khác (bản cũ mỗi dòng cao gấp ba, xem
                  được 4 khu vực một màn hình), và đọc dọc được theo từng loại — lướt một cột
                  là thấy ngay chỗ nào tiếp địa đang hỏng.
                */}
                <TableHead className={cn(TH_NAVY, "w-[170px]")}>
                  <SortHeader label="Tiếp địa" sortKey="GROUNDING" sort={sort} onSort={toggleSort} />
                </TableHead>
                <TableHead className={cn(TH_NAVY, "w-[170px]")}>
                  <SortHeader label="Chống sét" sortKey="LIGHTNING" sort={sort} onSort={toggleSort} />
                </TableHead>
                <TableHead className={cn(TH_NAVY, "w-[90px]")}>
                  <PlainHeader label="Hình ảnh" />
                </TableHead>
                <TableHead className={cn(TH_NAVY, "w-[200px]")}>
                  <SortHeader label="Người xác nhận" sortKey="signed" sort={sort} onSort={toggleSort} />
                </TableHead>
                {tableEditing && (
                  <TableHead className={cn(TH_NAVY, "w-[320px]")}>
                    <PlainHeader label="Thao tác" />
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={tableColumns} className="py-14 text-center">
                    <RadioTower className="mx-auto mb-3 size-10 text-slate-300" />
                    <b className="text-ink">Chưa có dữ liệu phù hợp</b>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Thêm khu vực/thiết bị mới hoặc thay đổi bộ lọc.
                    </p>
                  </TableCell>
                </TableRow>
              )}
              {pageRows.map((item, index) => {
                const expanded = expandedId === item.id;
                // Dòng vừa ghi kết quả trong lượt này tô vàng — nhìn một cái là biết bấm
                // Lưu sẽ xác nhận những dòng nào, không phải nhớ mình vừa bấm ở đâu.
                const touched = touchedIds.includes(item.id);
                const rowBg = touched
                  ? "bg-amber-50"
                  : rowBackground({ index, expanded });
                const photoCount = countPhotos(item);
                const defectPoints = item.points.filter((point) => point.defectDescription);
                return (
                  <Fragment key={item.id}>
                    <TableRow className={cn(rowBg, ROW_HOVER)}>
                      <TableCell className={cn(TD_EXPAND, rowBg)}>
                        <RowExpander
                          expanded={expanded}
                          onToggle={() => setExpandedId(expanded ? null : item.id)}
                        />
                      </TableCell>
                      <TableCell className={cn(TD_ROW, "whitespace-nowrap text-center font-medium")}>
                        {item.position || "—"}
                      </TableCell>
                      <TableCell className={cn(TD_ROW, "font-semibold text-ink")}>
                        {item.areaEquipment}
                      </TableCell>
                      <TableCell className={cn(TD_ROW, "text-center")}>
                        <MachineChip machine={item.machine} />
                      </TableCell>
                      <TableCell className={cn(TD_ROW, "text-center")}>
                        <PointCell item={item} type="GROUNDING" />
                      </TableCell>
                      <TableCell className={cn(TD_ROW, "text-center")}>
                        <PointCell item={item} type="LIGHTNING" />
                      </TableCell>
                      {/* Ghi chú đã rời khỏi bảng (xem khối chi tiết của nút "+"), nhưng số
                          ảnh thì ở lại: đây là cột người ta dò theo chiều dọc để biết khu
                          vực nào đã có ảnh hiện trường. */}
                      <TableCell className={cn(TD_ROW, "text-center")}>
                        {photoCount > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setLightbox({ urls: itemPhotoUrls(item), index: 0 })
                            }
                            className="inline-flex items-center gap-1 font-semibold text-cyan-700 underline-offset-2 hover:underline"
                            title="Xem ảnh đã lưu"
                          >
                            <Camera className="size-3.5" />
                            {photoCount}
                          </button>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </TableCell>
                      <TableCell className={cn(TD_ROW, "text-center")}>
                        {item.latestInspection ? (
                          <span
                            className="flex items-center gap-2 text-left"
                            title={`${item.latestInspection.inspectorName}${
                              item.latestInspection.inspectorPosition
                                ? ` · ${item.latestInspection.inspectorPosition}`
                                : ""
                            } · ${fmtDate(item.latestInspection.signedAt)}`}
                          >
                            <InspectorAvatar
                              name={item.latestInspection.inspectorName}
                              avatarUrl={item.latestInspection.inspectorAvatarUrl}
                            />
                            <span className="min-w-0 leading-tight">
                              <b className="block truncate">
                                {item.latestInspection.inspectorName}
                              </b>
                              <span className="block text-[11px] text-muted-foreground">
                                {fmtDate(item.latestInspection.signedAt)}
                              </span>
                              {item.needsSignature && (
                                <span className="block text-[11px] font-bold text-amber-700">
                                  Cần xác nhận lại
                                </span>
                              )}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Chưa xác nhận</span>
                        )}
                      </TableCell>
                      {tableEditing && (
                        <TableCell className={cn(TD_ROW, "text-center")}>
                          <RowActions item={item} ctx={rowActions} />
                        </TableCell>
                      )}
                    </TableRow>
                    {expanded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={tableColumns} className="bg-slate-50/80 p-0">
                          <DetailPanel>
                            <DetailField label="Cương vị">{item.position || "—"}</DetailField>
                            <DetailField label="Tổ máy">{machineLabel(item.machine)}</DetailField>
                            <DetailField label="Cập nhật">{fmtDate(item.updatedAt)}</DetailField>
                            {/*
                              KHÔNG lặp lại hai chip kết quả ở đây: cột "Tiếp địa" và "Chống
                              sét" trên bảng đã nói đúng thứ đó, ngay trên dòng vừa bấm mở.
                              Chỉ giữ phần MÔ TẢ khiếm khuyết — thứ không hiện ở đâu khác
                              trong bảng (trên dòng nó chỉ là chú giải khi rê chuột).
                            */}
                            {defectPoints.length > 0 && (
                              <DetailField label="Khiếm khuyết" span="full">
                                <div className="space-y-1">
                                  {defectPoints.map((point) => (
                                    <p key={point.id} className="whitespace-pre-line text-rose-700">
                                      <b>{GROUNDING_TYPE_LABEL[point.type]}</b> — {point.defectDescription}
                                    </p>
                                  ))}
                                </div>
                              </DetailField>
                            )}
                            <DetailField label="Ghi chú" span="full">
                              {item.note ? (
                                <span className="whitespace-pre-line">{item.note}</span>
                              ) : (
                                "—"
                              )}
                            </DetailField>
                            <DetailField label="Xác nhận" span="full">
                              {item.latestInspection ? (
                                <>
                                  <b>{item.latestInspection.inspectorName}</b>
                                  {item.latestInspection.inspectorPosition
                                    ? ` · ${item.latestInspection.inspectorPosition}`
                                    : ""}{" "}
                                  · {fmtDate(item.latestInspection.signedAt)}
                                  {item.needsSignature && (
                                    <span className="ml-2 font-bold text-amber-700">
                                      Có thay đổi sau lần xác nhận, cần xác nhận lại
                                    </span>
                                  )}
                                </>
                              ) : (
                                "Chưa có lần xác nhận nào"
                              )}
                            </DetailField>
                          </DetailPanel>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {/* Điện thoại: giữ dạng THẺ của riêng trang này thay vì mượn CSS thu gọn bảng của
            PCCC — bộ CSS đó ẩn mọi cột từ thứ 5 trở đi, tức nuốt luôn hai ô kết quả lẫn cụm
            nút thao tác, đúng những thứ người đi hiện trường cần nhất. */}
        <div className="divide-y md:hidden">
          {pageRows.map((item) => (
            <article key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-cyan-700">
                    {item.position} · {machineLabel(item.machine)}
                  </span>
                  <h3 className="mt-1 font-bold text-ink">{item.areaEquipment}</h3>
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
              {tableEditing && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <RowActions item={item} ctx={rowActions} />
                </div>
              )}
            </article>
          ))}
          {pageRows.length === 0 && (
            <div className="py-16 text-center">
              <RadioTower className="mx-auto mb-3 size-10 text-slate-300" />
              <b className="text-ink">Chưa có dữ liệu phù hợp</b>
              <p className="mt-1 text-sm text-muted-foreground">
                Thêm khu vực/thiết bị mới hoặc thay đổi bộ lọc.
              </p>
            </div>
          )}
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
      </PcccTableCard>
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
          onSaved={(id) =>
            setTouchedIds((old) => (old.includes(id) ? old : [...old, id]))
          }
          onClose={() => setInspection(null)}
        />
      )}
      {history && (
        <HistoryDialog item={history} onClose={() => setHistory(null)} />
      )}
      <ImageLightbox
        images={lightbox?.urls ?? []}
        index={lightbox?.index ?? null}
        onIndexChange={(index) =>
          setLightbox((old) => (old ? { ...old, index } : old))
        }
        onClose={() => setLightbox(null)}
        alt="Ảnh khiếm khuyết"
      />
    </div>
  );
}
