"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { Megaphone, Plus, Pencil, Trash2, Pin, Loader2, Link2, FileText, ExternalLink, Upload, X, Check, Users, Clock, CheckCircle2, Search, Ban, RotateCcw, Archive } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ExportButton } from "@/components/shared/export-button";
import { toast } from "sonner";
import { useUsers } from "@/hooks/useUsers";
import { useCurrentPosition } from "@/hooks/useCurrentPosition";
import {
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useInvalidateAnnouncement,
  useRestoreAnnouncement,
  useDeleteAnnouncement,
  useUploadAnnouncementFile,
  useMarkAnnouncementRead,
  type Announcement,
  type AnnouncementCategory,
} from "@/hooks/useAnnouncements";
import { formatDate, cn } from "@/lib/utils";
import { normalizeText } from "@/lib/nav";
import { effectiveUserPosition } from "@/lib/current-position";
import { isAnnouncementReadExemptPosition } from "@/lib/announcement-read";
import {
  announcementPositionLabel,
  announcementShiftRosterPositionOptions,
  isAnnouncementShiftRosterPosition,
} from "@/lib/positions";
import {
  ALL_ANNOUNCEMENT_POSITIONS,
  announcementTargetLabel,
  encodeAnnouncementTargets,
  isAnnouncementTargetForPosition,
  parseAnnouncementTargets,
  targetsAllPositions,
} from "@/lib/announcement-targets";

