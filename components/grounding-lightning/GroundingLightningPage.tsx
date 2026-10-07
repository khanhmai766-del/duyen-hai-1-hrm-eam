"use client";

import { GROUNDING_RETENTION_DESCRIPTION } from "@/lib/grounding-retention";
/* eslint-disable @next/next/no-img-element -- ảnh riêng tư được phục vụ qua proxy S3 của ứng dụng */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import { SHIFT_TYPE, SHIFT_TYPE_ORDER, type ShiftTypeKey } from "@/lib/constants";
import { GROUNDING_SHIFT_HOURS, GROUNDING_SHIFT_HOURS_COMPACT, currentGroundingSlot, groundingSlotWindow, sameGroundingSlot, type GroundingSlot } from "@/lib/grounding-inspection-schedule";
import { formatVietnamDate, VIETNAM_TIME_ZONE } from "@/lib/vietnam-time";
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
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-base sm:text-sm text-ink outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-900";
/*
  Cột chọn và thao tác kiểm tra chỉ có trong ca hiện tại khi đủ quyền.
  Dòng rỗng và chi tiết dùng số cột tương ứng.
*/
const BASE_TABLE_COLUMNS = 8;

function isNormalItem(item: GroundingItem) {
  return item.canInspect !== false && item.needsSignature && item.points.length > 0 && item.points.every((point) => point.status === "NORMAL");
}
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
        timeZone: VIETNAM_TIME_ZONE,
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
        <img
          src={avatarUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
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

function RowActions({ item, ctx }: { item: GroundingItem; ctx: RowActionContext }) {
  return ctx.canManage ? <Button className="h-10" variant="soft" onClick={() => ctx.onInspect(item)}><ShieldCheck />Kiểm tra</Button> : null;
}

function CatalogActions({ item, ctx }: { item: GroundingItem; ctx: RowActionContext }) {
  if (!ctx.canCatalog && !ctx.canDelete) return null;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="outline" className="h-10"><Pencil className="size-4" />Danh mục<ChevronDown className="size-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuLabel>Quản lý danh mục</DropdownMenuLabel>
      {ctx.canCatalog && <DropdownMenuItem onSelect={() => ctx.onEdit(item)}><Pencil className="mr-2 size-4" />Sửa danh mục</DropdownMenuItem>}
      {ctx.canDelete && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => ctx.onRemove(item)} className="text-rose-700"><Trash2 className="mr-2 size-4" />Xoá khỏi danh mục</DropdownMenuItem></>}
    </DropdownMenuContent>
  </DropdownMenu>;
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
  assignedShift: string;
};
/** Phạm vi cương vị của người đang mở hộp thoại — trả về nguyên văn từ API (xem
 *  groundingScopeWithPermissions ở máy chủ), KHÔNG suy từ danh sách `positions` trong
 *  meta: danh sách đó chỉ liệt kê cương vị ĐÃ CÓ SẴN dữ liệu, một người vừa được giao
 *  cương vị mới toanh (chưa ai khai báo khu vực nào) sẽ thấy danh sách đó rỗng. */
type GroundingScope = { all: boolean; positionCode: string | null };
const EMPTY_FORM: CatalogForm = {
  areaEquipment: "",
  positionCode: "",
  machine: "COMMON",
  types: ["GROUNDING"],
  note: "",
  assignedShift: "AUTO",
};