/** Ensure an outbound link has a scheme so it opens correctly in a new tab. */
function normalizeUrl(u: string) {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

const EMPTY_FORM = {
  category: "BULLETIN" as AnnouncementCategory,
  classification: encodeAnnouncementTargets([ALL_ANNOUNCEMENT_POSITIONS]),
  stt: "",
  title: "MỆNH LỆNH SẢN XUẤT",
  body: "",
  pinned: false,
  orderedBy: "",
  orderAuthority: "LĐPX",
  issuedAt: formatDateInput(new Date()),
  linkUrl: "",
  fileUrl: "",
  fileName: "",
};

const NO_ORDERER = "__none__";
const ORDER_AUTHORITIES = ["BGĐ", "LĐPX"] as const;
type OrderAuthority = (typeof ORDER_AUTHORITIES)[number];
const INVALID_ARCHIVE_DAYS = 15;

// Cấp BGĐ ra lệnh: danh sách cố định. LĐPX lấy động từ DS Quản đốc / Phó quản đốc.
const BGD_ORDERERS = ["Phó Giám Đốc Quản Lý Vận Hành", "Giám Đốc"];

function splitOrderedBy(value?: string | null): { orderAuthority: OrderAuthority; orderedBy: string } {
  const trimmed = (value ?? "").trim();
  const match = trimmed.match(/^(BGĐ|LĐPX)(?:\s*-\s*(.*))?$/);
  if (!match) return { orderAuthority: "LĐPX", orderedBy: trimmed };
  return { orderAuthority: match[1] as OrderAuthority, orderedBy: (match[2] ?? "").trim() };
}

function joinOrderedBy(orderAuthority: string, orderedBy: string) {
  const authority = ORDER_AUTHORITIES.includes(orderAuthority as OrderAuthority)
    ? (orderAuthority as OrderAuthority)
    : "LĐPX";
  const name = orderedBy.trim();
  return name ? `${authority} - ${name}` : authority;
}

function formatDateInput(value: Date) {
  return `${String(value.getDate()).padStart(2, "0")}/${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`;
}

function dateInputValue(value?: string | null) {
  if (!value) return formatDateInput(new Date());
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDateInput(new Date());
  return formatDateInput(date);
}

function parseDateInput(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function announcementDate(a: Announcement) {
  return a.issuedAt ?? a.createdAt;
}

function invalidArchiveDaysLeft(value?: string | null) {
  if (!value) return null;
  const invalidated = new Date(value);
  if (Number.isNaN(invalidated.getTime())) return null;
  const archiveAt = invalidated.getTime() + INVALID_ARCHIVE_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((archiveAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

function isArchivedInvalidAnnouncement(a: Announcement) {
  return Boolean(a.invalidatedAt) && invalidArchiveDaysLeft(a.invalidatedAt) === 0;
}

export default function NotificationsPage() {
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const role = session?.user?.role;
  const isAdmin = role === "ADMIN";
  const { position: currentPosition } = useCurrentPosition();
  const exemptFromReadConfirm = isAnnouncementReadExemptPosition(currentPosition);
  // ADMIN & Trưởng ca (SUPERVISOR) xem được ai đã/chưa đọc mệnh lệnh.
  const isManager = role === "ADMIN" || role === "SUPERVISOR";

  const { data: annData, isLoading: annLoading } = useAnnouncements();
  const announcements = annData?.data ?? [];
  const { data: usersData } = useUsers();
  const allUsers = usersData?.data ?? [];
  // Người ra lệnh cấp LĐPX: các Quản đốc / Phó quản đốc trong hệ thống.
  const managers = allUsers.filter((u) => (u.position ?? "").toLowerCase().includes("quản đốc"));
  // "Tất cả user" để tính đã đọc/chưa đọc = toàn bộ nhân sự đang hoạt động.
  const activeUsers = allUsers.filter(
    (u) => {
      const position = effectiveUserPosition(u);
      return u.isActive && !isAnnouncementReadExemptPosition(position) && isAnnouncementShiftRosterPosition(position);
    }
  );
  const positionOptions = React.useMemo(() => {
    return announcementShiftRosterPositionOptions();
  }, []);
  const bulletins = announcements.filter((a) => a.category !== "ORDER");

  const create = useCreateAnnouncement();
  const update = useUpdateAnnouncement();
  const invalidate = useInvalidateAnnouncement();
  const restore = useRestoreAnnouncement();
  const del = useDeleteAnnouncement();
  const upload = useUploadAnnouncementFile();
  const markRead = useMarkAnnouncementRead();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Announcement | null>(null);
  const [deleting, setDeleting] = React.useState<Announcement | null>(null);
  const [readersOf, setReadersOf] = React.useState<Announcement | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const pending = create.isPending || update.isPending;

  // Danh sách "Theo lệnh" theo cấp lệnh: BGĐ cố định, LĐPX lấy từ Quản đốc / Phó QĐ.
  // Giữ lại giá trị cũ (vd dữ liệu cũ) nếu không nằm trong danh sách chuẩn.
  const ordererOptions = React.useMemo(() => {
    const base =
      form.orderAuthority === "BGĐ"
        ? BGD_ORDERERS.map((t) => ({ value: t, label: t }))
        : managers.map((u) => ({ value: u.name, label: `${u.name}${u.position ? ` · ${u.position}` : ""}` }));
    return form.orderedBy && !base.some((o) => o.value === form.orderedBy)
      ? [...base, { value: form.orderedBy, label: form.orderedBy }]
      : base;
  }, [form.orderAuthority, form.orderedBy, managers]);
  function setOrderAuthority(v: OrderAuthority) {
    setForm((f) => {
      const valid = v === "BGĐ" ? BGD_ORDERERS : managers.map((u) => u.name);
      return { ...f, orderAuthority: v, orderedBy: valid.includes(f.orderedBy) ? f.orderedBy : "" };
    });
  }

  async function confirmRead(a: Announcement) {
    try {
      await markRead.mutateAsync(a.id);
      toast.success("Đã xác nhận đọc");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Mặc định chỉ hiện mệnh lệnh của NĂM HIỆN TẠI (thời gian thực); mệnh lệnh
  // năm cũ vẫn lưu trữ, tra cứu lại bằng bộ lọc năm.
  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = React.useState(String(currentYear));
  const [positionFilter, setPositionFilter] = React.useState("ALL");
  const [search, setSearch] = React.useState("");
  const [showInvalidArchive, setShowInvalidArchive] = React.useState(false);
  const archivedBulletins = bulletins.filter(isArchivedInvalidAnnouncement);
  const activeBulletins = bulletins.filter((a) => !isArchivedInvalidAnnouncement(a));
  const currentBulletins = showInvalidArchive ? archivedBulletins : activeBulletins;
  const years = Array.from(
    new Set([currentYear, ...currentBulletins.map((a) => new Date(announcementDate(a)).getFullYear())])
  ).filter((year) => !Number.isNaN(year)).sort((x, y) => y - x);
  const nq = normalizeText(search.trim());
  const filtered = currentBulletins.filter(
    (a) =>
      (yearFilter === "ALL" || new Date(announcementDate(a)).getFullYear() === Number(yearFilter)) &&
      (positionFilter === "ALL" || isAnnouncementTargetForPosition(a.classification, positionFilter)) &&
      (!nq || normalizeText([a.title, a.body, announcementTargetLabel(a.classification), a.orderedBy, a.stt].filter(Boolean).join(" ")).includes(nq))
  );
  const isOrder = form.category === "ORDER";
  const noun = isOrder ? "mệnh lệnh" : "thông báo";

  // Dữ liệu xuất PDF/Excel — theo đúng danh sách mệnh lệnh đang hiển thị.
  const exportRows = filtered.map((a, i) => {
    const { orderAuthority, orderedBy } = a.orderedBy
      ? splitOrderedBy(a.orderedBy)
      : { orderAuthority: "", orderedBy: "" };
    return {
      stt: a.stt || String(i + 1),
      title: a.title,
      issuedAt: formatDate(announcementDate(a)),
      targetPositions: announcementTargetLabel(a.classification),
      orderAuthority,
      orderedBy,
      content: a.body,
    };
  });

  function openCreate(category: AnnouncementCategory) {
    setEditing(null);
    setForm({ ...EMPTY_FORM, category, issuedAt: formatDateInput(new Date()) });
    setDialogOpen(true);
  }
  function openEdit(a: Announcement) {
    const order = splitOrderedBy(a.orderedBy);
    setEditing(a);
    setForm({
      category: a.category,
      classification: a.classification ?? "",
      stt: a.stt ?? "",
      title: a.title,
      body: a.body,
      pinned: a.pinned,
      orderedBy: order.orderedBy,
      orderAuthority: order.orderAuthority,
      issuedAt: dateInputValue(a.issuedAt ?? a.createdAt),
      linkUrl: a.linkUrl ?? "",
      fileUrl: a.fileUrl ?? "",
      fileName: a.fileName ?? "",
    });
    setDialogOpen(true);
  }

  function selectedTargetPositions() {
    return parseAnnouncementTargets(form.classification);
  }

  function setTargetPositions(next: string[]) {
    setForm((f) => ({ ...f, classification: encodeAnnouncementTargets(next) }));
  }

  function toggleTargetPosition(position: string, checked: boolean) {
    const current = selectedTargetPositions().filter((p) => p !== ALL_ANNOUNCEMENT_POSITIONS);
    const positionKey = normalizeText(announcementPositionLabel(position));
    const otherPositions = current.filter((p) => normalizeText(announcementPositionLabel(p)) !== positionKey);
    const next = checked
      ? Array.from(new Set([...otherPositions, announcementPositionLabel(position)]))
      : otherPositions;
    setTargetPositions(next);
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return toast.error("Chỉ chấp nhận tệp PDF");
    }
    try {
      const res = await upload.mutateAsync(file);
      setForm((f) => ({ ...f, fileUrl: res.url, fileName: res.name }));
      toast.success("Đã tải lên tệp PDF");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  async function submit() {
    if (!form.title.trim() || !form.body.trim()) return toast.error("Nhập tiêu đề và nội dung");
    if (parseAnnouncementTargets(form.classification).length === 0) return toast.error("Chọn cương vị nhận mệnh lệnh");
    const issuedAt = parseDateInput(form.issuedAt);
    if (!issuedAt) return toast.error("Ngày ra mệnh lệnh phải đúng định dạng DD/MM/YYYY");
    const { orderAuthority, ...restForm } = form;
    const payload = {
      ...restForm,
      issuedAt,
      classification: encodeAnnouncementTargets(parseAnnouncementTargets(form.classification)),
      orderedBy: joinOrderedBy(orderAuthority, form.orderedBy),
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...payload });
        toast.success(`Đã cập nhật ${noun}`);
      } else {
        await create.mutateAsync(payload);
        toast.success(`Đã đăng ${noun}`);
      }
      setDialogOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function confirmDelete() {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      toast.success("Đã xoá mệnh lệnh");
      setDeleting(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function markIneffective(a: Announcement) {
    try {
      await invalidate.mutateAsync(a.id);
      toast.success("Đã đánh dấu mệnh lệnh không còn hiệu lực");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function restoreOrder(a: Announcement) {
    try {
      await restore.mutateAsync(a.id);
      toast.success("Đã khôi phục mệnh lệnh");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  /** A single admin post card (bảng tin or mệnh lệnh). */
  function PostCard({ a }: { a: Announcement }) {
    const targetUsers = activeUsers.filter((u) => isAnnouncementTargetForPosition(a.classification, effectiveUserPosition(u)));
    const targetUserIds = new Set(targetUsers.map((u) => u.id));
    const trackedReads = a.reads.filter((r) => targetUserIds.has(r.userId));
    const readUserIds = new Set(trackedReads.map((r) => r.userId));
    const readByMe = myId ? readUserIds.has(myId) : false;
    const mustReadByMe = !exemptFromReadConfirm && isAnnouncementTargetForPosition(a.classification, currentPosition);
    const readCount = trackedReads.length;
    const total = targetUsers.length;
    const allRead = total > 0 && readCount >= total;
    const isInvalid = Boolean(a.invalidatedAt);
    const daysLeft = invalidArchiveDaysLeft(a.invalidatedAt);
    const archivedInvalid = isArchivedInvalidAnnouncement(a);
    return (
      <Card
        className={cn(
          "group overflow-hidden transition-colors",
          isInvalid
            ? "border-red-300 bg-red-50/90 ring-1 ring-red-200"
            : a.pinned && !allRead && "border-accent/50 ring-1 ring-accent/20",
          !isInvalid && allRead &&
            "border-amber-300 bg-gradient-to-br from-amber-100 via-yellow-100 to-amber-200 dark:border-amber-500/40 dark:from-amber-500/20 dark:via-yellow-500/10 dark:to-amber-600/20"
        )}
      >
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-start gap-1.5 sm:items-center">
                {a.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-accent" />}
                {a.stt && (
                  <span className="shrink-0 rounded bg-accent/10 px-1.5 py-0.5 text-xs font-bold text-accent">
                    {a.stt}
                  </span>
                )}
                <h3 className="min-w-0 max-w-full break-words font-semibold leading-snug text-ink">{a.title}</h3>
                {isInvalid && (
                  <span className="shrink-0 rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                    Không còn hiệu lực
                  </span>
                )}
                {a.classification && (
                  <span className="min-w-0 max-w-full basis-full whitespace-normal break-words rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium leading-snug text-muted-foreground sm:basis-auto">
                    {announcementTargetLabel(a.classification)}
                  </span>
                )}
              </div>
              <div className={cn("mt-1 text-sm font-semibold", isInvalid ? "text-red-700" : "text-ink")}>
                Ngày ra mệnh lệnh: {formatDate(announcementDate(a))}
              </div>
              <div
                className={cn(
                  "mt-3 rounded-lg border px-4 py-3",
                  isInvalid
                    ? "border-red-200 bg-white/75 text-red-900"
                    : "border-slate-200 bg-slate-50/80 text-ink"
                )}
              >
                <div className={cn("mb-1 text-[11px] font-bold uppercase tracking-normal", isInvalid ? "text-red-600" : "text-muted-foreground")}>
                  Nội dung mệnh lệnh
                </div>
                <div className="whitespace-pre-wrap text-[15px] font-bold leading-7">
                  {a.body}
                </div>
              </div>
              {(a.linkUrl || a.fileUrl) && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {a.linkUrl && (
                    <a
                      href={normalizeUrl(a.linkUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/5"
                    >
                      <Link2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="max-w-[220px] truncate">{a.linkUrl.replace(/^https?:\/\//i, "")}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  )}
                  {a.fileUrl && (
                    <a
                      href={a.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-muted"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-destructive" />
                      <span className="max-w-[220px] truncate">{a.fileName ?? "Tệp PDF"}</span>
                    </a>
                  )}
                </div>
              )}
              {a.orderedBy && (
                <div className="mt-2 text-xs font-medium text-ink">
                  Theo lệnh: <span className="text-accent">{a.orderedBy}</span>
                </div>
              )}
              <div className="mt-2 text-xs text-muted-foreground">
                Cập nhật bởi: <span className="font-medium text-ink">Quản trị viên</span> - {formatDate(a.updatedAt)}
              </div>
              {isInvalid && (
                <div className="mt-2 rounded-md border border-red-200 bg-white/70 px-3 py-2 text-xs font-medium text-red-700">
                  Mệnh lệnh không còn hiệu lực từ {formatDate(a.invalidatedAt)}.
                  {archivedInvalid
                    ? " Đang nằm trong mục Mệnh lệnh hết hiệu lực."
                    : ` Sẽ chuyển vào mục Mệnh lệnh hết hiệu lực sau ${daysLeft ?? INVALID_ARCHIVE_DAYS} ngày.`}
                </div>
              )}
            </div>
            {isAdmin && (
              <div className="flex shrink-0 items-center gap-1 self-end opacity-100 transition-opacity sm:self-start sm:opacity-0 sm:group-hover:opacity-100">
                {isInvalid ? (
                  <button onClick={() => restoreOrder(a)} title="Khôi phục hiệu lực" className="rounded-md p-1.5 text-red-700 transition-colors hover:bg-red-100">
                    <RotateCcw className="h-4 w-4" />
                  </button>
                ) : (
                  <>
                    <button onClick={() => openEdit(a)} title="Sửa" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-ink">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => markIneffective(a)} title="Mệnh lệnh không còn hiệu lực" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-700">
                      <Ban className="h-4 w-4" />
                    </button>
                  </>
                )}
                <button onClick={() => setDeleting(a)} title="Xoá" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Xác nhận đã đọc — cho tất cả user; quản lý xem được ai đã/chưa đọc */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
            {allRead ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <CheckCircle2 className="h-4 w-4" /> Tất cả đã xác nhận đọc
              </span>
            ) : !mustReadByMe ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Check className="h-4 w-4" /> Không thuộc diện cần xác nhận đọc
              </span>
            ) : readByMe ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" /> Bạn đã xác nhận đọc
              </span>
            ) : (
              <Button size="sm" variant="outline" onClick={() => confirmRead(a)} disabled={markRead.isPending}>
                {markRead.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Xác nhận đã đọc
              </Button>
            )}
            {isManager && (
              <button
                onClick={() => setReadersOf(a)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-ink"
                title="Xem ai đã/chưa đọc"
              >
                <Users className="h-3.5 w-3.5" /> Đã đọc {readCount}/{total}
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="MỆNH LỆNH SẢN XUẤT" description="Mệnh lệnh & thông tin vận hành cần chú ý" />

      {/* Bảng tin từ Ban quản trị (chỉ ADMIN đăng/sửa/xoá; mọi người đều xem) */}
      <section className="space-y-3">
        {/* Thanh tìm kiếm + bộ lọc (năm / phân loại) + đăng mệnh lệnh */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm mệnh lệnh..."
              className="h-9 pl-9"
            />
          </div>
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả năm</SelectItem>
              {years.map((y) => <SelectItem key={y} value={String(y)}>Năm {y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={positionFilter} onValueChange={setPositionFilter}>
            <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Cương vị" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả cương vị</SelectItem>
              {positionOptions.map((position) => (
                <SelectItem key={position} value={position}>{position}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {isManager && (
              <ExportButton
                rows={exportRows}
                filename={showInvalidArchive ? "menh-lenh-het-hieu-luc" : "menh-lenh-san-xuat"}
                title={showInvalidArchive ? "Mệnh lệnh hết hiệu lực" : "Mệnh lệnh sản xuất"}
              />
            )}
            <Button
              size="sm"
              variant={showInvalidArchive ? "default" : "outline"}
              className="shrink-0"
              onClick={() => setShowInvalidArchive((value) => !value)}
            >
              <Archive className="h-4 w-4" />
              {showInvalidArchive ? "Mệnh lệnh hiện hành" : "Mệnh lệnh hết hiệu lực"}
            </Button>
            {isAdmin && (
              <Button size="sm" className="shrink-0" onClick={() => openCreate("BULLETIN")}>
                <Plus className="h-4 w-4" /> Đăng mệnh lệnh
              </Button>
            )}
          </div>
        </div>

        {annLoading ? (
          <TableSkeleton rows={2} />
        ) : currentBulletins.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <EmptyState
                icon={Megaphone}
                title={showInvalidArchive ? "Chưa có mệnh lệnh hết hiệu lực" : "Chưa có mệnh lệnh"}
                description={
                  showInvalidArchive
                    ? "Các mệnh lệnh sẽ tự chuyển vào đây sau 15 ngày kể từ khi đánh dấu không còn hiệu lực."
                    : isAdmin ? "Nhấn “Đăng mệnh lệnh” để tạo bài viết đầu tiên." : "Hiện chưa có mệnh lệnh từ Ban quản trị."
                }
              />
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <EmptyState
                icon={Megaphone}
                title={showInvalidArchive ? "Không có mệnh lệnh hết hiệu lực" : "Không có mệnh lệnh"}
                description={
                  yearFilter === String(currentYear)
                    ? showInvalidArchive
                      ? "Chưa có mệnh lệnh hết hiệu lực nào trong năm nay. Chọn năm khác ở bộ lọc để xem dữ liệu cũ hơn."
                      : "Chưa có mệnh lệnh nào trong năm nay. Chọn năm khác ở bộ lọc để xem mệnh lệnh các năm trước."
                    : "Không có mệnh lệnh nào khớp với bộ lọc đã chọn."
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => <PostCard key={a.id} a={a} />)}
          </div>
        )}
      </section>

      {/* Create / edit dialog — ADMIN only */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Sửa ${noun}` : isOrder ? "Đăng mệnh lệnh mới" : "Đăng thông báo mới"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="mb-1.5 block">Tiêu đề</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder={isOrder ? "VD: Mệnh lệnh sản xuất ca ngày" : "VD: Lịch họp giao ban tuần"}
                />
              </div>
              <div className="w-20 shrink-0">
                <Label className="mb-1.5 block">STT</Label>
                <Input
                  value={form.stt}
                  onChange={(e) => setForm({ ...form, stt: e.target.value })}
                  placeholder="01"
                  className="text-center"
                />
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block">Ngày ra mệnh lệnh</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={form.issuedAt}
                onChange={(e) => setForm({ ...form, issuedAt: e.target.value })}
                placeholder="DD/MM/YYYY"
                maxLength={10}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Cương vị nhận mệnh lệnh</Label>
              <div className="rounded-lg border border-border p-3">
                <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-ink hover:bg-muted/60">
                  <Checkbox
                    checked={targetsAllPositions(form.classification)}
                    onCheckedChange={(checked) => setTargetPositions(checked ? [ALL_ANNOUNCEMENT_POSITIONS] : [])}
                  />
                  Tất cả cương vị
                </label>
                {!targetsAllPositions(form.classification) && (
                  <div className="mt-2 grid max-h-44 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
                    {positionOptions.length === 0 ? (
                      <div className="px-2 py-3 text-sm text-muted-foreground">Chưa có dữ liệu cương vị.</div>
                    ) : (
                      positionOptions.map((position) => {
                        const selected = selectedTargetPositions().some((p) => normalizeText(announcementPositionLabel(p)) === normalizeText(position));
                        return (
                          <label key={position} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-muted/60">
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked) => toggleTargetPosition(position, !!checked)}
                            />
                            <span className="min-w-0 truncate">{position}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                )}
                <div className="mt-2 text-xs text-muted-foreground">
                  Chỉ nhân viên thuộc cương vị được chọn mới phải xác nhận đọc mệnh lệnh.
                </div>
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block">Nội dung</Label>
              <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={5} placeholder={`Nội dung ${noun}...`} />
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
              <div>
                <Label className="mb-1.5 block">Theo lệnh</Label>
                <Select
                  value={form.orderedBy || NO_ORDERER}
                  onValueChange={(v) => setForm({ ...form, orderedBy: v === NO_ORDERER ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Chọn người ra lệnh" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ORDERER}>— Không chỉ định —</SelectItem>
                    {ordererOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block">Cấp lệnh</Label>
                <Select
                  value={form.orderAuthority}
                  onValueChange={(v) => setOrderAuthority(v as OrderAuthority)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ORDER_AUTHORITIES.map((authority) => (
                      <SelectItem key={authority} value={authority}>{authority}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {!isOrder && (
              <>
                <div>
                  <Label className="mb-1.5 flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Link website (tuỳ chọn)</Label>
                  <Input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="https://..." />
                </div>
                <div>
                  <Label className="mb-1.5 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Tệp PDF đính kèm (tuỳ chọn)</Label>
                  {form.fileUrl ? (
                    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                      <FileText className="h-4 w-4 shrink-0 text-destructive" />
                      <span className="min-w-0 flex-1 truncate text-ink">{form.fileName || "Tệp PDF"}</span>
                      <button type="button" onClick={() => setForm({ ...form, fileUrl: "", fileName: "" })} title="Gỡ tệp" className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" className="w-full justify-center" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
                      {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      Chọn tệp PDF
                    </Button>
                  )}
                  <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onPickFile} />
                </div>
              </>
            )}
            <label className="flex items-center gap-2 text-sm text-ink">
              <Checkbox checked={form.pinned} onCheckedChange={(v) => setForm({ ...form, pinned: !!v })} />
              Ghim lên đầu danh sách
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Huỷ</Button>
            <Button onClick={submit} disabled={pending || upload.isPending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Lưu" : "Đăng"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Xoá mệnh lệnh"
        description={deleting ? `Bạn chắc chắn muốn xoá “${deleting.title}”? Hành động này không thể hoàn tác.` : undefined}
        confirmLabel="Xoá"
        loading={del.isPending}
        onConfirm={confirmDelete}
      />

      {/* Tình trạng đọc — chỉ ADMIN / Trưởng ca */}
      <Dialog open={!!readersOf} onOpenChange={(o) => !o && setReadersOf(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tình trạng xác nhận đọc</DialogTitle>
          </DialogHeader>
          {readersOf && (() => {
            const targetUsers = activeUsers.filter((u) => isAnnouncementTargetForPosition(readersOf.classification, effectiveUserPosition(u)));
            const targetUserIds = new Set(targetUsers.map((u) => u.id));
            const trackedReads = readersOf.reads.filter((r) => targetUserIds.has(r.userId));
            const readSet = new Set(trackedReads.map((r) => r.userId));
            const unread = targetUsers.filter((u) => !readSet.has(u.id));
            return (
              <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
                <div className="truncate text-sm font-semibold text-ink">{readersOf.title}</div>
                <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Cương vị nhận lệnh: <span className="font-medium text-ink">{announcementTargetLabel(readersOf.classification)}</span>
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    <Check className="h-4 w-4" /> Đã đọc ({trackedReads.length})
                  </div>
                  {trackedReads.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Chưa có ai xác nhận đọc.</p>
                  ) : (
                    <ul className="space-y-1">
                      {trackedReads.map((r) => (
                        <li key={r.userId} className="flex items-center justify-between gap-2 rounded-md bg-emerald-50 px-3 py-1.5 text-sm dark:bg-emerald-500/10">
                          <span className="min-w-0 truncate">
                            <span className="font-medium text-ink">{r.user.name}</span>
                            {effectiveUserPosition(r.user) && <span className="ml-1.5 text-xs text-muted-foreground">{effectiveUserPosition(r.user)}</span>}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">{formatDate(r.readAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
                    <Clock className="h-4 w-4" /> Chưa đọc ({unread.length})
                  </div>
                  {unread.length === 0 ? (
                    <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Tất cả nhân sự đã xác nhận đọc 🎉</p>
                  ) : (
                    <ul className="space-y-1">
                      {unread.map((u) => (
                        <li key={u.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
                          <span className="font-medium text-ink">{u.name}</span>
                          {effectiveUserPosition(u) && <span className="text-xs text-muted-foreground">· {effectiveUserPosition(u)}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