function CatalogDialog({
  open,
  onOpenChange,
  item,
  canDelete,
  scope,
  canAssignShift,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: GroundingItem | null;
  canDelete: boolean;
  canAssignShift: boolean;
  /** null = chưa tải kịp phạm vi; xử lý như bị giới hạn (khoá ô) cho an toàn. */
  scope: GroundingScope | null;
}) {
  const create = useCreateGroundingItem();
  const update = useUpdateGroundingItem();
  // Bị giới hạn phạm vi thì KHÔNG được đổi cương vị của dòng đã có, và dòng MỚI phải tạo
  // đúng cương vị của mình — máy chủ chặn cả hai việc này, ở đây chỉ khoá ô cho khỏi bấm
  // nhầm rồi nhận lỗi 403.
  const positionLocked = !scope?.all;
  const initial = item
    ? {
        areaEquipment: item.areaEquipment,
        positionCode: item.positionCode ?? "",
        machine: item.machine,
        types: item.points.map((point) => point.type),
        note: item.note ?? "",
        assignedShift: item.assignedShift ?? "AUTO",
      }
    : { ...EMPTY_FORM, positionCode: positionLocked ? (scope?.positionCode ?? "") : "" };
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
      const { assignedShift, ...fields } = form;
      const payload = { ...fields, ...(canAssignShift ? { assignedShift: assignedShift === "AUTO" ? null : assignedShift } : {}) };
      if (item) await update.mutateAsync({ id: item.id, ...payload });
      else await create.mutateAsync(payload);
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
              className={cn(CONTROL, positionLocked && "cursor-not-allowed bg-slate-50 text-slate-400")}
              value={form.positionCode}
              disabled={positionLocked}
              title={
                positionLocked
                  ? "Bạn chỉ thêm/sửa được thiết bị thuộc cương vị đang quản lý"
                  : undefined
              }
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
            {positionLocked && (
              <p className="mt-1 text-xs text-muted-foreground">
                Chỉ thêm/sửa được thiết bị thuộc cương vị đang quản lý.
              </p>
            )}
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
          {canAssignShift && <Field label="Ca kiểm tra" span>
            <select aria-label="Ca kiểm tra" className={CONTROL} value={form.assignedShift} onChange={(e) => setForm({ ...form, assignedShift: e.target.value })}>
              <option value="AUTO">Tự chia đều</option>
              {SHIFT_TYPE_ORDER.map((shift) => <option key={shift} value={shift}>Ca {SHIFT_TYPE[shift].label.toLocaleLowerCase("vi")}</option>)}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">Chỉ định ca phù hợp cho khu vực đặc thù. Các khu vực tự động được chia vào các ca còn ít nhiệm vụ hơn.</p>
          </Field>}
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
  const sign = useSignGroundingItem();
  const [saving, setSaving] = useState(false);
  const uploadedFiles = useRef(new Map<File, string>());
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
    if (saving) return;
    if (item.points.some((point) => results[point.type].status === "UNCHECKED")) {
      toast.error("Chọn kết quả cho tất cả hạng mục trước khi xác nhận"); return;
    }
    if (item.points.some((point) => results[point.type].status === "DEFECT" && !results[point.type].defectDescription.trim())) {
      toast.error("Nhập nội dung khiếm khuyết trước khi xác nhận"); return;
    }
    setSaving(true);
    let resultSaved = false;
    try {
      const saved = await update.mutateAsync({
        id: item.id,
        note,
        inspectionDate: item.inspectionDate,
        shiftType: item.inspectionShift,
        results: item.points.map((point) => ({
          type: point.type,
          status: results[point.type].status,
          defectDescription: results[point.type].defectDescription,
        })),
      });
      resultSaved = true;
      for (const point of saved.points)
        for (const file of results[point.type]?.files ?? []) {
          if (uploadedFiles.current.has(file)) continue;
          const attachment = await upload.mutateAsync({
            itemId: item.id,
            pointId: point.id,
            file,
          });
          uploadedFiles.current.set(file, attachment.id);
        }
      await sign.mutateAsync({ id: item.id, inspectionDate: item.inspectionDate, shiftType: item.inspectionShift });
      toast.success("Đã lưu và xác nhận kiểm tra");
      onClose();
    } catch (error) {
      toast.error(
        `${resultSaved ? "Kết quả đã lưu nhưng chưa xác nhận. " : ""}${error instanceof Error ? error.message : "Không lưu được kết quả"}`,
      );
    } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Cập nhật kết quả kiểm tra</DialogTitle>
          <DialogDescription>
            {item.areaEquipment} · {item.position} ·{" "}
            {machineLabel(item.machine)}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" inert={saving || removeImage.isPending}>
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
                              loading="lazy"
                              decoding="async"
                              className="h-20 w-24 rounded-xl border bg-white object-cover"
                            />
                          </a>
                          <button
                            type="button"
                            title="Xoá ảnh"
                            onClick={async () => {
                              if (!confirm("Xoá ảnh kiểm tra này?"))
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
                            title="Gỡ ảnh"
                            onClick={async () => {
                              try {
                                const attachmentId = uploadedFiles.current.get(file);
                                if (attachmentId) await removeImage.mutateAsync(attachmentId);
                                uploadedFiles.current.delete(file);
                                setResults((old) => ({ ...old, [point.type]: { ...old[point.type], files: old[point.type].files.filter((_, i) => i !== index) } }));
                              } catch (error) { toast.error(error instanceof Error ? error.message : "Không gỡ được ảnh"); }
                            }}
                            className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-slate-600 text-white shadow"
                          >
                            <X className="size-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-rose-700">
                      Chuyển sang “Bình thường” sẽ xoá ảnh khi lưu.
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
        <DialogFooter className="shrink-0 border-t pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Huỷ
          </Button>
          <Button
            onClick={save}
            disabled={saving || removeImage.isPending}
          >
            <Save />
            {saving ? "Đang lưu và xác nhận…" : "Lưu và xác nhận"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShiftAssignmentDialog({ item, onClose }: { item: GroundingItem; onClose: () => void }) {
  const update = useUpdateGroundingItem();
  const [shift, setShift] = useState(item.assignedShift ?? "AUTO");
  const save = async () => {
    try {
      await update.mutateAsync({ id: item.id, assignedShift: shift === "AUTO" ? null : shift });
      toast.success("Đã cập nhật ca kiểm tra");
      onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không lưu được ca kiểm tra"); }
  };
  return <Dialog open onOpenChange={(open) => !open && !update.isPending && onClose()}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Chọn ca kiểm tra</DialogTitle><DialogDescription>{item.areaEquipment}</DialogDescription></DialogHeader>
      <div className="space-y-3">
        <label htmlFor="grounding-assigned-shift" className="block text-sm font-semibold">Ca kiểm tra</label>
        <select id="grounding-assigned-shift" className={CONTROL} value={shift} onChange={(e) => setShift(e.target.value)} disabled={update.isPending}>
          <option value="AUTO">Tự chia đều</option>
          {SHIFT_TYPE_ORDER.map((value) => <option key={value} value={value}>Ca {SHIFT_TYPE[value].label.toLocaleLowerCase("vi")} ({GROUNDING_SHIFT_HOURS[value]})</option>)}
        </select>
        <p className="text-sm text-muted-foreground">Khu vực này chỉ được giao cho ca đã chọn. Chọn Tự chia đều để hệ thống cân bằng với các khu vực còn lại của cùng cương vị và tổ máy.</p>
        <p className="text-sm text-amber-800">Thay đổi áp dụng ngay và có thể đổi tuyến của các khu vực tự động. Lượt xác nhận cũ vẫn giữ trong lịch sử; khu vực chuyển sang ca khác cần xác nhận trong ca mới.</p>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={update.isPending}>Huỷ</Button><Button onClick={save} disabled={update.isPending}><Save />Lưu ca kiểm tra</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function HistoryDialog({
  item,
  onClose,
}: {
  item: GroundingItem | null;
  onClose: () => void;
}) {
  const [viewOriginal, setViewOriginal] = useState(false);
  const history = useGroundingHistory(viewOriginal ? item?.splitFrom?.id ?? null : item?.id ?? null);
  if (!item) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Lịch sử kiểm tra trong 1 tháng 15 ngày</DialogTitle>
          <DialogDescription>{viewOriginal ? `Mục tổng trước khi tách: ${item.splitFrom?.areaEquipment}` : item.areaEquipment}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {item.splitFrom && (
            <div className="space-y-2 rounded-xl border border-cyan-200 bg-cyan-50 p-3">
              <p className="text-sm text-cyan-900">Vị trí này được tách từ {item.splitFrom.areaEquipment}. Lịch sử mục tổng được giữ riêng, không tính là xác nhận cho vị trí mới.</p>
              <Button variant="outline" className="h-auto min-h-10 whitespace-normal text-left" onClick={() => setViewOriginal((value) => !value)}>
                {viewOriginal ? "Xem lịch sử vị trí này" : "Xem lịch sử mục tổng trước khi tách"}
              </Button>
            </div>
          )}
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
                    {(() => {
                      const slot = currentGroundingSlot(new Date(entry.signedAt));
                      return ` · Ca ${SHIFT_TYPE[slot.shiftType].label.toLocaleLowerCase("vi")} · Ngày ${formatVietnamDate(new Date(`${slot.date}T06:00:00+07:00`))}`;
                    })()}
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
                    {!!result.imageUrls?.length && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {result.imageUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Ảnh kiểm tra ${index + 1}`} className="size-20 rounded-lg border object-cover" /></a>)}
                      </div>
                    )}
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

/** Nhả giá trị sau khi người dùng ngừng gõ `delay` ms — cùng quy ước MaterialTicketBoard. */
function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function GroundingLightningPage() {
  const { can } = useRbacAccess();
  const [filters, setFilters] = useState<GroundingFilters>({
    q: "",
    positionCode: "ALL",
    machine: "ALL",
    type: "ALL",
    status: "ALL",
    shiftType: "CURRENT",
  });
  /*
    Chữ trong ô tìm kiếm KHÔNG đi thẳng vào khoá truy vấn nữa. Trước đây mỗi phím gõ đổi
    `filters.q` → khoá mới → một request tải lại TOÀN BỘ danh mục (kèm điểm kiểm tra, ảnh,
    lượt xác nhận, tra avatar) — gõ "Phòng Điện" là mười request, và chỉ kết quả của phím
    cuối là có ích. Ô nhập vẫn phản hồi tức thì theo `searchText`; truy vấn chỉ chạy khi
    ngừng gõ 350 ms.
  */
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounced(searchText.trim(), 350);
  const queryFilters = useMemo(
    () => ({ ...filters, q: debouncedSearch }),
    [filters, debouncedSearch],
  );
  const query = useGroundingItems(queryFilters);
  const items = useMemo(() => query.data?.data ?? [], [query.data?.data]);
  const positions = query.data?.meta?.positions ?? [];
  const scope: GroundingScope | null = query.data?.meta?.scope ?? null;
  const selectedSlot: GroundingSlot | undefined = query.data?.meta?.selectedSlot;
  const currentSlot: GroundingSlot | undefined = query.data?.meta?.currentSlot;
  const isArchived = query.data?.meta?.viewMode === "ARCHIVED";
  const canAssignShift = Boolean(query.data?.meta?.canAssignShift);
  const [shiftItem, setShiftItem] = useState<GroundingItem | null>(null);
  const isOverview = isArchived || query.data?.meta?.viewMode === "ALL";
  const isCurrentSlot = !isOverview && Boolean(selectedSlot && currentSlot && sameGroundingSlot(selectedSlot, currentSlot));
  const shiftSummary: Array<{ shiftType: ShiftTypeKey; total: number; confirmed: number; pending: number }> = query.data?.meta?.shifts ?? [];
  const serverTime = query.data?.meta?.serverTime;

  /*
   * Ba cờ quyền đều CỘNG THÊM `scope?.all` bên cạnh RBAC theo vai trò (`can(...)`), không
   * chỉ riêng canDelete: "Kỹ thuật viên"/"Quản đốc"/"Phó quản đốc"/"Trưởng ca" thường mang
   * role TECHNICIAN/SUPERVISOR giống nhiều vị trí khác, RBAC theo vai trò không phân biệt
   * được — chỉ `scope.all` (máy chủ trả về, xem groundingScope) mới biết dựa vào CƯƠNG VỊ.
   * Với ba nhóm "toàn quyền" đã có RBAC role-default đúng sẵn (ADMIN/MANAGER/SUPERVISOR),
   * `scope?.all` chỉ là lưới an toàn thứ hai — không đổi hành vi của họ, chỉ khớp thêm
   * đúng nhóm cương vị mà RBAC theo vai trò không nhìn thấy được.
   */
  const canManage = isCurrentSlot && !query.isPlaceholderData && (
    can("grounding-lightning-manage", ["personal", "manage", "full"]) || Boolean(scope?.all)
  );
  // "personal" mở từ 2026-09-12: người giữ một cương vị được thêm/sửa danh mục TRONG
  // PHẠM VI cương vị đó — máy chủ và CatalogDialog cùng khoá ô Cương vị khi phạm vi
  // không phải "toàn phân xưởng" (xem prop `scope` của CatalogDialog).
  const canCatalog = !isArchived && (
    can("grounding-lightning-catalog", ["personal", "manage", "full"]) ||
    Boolean(scope?.all));
  const canDelete = !isArchived && (
    can("grounding-lightning-delete", ["manage", "full"]) || Boolean(scope?.all));
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
  const [pendingOnly, setPendingOnly] = useState(true);
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const slotKey = selectedSlot ? `${isArchived ? "ARCHIVED" : isOverview ? "ALL" : "SHIFT"}/${selectedSlot.date}/${selectedSlot.shiftType}` : null;
  const [editingSlotKey, setEditingSlotKey] = useState<string | null>(null);
  if (!query.isPlaceholderData && slotKey !== editingSlotKey) {
    setEditingSlotKey(slotKey);
    setSelectedIds([]);
    setInspection(null);
  }
  const tableColumns = BASE_TABLE_COLUMNS + (canManage ? 2 : 0);
  const toggleSelection = (id: string) => setSelectedIds((old) =>
    old.includes(id) ? old.filter((value) => value !== id) : [...old, id],
  );
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
  const hasFilter = searchText.trim() !== "" || activeFilterCount > 0 || activeKpi !== null;
  const clearFilters = () => {
    setFilters({
      q: "",
      positionCode: "ALL",
      machine: "ALL",
      type: "ALL",
      status: "ALL",
      shiftType: filters.shiftType,
      inspectionDate: filters.inspectionDate,
    });
    setActiveKpi(null);
    setSearchText("");
  };
  /*
    Sắp xếp Ở CLIENT: máy chủ trả về toàn bộ danh mục (vài trăm dòng) trong một lượt, khác
    sổ PCCC/TBYCNN hàng nghìn dòng phải phân trang từ máy chủ. Giữ nguyên thứ tự gốc khi
    chưa chọn cột nào để sổ vẫn chạy theo tuyến đi hiện trường.
  */
  const kpiFiltered = useMemo(
    () => items.filter((item) => (!isCurrentSlot || !pendingOnly || item.needsSignature) && (!activeKpi || matchesKpi(item, activeKpi))),
    [items, activeKpi, isCurrentSlot, pendingOnly],
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
  if (page > pageCount) setPage(pageCount);
  const pageRows = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize],
  );
  // Đổi bộ lọc / cách sắp xếp / cỡ trang thì trang hiện tại không còn nghĩa gì.
  // (filters/sort/activeKpi là state — cùng object giữa các lần render, so bằng !== an toàn.)
  const [pageResetKey, setPageResetKey] = useState({ filters, debouncedSearch, sort, pageSize, activeKpi, pendingOnly });
  if (
    pageResetKey.filters !== filters ||
    pageResetKey.debouncedSearch !== debouncedSearch ||
    pageResetKey.sort !== sort ||
    pageResetKey.pageSize !== pageSize ||
    pageResetKey.activeKpi !== activeKpi || pageResetKey.pendingOnly !== pendingOnly
  ) {
    if (pageResetKey.filters !== filters || pageResetKey.debouncedSearch !== debouncedSearch || pageResetKey.activeKpi !== activeKpi || pageResetKey.pendingOnly !== pendingOnly) {
      setSelectedIds([]);
    }
    setPageResetKey({ filters, debouncedSearch, sort, pageSize, activeKpi, pendingOnly });
    setPage(1);
  }
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
    canManage: canManage && !query.isFetching,
    canCatalog,
    canDelete,
    onInspect: setInspection,
    onHistory: setHistory,
    onEdit: (item) => setCatalog({ open: true, item }),
    onRemove: doDelete,
  };
  const normalPageIds = pageRows.filter(isNormalItem).map((item) => item.id);
  // Chỉ giữ lựa chọn còn hiển thị trong bộ lọc và vẫn hoàn toàn bình thường.
  const eligibleSelectedIds = selectedIds.filter((id) =>
    sorted.some((item) => item.id === id && isNormalItem(item)),
  );
  const confirmSelected = async () => {
    if (!eligibleSelectedIds.length || confirming) return false;
    setConfirming(true);
    let completed = 0;
    try {
      for (const id of eligibleSelectedIds) {
        await sign.mutateAsync({ id, normalOnly: true, inspectionDate: selectedSlot?.date, shiftType: selectedSlot?.shiftType });
        completed += 1;
        setSelectedIds((old) => old.filter((value) => value !== id));
      }
      toast.success(`Đã xác nhận ${completed} vị trí bình thường`);
      return true;
    } catch (error) {
      toast.error(`Đã xác nhận ${completed}/${eligibleSelectedIds.length} vị trí. ${
        error instanceof Error ? error.message : "Không xác nhận được"
      }`);
      return false;
    } finally {
      setConfirming(false);
    }
  };
  return (
    <div className="relative min-h-[calc(100vh-7rem)] space-y-5 pb-32">
      <div className="pointer-events-none absolute right-0 -top-12 -z-10 size-72 rounded-full bg-cyan-200/20 blur-3xl" />
      <PageHeader
        title="TIẾP ĐỊA & CHỐNG SÉT"
        mobileTitle="TIẾP ĐỊA & CHỐNG SÉT"
      >
        <>
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
      {selectedSlot && (
        <section aria-label="Lịch kiểm tra theo ca" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-ink">{isArchived ? "Danh mục cũ đã thay thế" : "Kiểm tra hằng ngày theo cương vị"}</h2>
              <p className="text-sm text-muted-foreground">{isArchived ? "Các mục này chỉ lưu lịch sử, không thuộc danh sách kiểm tra hằng ngày." : "Mỗi ca kiểm tra và xác nhận riêng các khu vực được giao."}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="grounding-day">Ngày kiểm tra</Label>
              <input id="grounding-day" type="date" value={selectedSlot.date} min={query.data?.meta?.retentionStart}
                className={cn(CONTROL, "w-auto text-base sm:text-sm")}
                disabled={isOverview || confirming || sign.isPending}
                onChange={(event) => setFilters((old) => ({ ...old, inspectionDate: event.target.value || undefined }))} />
              <Button variant="outline" className="h-10" disabled={confirming || sign.isPending}
                onClick={() => setFilters((old) => ({ ...old, inspectionDate: undefined, shiftType: "CURRENT" }))}>
                Ca hiện tại
              </Button>
            </div>
          </div>
          <Button variant={isOverview && !isArchived ? "default" : "outline"} className="h-10 w-full sm:w-auto"
            aria-pressed={isOverview && !isArchived} disabled={confirming || sign.isPending}
            onClick={() => setFilters((old) => ({ ...old, shiftType: "ALL", inspectionDate: undefined }))}>
            Tất cả thiết bị
          </Button>
          {process.env.NODE_ENV === "development" && <Button variant={isArchived ? "default" : "outline"} className="h-10 w-full sm:ml-2 sm:w-auto"
            aria-pressed={isArchived} disabled={confirming || sign.isPending}
            onClick={() => setFilters((old) => ({ ...old, shiftType: "ARCHIVED", inspectionDate: undefined }))}>
            Mục cũ đã thay thế
          </Button>}
          {!isArchived && <>
          <div className="grid grid-cols-3 gap-2">
            {SHIFT_TYPE_ORDER.map((shiftType) => {
              const summary = shiftSummary.find((entry) => entry.shiftType === shiftType);
              const active = !isOverview && selectedSlot.shiftType === shiftType;
              const slot = { date: selectedSlot.date, shiftType };
              const current = Boolean(currentSlot && sameGroundingSlot(slot, currentSlot));
              const ended = serverTime && groundingSlotWindow(slot).end.getTime() <= new Date(serverTime).getTime();
              return (
                <button key={shiftType} type="button" aria-pressed={active}
                  aria-label={`Ca ${SHIFT_TYPE[shiftType].label.toLocaleLowerCase("vi")}`}
                  disabled={confirming || sign.isPending}
                  onClick={() => setFilters((old) => ({ ...old, shiftType }))}
                  className={cn("rounded-xl border p-2 text-left transition sm:p-3", active ? "border-cyan-500 bg-cyan-50 ring-1 ring-cyan-500" : "border-slate-200 bg-slate-50 hover:bg-slate-100")}>
                  <span className="flex flex-wrap items-center gap-1 text-sm font-bold text-ink sm:gap-2 sm:text-base">
                    Ca {SHIFT_TYPE[shiftType].label.toLocaleLowerCase("vi")}
                    {current && <><span className="size-1.5 rounded-full bg-cyan-600 sm:hidden" title="Đang diễn ra" /><span className="hidden rounded-full bg-cyan-100 px-2 py-0.5 text-xs text-cyan-800 sm:inline">Đang diễn ra</span></>}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground"><span className="sm:hidden">{GROUNDING_SHIFT_HOURS_COMPACT[shiftType]}</span><span className="hidden sm:inline">{GROUNDING_SHIFT_HOURS[shiftType]}</span></span>
                  <span className="mt-2 block text-xs sm:text-sm"><span className="hidden sm:inline">Đã xác nhận </span><b className="sm:font-normal">{summary?.confirmed ?? 0}/{summary?.total ?? 0}</b><span className="sm:hidden"> đã xác nhận</span><span className="hidden sm:inline"> khu vực</span></span>
                  <span className={cn("mt-1 block text-xs font-medium", ended && summary?.pending ? "text-rose-700" : "text-muted-foreground")}>
                    <span className="sm:hidden">{summary?.total === 0 ? "Không có nhiệm vụ" : summary?.pending === 0 ? "Hoàn thành" : `Còn ${summary?.pending ?? 0}${ended ? " · Quá ca" : ""}`}</span>
                    <span className="hidden sm:inline">{summary?.total === 0 ? "Không có khu vực cần kiểm tra trong ca này" : summary?.pending === 0 ? "Đã hoàn thành" : `${summary?.pending ?? 0} khu vực chưa xác nhận${ended ? " · Ca đã kết thúc" : ""}`}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {isOverview && <p className="text-sm text-cyan-800">Đang xem toàn bộ thiết bị trong phạm vi được phép. Số lượng và bộ lọc khiếm khuyết tổng hợp từ cả 3 ca theo kết quả hiện tại. Chọn ca hiện tại để kiểm tra và xác nhận.</p>}
          {!isOverview && !isCurrentSlot && <p className="text-sm text-amber-800">Đang xem ca khác. Chỉ được cập nhật và xác nhận trong ca đang diễn ra.</p>}
          <p className="text-sm font-medium text-ink" aria-live="polite">
            Cả ngày: đã xác nhận {shiftSummary.reduce((total, shift) => total + shift.confirmed, 0)}/{shiftSummary.reduce((total, shift) => total + shift.total, 0)} khu vực
          </p>
          <p className="text-xs text-muted-foreground">Mỗi khu vực được giao cho một ca trong ngày. Nhóm có ít khu vực có thể có ca không được giao nhiệm vụ.</p>
          </>}
          <p className="text-xs text-muted-foreground">{GROUNDING_RETENTION_DESCRIPTION}</p>
        </section>
      )}
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
            label={isArchived ? "Chờ xác nhận (không áp dụng)" : "Chờ xác nhận"}
            value={metrics.unsigned}
            icon={FileClock}
            tint="amber"
          />
        </KpiCard>
      </div>
      {isCurrentSlot && <div className="flex flex-wrap gap-2" aria-label="Phạm vi tuyến ca">
        <Button variant={pendingOnly ? "default" : "outline"} className="h-10" aria-pressed={pendingOnly} onClick={() => setPendingOnly(true)}>Chưa xác nhận ({metrics.unsigned})</Button>
        <Button variant={!pendingOnly ? "default" : "outline"} className="h-10" aria-pressed={!pendingOnly} onClick={() => setPendingOnly(false)}>Toàn bộ tuyến ca ({metrics.total})</Button>
      </div>}
      {canManage && (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          <p className="text-sm text-ink">
            Chọn các vị trí đã kiểm tra có toàn bộ hạng mục bình thường để xác nhận cùng lúc.
            Các vị trí chưa kiểm tra hoặc có khiếm khuyết cần cập nhật riêng.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="h-10" disabled={confirming || !normalPageIds.length || query.isFetching}
              onClick={() => setSelectedIds((old) => [...new Set([...old, ...normalPageIds])])}>
              Chọn vị trí bình thường trên trang
            </Button>
            <Button variant="ghost" className="h-10" disabled={confirming || !selectedIds.length}
              onClick={() => setSelectedIds([])}>Bỏ chọn</Button>
            <span className="text-sm font-medium" aria-live="polite">Đã chọn {eligibleSelectedIds.length} vị trí</span>
          </div>
        </div>
      )}
      <div inert={confirming}>
      <PcccTableCard
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        search={searchText}
        onSearchChange={setSearchText}
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
            className={canManage ? "min-w-[1520px]" : "min-w-[1200px]"}
            wrapperClassName={TABLE_SCROLLER}
          >
            <TableHeader>
              <TableRow className={TR_HEAD}>
                <TableHead className={cn(TH_NAVY, TH_EXPAND)} />
                {canManage && <TableHead className={cn(TH_NAVY, "w-12 text-center")}>Chọn</TableHead>}
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
                {canManage && (
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
                    <b className="text-ink">{isCurrentSlot && pendingOnly && items.length && !metrics.unsigned ? "Đã xác nhận đủ tuyến ca" : "Chưa có dữ liệu phù hợp"}</b>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Chọn Toàn bộ tuyến ca để xem cả vị trí đã xác nhận, hoặc thay đổi bộ lọc.
                    </p>
                  </TableCell>
                </TableRow>
              )}
              {pageRows.map((item, index) => {
                const expanded = expandedId === item.id;
                const rowBg = eligibleSelectedIds.includes(item.id)
                  ? "bg-emerald-50"
                  : rowBackground({ index, expanded });
                const photoCount = countPhotos(item);
                const defectPoints = item.points.filter((point) => point.defectDescription);
                return (
                  <Fragment key={item.id}>
                    <TableRow className={cn(rowBg, ROW_HOVER)}>
                      <TableCell className={cn(TD_EXPAND, "py-2", rowBg)}>
                        <RowExpander
                          expanded={expanded}
                          onToggle={() => setExpandedId(expanded ? null : item.id)}
                        />
                      </TableCell>
                      {canManage && (
                        <TableCell className={cn(TD_ROW, "py-2 text-center")}>
                          <label className="inline-flex size-10 cursor-pointer items-center justify-center">
                            <input type="checkbox" className="size-5 accent-emerald-600"
                              aria-label={`Chọn ${item.areaEquipment}${item.splitFrom && item.sourceRow ? ` (dòng ${item.sourceRow})` : ""} để xác nhận bình thường`}
                              checked={eligibleSelectedIds.includes(item.id)}
                              disabled={confirming || sign.isPending || query.isFetching || !isNormalItem(item)}
                              onChange={() => toggleSelection(item.id)} />
                          </label>
                        </TableCell>
                      )}
                      <TableCell className={cn(TD_ROW, "py-2", "whitespace-nowrap text-center font-medium")}>
                        {item.position || "—"}
                      </TableCell>
                      <TableCell className={cn(TD_ROW, "py-2", "font-semibold text-ink")}>
                        {item.areaEquipment}
                        {item.sourceRow && <span className="mt-1 block text-xs font-normal text-muted-foreground">{item.splitFrom ? `${item.splitFrom.areaEquipment} · ` : ""}Dòng {item.sourceRow} · {item.sourceSheet}</span>}
                      </TableCell>
                      <TableCell className={cn(TD_ROW, "py-2", "text-center")}>
                        <MachineChip machine={item.machine} />
                      </TableCell>
                      <TableCell className={cn(TD_ROW, "py-2", "text-center")}>
                        <PointCell item={item} type="GROUNDING" />
                      </TableCell>
                      <TableCell className={cn(TD_ROW, "py-2", "text-center")}>
                        <PointCell item={item} type="LIGHTNING" />
                      </TableCell>
                      {/* Ghi chú đã rời khỏi bảng (xem khối chi tiết của nút "+"), nhưng số
                          ảnh thì ở lại: đây là cột người ta dò theo chiều dọc để biết khu
                          vực nào đã có ảnh hiện trường. */}
                      <TableCell className={cn(TD_ROW, "py-2", "text-center")}>
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
                      <TableCell className={cn(TD_ROW, "py-2", "text-center")}>
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
                      {canManage && (
                        <TableCell className={cn(TD_ROW, "py-2", "text-center")}>
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
                            <DetailField label="Lịch sử" span="full">
                              <Button variant="outline" className="h-10" onClick={() => setHistory(item)}><History className="mr-1 size-4" />Xem lịch sử kiểm tra</Button>
                            </DetailField>
                            {(canCatalog || canDelete) && <DetailField label="Danh mục" span="full"><CatalogActions item={item} ctx={rowActions} /></DetailField>}
                            <DetailField label="Ca kiểm tra" span="full">
                              <p>{item.assignedShift ? `Cố định: Ca ${SHIFT_TYPE[item.assignedShift].label.toLocaleLowerCase("vi")}` : "Tự chia đều"}</p>
                              {canAssignShift && <Button variant="outline" className="mt-2 h-10" onClick={() => setShiftItem(item)}><Clock3 className="mr-1 size-4" />Chọn ca kiểm tra</Button>}
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
            <article key={item.id} className={cn("p-4", eligibleSelectedIds.includes(item.id) && "bg-emerald-50")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-cyan-700">
                    {item.position} · {machineLabel(item.machine)}
                  </span>
                  <h3 className="mt-1 font-bold text-ink">{item.areaEquipment}</h3>
                  {item.sourceRow && <p className="mt-1 text-xs text-muted-foreground">{item.splitFrom ? `${item.splitFrom.areaEquipment} · ` : ""}Dòng {item.sourceRow} · {item.sourceSheet}</p>}
                  {item.assignedShift && <p className="mt-1 text-xs font-semibold text-cyan-700">Ca cố định: {SHIFT_TYPE[item.assignedShift].label}</p>}
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
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className={cn("font-medium", item.needsSignature ? "text-amber-700" : "text-emerald-700")}>
                  {item.needsSignature ? "Chưa xác nhận trong ca này" : "Đã xác nhận trong ca này"}
                </span>
                <Button variant="ghost" className="h-10" onClick={() => setHistory(item)}><History className="mr-1 size-4" />Lịch sử</Button>
                <CatalogActions item={item} ctx={rowActions} />
                {canAssignShift && <Button variant="outline" className="h-10" onClick={() => setShiftItem(item)}><Clock3 className="mr-1 size-4" />Chọn ca kiểm tra</Button>}
              </div>
              {item.latestInspection && <p className="mt-1 text-xs text-muted-foreground">{item.latestInspection.inspectorName} · {fmtDate(item.latestInspection.signedAt)}</p>}
              {canManage && (
                <label className="mt-3 flex min-h-10 items-center gap-3 text-sm">
                  <input type="checkbox" className="size-5 shrink-0 accent-emerald-600"
                    aria-label={`Chọn ${item.areaEquipment}${item.splitFrom && item.sourceRow ? ` (dòng ${item.sourceRow})` : ""} để xác nhận bình thường`}
                    checked={eligibleSelectedIds.includes(item.id)}
                    disabled={confirming || sign.isPending || query.isFetching || !isNormalItem(item)}
                    onChange={() => toggleSelection(item.id)} />
                  {!item.needsSignature ? "Đã xác nhận trong ca này" : isNormalItem(item) ? "Chọn xác nhận bình thường" : "Cần cập nhật kết quả riêng"}
                </label>
              )}
              {canManage && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <RowActions item={item} ctx={rowActions} />
                </div>
              )}
            </article>
          ))}
          {pageRows.length === 0 && (
            <div className="py-16 text-center">
              <RadioTower className="mx-auto mb-3 size-10 text-slate-300" />
              <b className="text-ink">{isCurrentSlot && pendingOnly && items.length && !metrics.unsigned ? "Đã xác nhận đủ tuyến ca" : "Chưa có dữ liệu phù hợp"}</b>
              <p className="mt-1 text-sm text-muted-foreground">
                Chọn Toàn bộ tuyến ca để xem cả vị trí đã xác nhận, hoặc thay đổi bộ lọc.
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
      </div>
      {canManage && eligibleSelectedIds.length > 0 && <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 rounded-xl border border-emerald-200 bg-white p-3 shadow-lg lg:bottom-4">
        <Button className="h-14 w-full text-base" onClick={confirmSelected} disabled={confirming || sign.isPending || query.isFetching}>
          <CheckCircle2 className="mr-2 size-5" />{confirming ? "Đang xác nhận…" : `Xác nhận ${eligibleSelectedIds.length} vị trí bình thường`}
        </Button>
      </div>}
      {catalog.open && (
        <CatalogDialog
          key={`${catalog.item?.id ?? "new"}-${catalog.open}`}
          open={catalog.open}
          onOpenChange={(open) => setCatalog((old) => ({ ...old, open }))}
          item={catalog.item}
          canDelete={canDelete}
          canAssignShift={canAssignShift}
          scope={scope}
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
      {shiftItem && <ShiftAssignmentDialog key={shiftItem.id} item={shiftItem} onClose={() => setShiftItem(null)} />}
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
