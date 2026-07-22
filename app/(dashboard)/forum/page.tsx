"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Activity,
  BookOpenText,
  Bold,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  Heart,
  Archive,
  Layers3,
  Italic,
  MessageCircle,
  Link2,
  List,
  ListOrdered,
  MessageSquareText,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Reply,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  Underline,
  Workflow,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useCreateForumPost,
  useCreateForumReply,
  useCloseForumPost,
  useDeleteForumPost,
  useDeleteForumReply,
  useForumPosts,
  useForumReplies,
  useToggleForumLike,
  useToggleForumReplyLike,
  useUpdateForumPost,
  useUpdateForumReply,
  type ForumAuthor,
  type ForumPost,
  type ForumReply,
} from "@/hooks/useForum";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { normalizeText } from "@/lib/nav";
import { ALL_ANNOUNCEMENT_POSITIONS } from "@/lib/announcement-targets";
import { forumTargetPositionLabels, forumTargetPositionsLabel } from "@/lib/forum-targets";
import { announcementPositionLabel, announcementShiftRosterPositionOptions } from "@/lib/positions";
import { cn, formatDateTime, initials } from "@/lib/utils";

const CATEGORIES = [
  { value: "ALL", label: "Tất cả", icon: MessageSquareText, tone: "bg-slate-100 text-slate-700", signal: "bg-slate-500", rail: "border-slate-400" },
  { value: "DISCUSSION", label: "Trao đổi kỹ thuật", icon: MessageSquareText, tone: "bg-blue-50 text-blue-700", signal: "bg-blue-500", rail: "border-blue-500" },
  { value: "DOCUMENT", label: "Tài liệu", icon: FileText, tone: "bg-emerald-50 text-emerald-700", signal: "bg-emerald-500", rail: "border-emerald-500" },
  { value: "OPERATION_HANDBOOK", label: "Cẩm nang vận hành", icon: BookOpenText, tone: "bg-cyan-50 text-cyan-700", signal: "bg-cyan-500", rail: "border-cyan-500" },
  { value: "PROCEDURE", label: "Quy trình", icon: BookOpenText, tone: "bg-amber-50 text-amber-700", signal: "bg-amber-500", rail: "border-amber-500" },
  { value: "DRAWING", label: "Sơ đồ / bản vẽ", icon: Workflow, tone: "bg-violet-50 text-violet-700", signal: "bg-violet-500", rail: "border-violet-500" },
] as const;

const DEFAULT_FORM = {
  title: "",
  content: "",
  category: "DISCUSSION",
  tags: "",
  attachments: "",
  targetPositions: [ALL_ANNOUNCEMENT_POSITIONS] as string[],
};

const TEXT_COLORS = [
  { label: "Đen", value: "#1f2937", className: "bg-slate-800" },
  { label: "Đỏ", value: "#dc2626", className: "bg-red-600" },
  { label: "Xanh dương", value: "#2563eb", className: "bg-blue-600" },
  { label: "Xanh lá", value: "#059669", className: "bg-emerald-600" },
  { label: "Cam", value: "#d97706", className: "bg-amber-600" },
] as const;

export default function ForumPage() {
  const searchParams = useSearchParams();
  const linkedPostId = searchParams.get("postId");
  const linkedReplyId = searchParams.get("replyId");
  const { data: session } = useSession();
  const rbac = useRbacAccess();
  const canWriteForum = rbac.can("forum-write", ["create", "manage", "full"]);
  const canModerateForum = rbac.can("forum-moderate", ["full"]);
  const currentUserId = session?.user?.id;
  const [category, setCategory] = React.useState("ALL");
  const [q, setQ] = React.useState("");
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [editingPost, setEditingPost] = React.useState<ForumPost | null>(null);
  const [form, setForm] = React.useState(DEFAULT_FORM);
  const [replyDrafts, setReplyDrafts] = React.useState<Record<string, string>>({});
  const [replyLinks, setReplyLinks] = React.useState<Record<string, string>>({});
  const [replyTargets, setReplyTargets] = React.useState<Record<string, ForumReply | null>>({});
  const [expandedReplies, setExpandedReplies] = React.useState<Record<string, boolean>>({});
  const [deletePostTarget, setDeletePostTarget] = React.useState<ForumPost | null>(null);
  const [deleteReplyTarget, setDeleteReplyTarget] = React.useState<ForumReply | null>(null);
  const [closePostTarget, setClosePostTarget] = React.useState<ForumPost | null>(null);
  const [closeSummary, setCloseSummary] = React.useState("");
  const [showClosedBox, setShowClosedBox] = React.useState(false);
  const composeRef = React.useRef<HTMLDivElement>(null);
  const titleInputRef = React.useRef<HTMLInputElement>(null);
  // Header forum dính (sticky) dưới topbar app (h-16 = 64px). Đo chiều cao header động
  // để 2 sidebar dính ngay dưới header, không đè lên nhau — chỉ cột nội dung giữa cuộn.
  const headerRef = React.useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = React.useState(96);
  const TOPBAR_H = 64;
  const sidebarStickyTop = TOPBAR_H + headerH + 8;

  const debouncedQ = useDebouncedValue(q, 300);
  const posts = useForumPosts({ category, q: debouncedQ, status: showClosedBox ? "CLOSED" : "OPEN" });
  const closedPosts = useForumPosts({ status: "CLOSED" });
  const createPost = useCreateForumPost();
  const updatePost = useUpdateForumPost();
  const closePost = useCloseForumPost();
  const createReply = useCreateForumReply();
  const deletePost = useDeleteForumPost();
  const deleteReply = useDeleteForumReply();
  const rows = posts.data?.data ?? [];
  const closedCount = closedPosts.data?.data?.length ?? 0;
  const positionOptions = React.useMemo(() => announcementShiftRosterPositionOptions(), []);

  const postValid = form.title.trim().length > 0 && richTextPlainText(form.content).length > 0;
  const savingPost = createPost.isPending || updatePost.isPending;

  React.useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    if (!composeOpen || !editingPost) return;
    const frame = window.requestAnimationFrame(() => {
      composeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      titleInputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [composeOpen, editingPost]);

  React.useEffect(() => {
    if (!linkedPostId) return;
    const openTarget = posts.data?.data?.find((post) => post.id === linkedPostId);
    const closedTarget = closedPosts.data?.data?.find((post) => post.id === linkedPostId);
    if (!openTarget && !closedTarget) return;
    setCategory("ALL");
    setQ("");
    setShowClosedBox(Boolean(closedTarget));
    if (linkedReplyId) setExpandedReplies((state) => ({ ...state, [linkedPostId]: true }));
  }, [closedPosts.data, linkedPostId, linkedReplyId, posts.data]);

  React.useEffect(() => {
    if (!linkedPostId || !rows.some((post) => post.id === linkedPostId)) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`forum-post-${linkedPostId}`);
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [linkedPostId, rows]);

  function openCreate() {
    setShowClosedBox(false);
    setEditingPost(null);
    setForm(DEFAULT_FORM);
    setComposeOpen(true);
  }

  function openEditPost(post: ForumPost) {
    setEditingPost(post);
    setForm({
      title: post.title,
      content: post.content,
      category: post.category,
      tags: post.tags.join(", "),
      attachments: post.attachments.join("\n"),
      targetPositions: forumTargetPositionLabels(post.targetPositions),
    });
    setComposeOpen(true);
  }

  function targetsAllPositions() {
    return form.targetPositions.includes(ALL_ANNOUNCEMENT_POSITIONS);
  }

  function setTargetPositions(next: string[]) {
    setForm((f) => ({ ...f, targetPositions: next }));
  }

  function toggleTargetPosition(position: string, checked: boolean) {
    setForm((f) => {
      const current = (f.targetPositions ?? []).filter((item) => item !== ALL_ANNOUNCEMENT_POSITIONS);
      const positionKey = normalizeText(announcementPositionLabel(position));
      const otherPositions = current.filter((item) => normalizeText(announcementPositionLabel(item)) !== positionKey);
      const next = checked
        ? Array.from(new Set([...otherPositions, announcementPositionLabel(position)]))
        : otherPositions;
      return { ...f, targetPositions: next };
    });
  }

  async function submitPost() {
    if (!postValid) return;
    if (form.targetPositions.length === 0) return toast.error("Chọn cương vị nhận thông báo");
    try {
      const payload = {
        title: form.title,
        content: form.content,
        category: form.category,
        tags: splitLines(form.tags),
        attachments: splitLines(form.attachments),
        targetPositions: form.targetPositions,
      };
      if (editingPost) {
        await updatePost.mutateAsync({ id: editingPost.id, ...payload });
        toast.success("Đã cập nhật chủ đề");
      } else {
        await createPost.mutateAsync(payload);
        toast.success("Đã đăng chủ đề Forum");
      }
      setForm(DEFAULT_FORM);
      setEditingPost(null);
      setComposeOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function togglePin(post: ForumPost) {
    try {
      await updatePost.mutateAsync({ id: post.id, isPinned: !post.isPinned });
      toast.success(post.isPinned ? "Đã bỏ ghim chủ đề" : "Đã ghim chủ đề");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function openClosePost(post: ForumPost) {
    setClosePostTarget(post);
    setCloseSummary("");
  }

  async function submitClosePost() {
    if (!closePostTarget) return;
    if (!closeSummary.trim()) return toast.error("Vui lòng nhập tóm tắt ý chính trước khi đóng chủ đề");
    try {
      await closePost.mutateAsync({ id: closePostTarget.id, closeSummary });
      toast.success("Đã đóng chủ đề và lưu vào hộp đã kết thúc");
      setClosePostTarget(null);
      setCloseSummary("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function submitReply(postId: string) {
    if (!richTextPlainText(replyDrafts[postId] ?? "")) return;
    try {
      await createReply.mutateAsync({
        postId,
        content: replyDrafts[postId] ?? "",
        attachments: splitLines(replyLinks[postId] ?? ""),
        parentReplyId: replyTargets[postId]?.id ?? null,
      });
      setReplyDrafts((s) => ({ ...s, [postId]: "" }));
      setReplyLinks((s) => ({ ...s, [postId]: "" }));
      setReplyTargets((s) => ({ ...s, [postId]: null }));
      setExpandedReplies((s) => ({ ...s, [postId]: true }));
      toast.success("Đã gửi phản hồi");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function canManage(authorId: string) {
    return canModerateForum || (!!currentUserId && authorId === currentUserId);
  }

  const visibleReplyCount = rows.reduce((sum, post) => sum + (post.replyCount ?? 0), 0);

  return (
    <div className="pb-8">
      <div>
        <header ref={headerRef} className="sticky top-16 z-20 mb-4 overflow-hidden rounded-[20px] border border-border bg-white px-4 py-4 shadow-sm sm:px-5">
          <div className="pointer-events-none absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-blue-50 to-transparent" />
          <div className="relative grid gap-4 2xl:grid-cols-[minmax(260px,0.8fr)_minmax(340px,1.25fr)_auto] 2xl:items-center">
            <div>
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.28em] text-[#f59e0b]">
                <span className="h-1.5 w-5 bg-[#f59e0b]" /> Technical intelligence
              </div>
              <div className="mt-1.5 flex items-baseline gap-3">
                <h1 className="text-2xl font-black tracking-[-0.04em] text-[#0b2340] sm:text-[28px]">Forum kỹ thuật</h1>
                <span className="hidden text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:inline">DH1 / Knowledge Ops</span>
              </div>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Truy vấn sự cố, thiết bị, quy trình, bản vẽ..."
                className="h-12 border-border bg-slate-50 pl-11 pr-20 text-ink placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-accent/15"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-slate-100 px-2 py-1 text-[9px] font-black tracking-wider text-slate-400">SEARCH</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 2xl:justify-end">
              <Button
                variant="outline"
                className={cn(
                  "h-10",
                  showClosedBox && "border-amber-400/60 bg-amber-50 text-amber-700 hover:bg-amber-100"
                )}
                onClick={() => { setShowClosedBox((value) => !value); setComposeOpen(false); setEditingPost(null); }}
              >
                <Archive className="h-4 w-4" /> {showClosedBox ? "Luồng hiện hành" : `Kho lưu trữ ${closedCount ? `· ${closedCount}` : ""}`}
              </Button>
              {canWriteForum && (
                <Button className="h-10" onClick={() => (composeOpen ? setComposeOpen(false) : openCreate())}>
                  {composeOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {composeOpen ? "Đóng" : "Tạo chủ đề"}
                </Button>
              )}
            </div>
          </div>
        </header>

        <div className="relative grid gap-4 xl:grid-cols-[210px_minmax(0,1fr)_250px]">
          <aside className="h-fit rounded-[18px] border border-border bg-white p-3 shadow-sm xl:sticky" style={{ top: sidebarStickyTop }}>
            <div className="flex items-center gap-2 px-2 pb-3 text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">
              <Layers3 className="h-3.5 w-3.5 text-blue-500" /> Kênh trao đổi
            </div>
            <nav className="flex gap-2 overflow-x-auto pb-1 xl:block xl:space-y-1 xl:overflow-visible" aria-label="Phân loại chủ đề Forum">
              {CATEGORIES.map((item) => {
                const CategoryIcon = item.icon;
                const active = category === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setCategory(item.value)}
                    className={cn(
                      "group flex min-h-11 shrink-0 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-left text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent xl:w-full",
                      active ? "bg-[#102d4d] text-white" : "text-slate-600 hover:bg-slate-100 hover:text-[#0b2340]"
                    )}
                  >
                    <CategoryIcon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-slate-400 group-hover:text-blue-600")} />
                    <span className="whitespace-nowrap xl:min-w-0 xl:truncate">{item.label}</span>
                    {active && <ChevronRight className="ml-auto hidden h-3.5 w-3.5 xl:block" />}
                  </button>
                );
              })}
            </nav>
            <div className="mt-4 hidden border-t border-border pt-4 xl:block">
              <div className="flex items-center gap-2 px-2 text-[10px] font-bold text-slate-500">
                <span className={cn("h-2 w-2 rounded-full", showClosedBox ? "bg-amber-400" : "bg-emerald-500")} />
                {showClosedBox ? "Đang truy cập kho" : "Hệ thống trực tuyến"}
              </div>
            </div>
          </aside>

          <main className="min-w-0 space-y-4">

      {composeOpen && (
        <Card ref={composeRef} className="scroll-mt-40 overflow-hidden border-cyan-200 shadow-[0_14px_36px_rgba(8,145,178,0.10)]">
          <div className="flex items-center justify-between bg-[#102d4d] px-4 py-3 text-white sm:px-5">
            <div>
              <div className="flex items-center gap-2 text-sm font-black"><Plus className="h-4 w-4 text-cyan-300" /> {editingPost ? "Hiệu chỉnh chủ đề" : "Khởi tạo chủ đề kỹ thuật"}</div>
              <div className="mt-0.5 text-xs text-slate-300">Nội dung sẽ được phân phối theo đúng cương vị nhận thông báo.</div>
            </div>
            <Button variant="ghost" size="icon" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => { setComposeOpen(false); setEditingPost(null); }}><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-[220px_1fr]">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Loại bài viết</label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter((c) => c.value !== "ALL").map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Tiêu đề *</label>
              <Input ref={titleInputRef} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="VD: Chia sẻ quy trình xử lý rung quạt khói IDF..." />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nội dung trao đổi *</label>
              <RichTextEditor value={form.content} onChange={(content) => setForm((f) => ({ ...f, content }))} placeholder="Nhập mô tả, kinh nghiệm xử lý, câu hỏi kỹ thuật..." />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Cương vị nhận thông báo</label>
              <div className="rounded-lg border border-border p-3">
                <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-ink hover:bg-muted/60">
                  <Checkbox
                    checked={targetsAllPositions()}
                    onCheckedChange={(checked) => setTargetPositions(checked ? [ALL_ANNOUNCEMENT_POSITIONS] : [])}
                  />
                  Tất cả cương vị
                </label>
                {!targetsAllPositions() && (
                  <div className="mt-2 grid max-h-44 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
                    {positionOptions.length === 0 ? (
                      <div className="px-2 py-3 text-sm text-muted-foreground">Chưa có dữ liệu cương vị.</div>
                    ) : (
                      positionOptions.map((position) => {
                        const selected = form.targetPositions.some((item) => normalizeText(announcementPositionLabel(item)) === normalizeText(position));
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
                  Chỉ nhân viên thuộc cương vị được chọn mới nhận thông báo chủ đề này.
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Tag</label>
              <Input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="ESP, dầu bôi trơn, IDF..." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Link tài liệu / bản vẽ</label>
              <Input value={form.attachments} onChange={(e) => setForm((f) => ({ ...f, attachments: e.target.value }))} placeholder="Dán link PDF, Google Drive, sơ đồ..." />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
            <Button variant="outline" onClick={() => { setComposeOpen(false); setEditingPost(null); }}>Hủy</Button>
            <Button onClick={submitPost} disabled={savingPost || !postValid}>
              <Send className="h-4 w-4" /> {editingPost ? "Lưu thay đổi" : "Đăng chủ đề"}
            </Button>
          </div>
        </Card>
      )}

      {posts.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-36 animate-pulse rounded-xl border border-border bg-muted/50" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title={showClosedBox ? "Chưa có chủ đề đã kết thúc" : "Chưa có chủ đề Forum"}
          description={showClosedBox ? "Các chủ đề đã đóng kèm tóm tắt ý chính sẽ xuất hiện tại đây." : "Tạo chủ đề đầu tiên để chia sẻ tài liệu, quy trình hoặc câu hỏi kỹ thuật với ca/kíp."}
          action={!showClosedBox && canWriteForum ? { label: "Tạo chủ đề", onClick: openCreate } : undefined}
        />
      ) : (
        <div className="space-y-4">
          {rows.map((post) => (
            <ForumPostCard
              key={post.id}
              post={post}
              reply={replyDrafts[post.id] ?? ""}
              replyLinks={replyLinks[post.id] ?? ""}
              replyTarget={replyTargets[post.id] ?? null}
              repliesOpen={expandedReplies[post.id] ?? false}
              setReply={(v) => setReplyDrafts((s) => ({ ...s, [post.id]: v }))}
              setReplyLinks={(v) => setReplyLinks((s) => ({ ...s, [post.id]: v }))}
              onReplyTo={(reply) => {
                setExpandedReplies((s) => ({ ...s, [post.id]: true }));
                setReplyTargets((s) => ({ ...s, [post.id]: reply }));
              }}
              onClearReplyTarget={() => setReplyTargets((s) => ({ ...s, [post.id]: null }))}
              onToggleReplies={() => setExpandedReplies((s) => ({ ...s, [post.id]: !(s[post.id] ?? false) }))}
              onOpenReplies={() => setExpandedReplies((s) => ({ ...s, [post.id]: true }))}
              onReply={() => submitReply(post.id)}
              replying={createReply.isPending}
              canWrite={canWriteForum}
              isClosedBox={showClosedBox}
              isAdmin={canModerateForum}
              canManagePost={canManage(post.author.id)}
              canManageReply={(authorId) => canManage(authorId)}
              onEditPost={() => openEditPost(post)}
              onClosePost={() => openClosePost(post)}
              onTogglePin={() => togglePin(post)}
              pinning={updatePost.isPending}
              onDeletePost={() => setDeletePostTarget(post)}
              onDeleteReply={(reply) => setDeleteReplyTarget(reply)}
              highlighted={post.id === linkedPostId}
              targetReplyId={post.id === linkedPostId ? linkedReplyId : null}
            />
          ))}
        </div>
      )}

          </main>

          <aside className="h-fit space-y-3 xl:sticky" style={{ top: sidebarStickyTop }}>
            <section className="overflow-hidden rounded-[18px] border border-border bg-white text-ink shadow-sm">
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.22em] text-blue-600">
                  <Activity className="h-3.5 w-3.5" /> Network pulse
                </div>
                <div className="mt-1 text-sm font-black text-[#0b2340]">Trạng thái bài đăng</div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border xl:grid-cols-1 xl:divide-x-0 xl:divide-y">
                <WorkspaceStat label={showClosedBox ? "Trong kho" : "Đang hiển thị"} value={rows.length} accent="text-blue-600" />
                <WorkspaceStat label="Phản hồi" value={visibleReplyCount} accent="text-sky-600" />
                <WorkspaceStat label="Đã kết thúc" value={closedCount} accent="text-amber-600" />
              </div>
            </section>

            <section className="rounded-[18px] border border-border bg-white p-4 text-ink shadow-sm">
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">
                <SlidersHorizontal className="h-3.5 w-3.5 text-amber-500" /> Quy ước vận hành
              </div>
              <div className="mt-4 space-y-3">
                <GuideRow index="01" title="Đặt vấn đề rõ" description="Nêu thiết bị, hiện tượng và điều kiện vận hành." />
                <GuideRow index="02" title="Bổ sung tài liệu" description="Đính kèm quy trình, bản vẽ hoặc số liệu liên quan." />
                <GuideRow index="03" title="Rút kết kinh nghiệm" description="Tổng kết phương án sau khi hoàn tất trao đổi." />
              </div>
            </section>

            <div className="rounded-[18px] border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-slate-600">
              <div className="mb-1 font-black text-blue-700">Kết nối theo ca/kíp</div>
              Chủ đề được phân phối đúng cương vị và đồng bộ trạng thái đọc theo tài khoản.
            </div>
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={!!deletePostTarget}
        onOpenChange={(open) => !open && setDeletePostTarget(null)}
        title="Gỡ chủ đề Forum?"
        description={deletePostTarget ? `Gỡ chủ đề “${deletePostTarget.title}” và toàn bộ phản hồi liên quan?` : undefined}
        confirmLabel="Gỡ"
        loading={deletePost.isPending}
        onConfirm={async () => {
          if (!deletePostTarget) return;
          try {
            await deletePost.mutateAsync(deletePostTarget.id);
            toast.success("Đã gỡ chủ đề Forum");
            setDeletePostTarget(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />

      <Dialog open={!!closePostTarget} onOpenChange={(open) => { if (!open) { setClosePostTarget(null); setCloseSummary(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đóng chủ đề Forum</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm font-semibold text-ink">
              {closePostTarget?.title}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Tóm tắt ý chính, thiết thực *</label>
              <Textarea
                value={closeSummary}
                onChange={(e) => setCloseSummary(e.target.value)}
                rows={5}
                placeholder="Ghi lại các kết luận, kinh nghiệm, khuyến nghị hoặc điểm cần áp dụng sau trao đổi..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setClosePostTarget(null); setCloseSummary(""); }}>Hủy</Button>
            <Button onClick={submitClosePost} disabled={closePost.isPending || !closeSummary.trim()}>
              <Archive className="h-4 w-4" /> Đóng chủ đề
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteReplyTarget}
        onOpenChange={(open) => !open && setDeleteReplyTarget(null)}
        title="Gỡ phản hồi Forum?"
        description="Gỡ phản hồi này khỏi chủ đề Forum?"
        confirmLabel="Gỡ"
        loading={deleteReply.isPending}
        onConfirm={async () => {
          if (!deleteReplyTarget) return;
          try {
            await deleteReply.mutateAsync(deleteReplyTarget.id);
            toast.success("Đã gỡ phản hồi Forum");
            setDeleteReplyTarget(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

function ForumPostCard({
  post,
  reply,
  replyLinks,
  replyTarget,
  repliesOpen,
  setReply,
  setReplyLinks,
  onReplyTo,
  onClearReplyTarget,
  onToggleReplies,
  onOpenReplies,
  onReply,
  replying,
  canWrite,
  isClosedBox,
  isAdmin,
  canManagePost,
  canManageReply,
  onEditPost,
  onClosePost,
  onTogglePin,
  pinning,
  onDeletePost,
  onDeleteReply,
  highlighted,
  targetReplyId,
}: {
  post: ForumPost;
  reply: string;
  replyLinks: string;
  replyTarget: ForumReply | null;
  repliesOpen: boolean;
  setReply: (v: string) => void;
  setReplyLinks: (v: string) => void;
  onReplyTo: (reply: ForumReply) => void;
  onClearReplyTarget: () => void;
  onToggleReplies: () => void;
  onOpenReplies: () => void;
  onReply: () => void;
  replying: boolean;
  canWrite: boolean;
  isClosedBox: boolean;
  isAdmin: boolean;
  canManagePost: boolean;
  canManageReply: (authorId: string) => boolean;
  onEditPost: () => void;
  onClosePost: () => void;
  onTogglePin: () => void;
  pinning: boolean;
  onDeletePost: () => void;
  onDeleteReply: (reply: ForumReply) => void;
  highlighted: boolean;
  targetReplyId: string | null;
}) {
  const category = CATEGORIES.find((c) => c.value === post.category) ?? CATEGORIES[1];
  const Icon = category.icon;
  const updateReply = useUpdateForumReply();
  const toggleLike = useToggleForumLike();
  const toggleReplyLike = useToggleForumReplyLike();
  const repliesQuery = useForumReplies(post.id, repliesOpen);
  const [editingReplyId, setEditingReplyId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState("");
  const [editLinks, setEditLinks] = React.useState("");
  const [collapsedReplyThreads, setCollapsedReplyThreads] = React.useState<Record<string, boolean>>({});
  const [expandedReplyBodies, setExpandedReplyBodies] = React.useState<Record<string, boolean>>({});
  const replies = repliesQuery.data?.data ?? [];
  const replyTree = React.useMemo(() => buildReplyTree(replies), [replies]);
  const likeCount = post.likeCount ?? 0;
  const replyCount = post.replyCount ?? 0;
  const isClosed = !!post.closedAt;

  React.useEffect(() => {
    if (!targetReplyId || repliesQuery.isLoading) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`forum-reply-${targetReplyId}`);
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [repliesQuery.isLoading, replies, targetReplyId]);

  function startEditReply(r: ForumReply) {
    setEditingReplyId(r.id);
    setEditDraft(r.content);
    setEditLinks(r.attachments.join("\n"));
  }
  async function saveEditReply(id: string) {
    if (!richTextPlainText(editDraft)) return;
    try {
      await updateReply.mutateAsync({ id, content: editDraft, attachments: splitLines(editLinks) });
      setEditingReplyId(null);
      toast.success("Đã cập nhật phản hồi");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function toggleReplyThread(replyId: string) {
    setCollapsedReplyThreads((state) => ({ ...state, [replyId]: !(state[replyId] ?? false) }));
  }

  function renderReplyCard(r: ForumReply, depth = 0): React.ReactNode {
    const childReplies = replyTree.childrenByParent.get(r.id) ?? [];
    const childCount = countNestedReplies(r.id, replyTree.childrenByParent);
    const childrenCollapsed = collapsedReplyThreads[r.id] ?? false;
    const replyPlainText = richTextPlainText(r.content);
    const isLongReply = replyPlainText.length > 700 || replyPlainText.split(/\r?\n/).length > 10;
    const replyBodyExpanded = expandedReplyBodies[r.id] ?? false;

    return (
      <div
        key={r.id}
        id={`forum-reply-${r.id}`}
        tabIndex={-1}
        className={cn(
          "relative min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
          depth > 0 && "ml-3 border-l border-dashed border-cyan-300 pl-3 sm:ml-8 sm:pl-5",
          targetReplyId === r.id && "ring-2 ring-blue-500 ring-offset-2"
        )}
      >
        <article className={cn(
          "min-w-0 rounded-r-xl rounded-l-sm border border-slate-200 border-l-[3px] bg-white p-3.5 shadow-[0_8px_22px_rgba(15,39,72,0.05)] sm:p-4",
          category.rail,
          depth > 0 && "bg-white/80 shadow-none"
        )}>
          <header className="flex min-w-0 items-start justify-between gap-3">
            <AuthorInline author={r.author} date={r.createdAt} />
            {canManageReply(r.author.id) && editingReplyId !== r.id && (
              <div className="flex shrink-0 items-center rounded-lg border border-slate-200 bg-slate-50/80 p-0.5">
                <Button variant="ghost" size="icon" title="Sửa phản hồi" className="h-8 w-8 text-muted-foreground hover:bg-white hover:text-accent" onClick={() => startEditReply(r)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" title="Gỡ phản hồi" className="h-8 w-8 text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={() => onDeleteReply(r)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </header>
          {editingReplyId === r.id ? (
            <div className="mt-3 grid gap-2">
              <RichTextEditor value={editDraft} onChange={setEditDraft} compact placeholder="Cập nhật nội dung phản hồi..." />
              <Input value={editLinks} onChange={(e) => setEditLinks(e.target.value)} placeholder="Link tài liệu kèm theo nếu có..." />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingReplyId(null)}>Hủy</Button>
                <Button size="sm" onClick={() => saveEditReply(r.id)} disabled={updateReply.isPending || !richTextPlainText(editDraft)}>Lưu</Button>
              </div>
            </div>
          ) : (
            <>
              {depth === 0 && r.parentReply && (
                <ReplyContextBox
                  className="mt-3"
                  label={`Đang trả lời ${r.parentReply.author.name}`}
                  content={r.parentReply.content}
                />
              )}
              <div
                className={cn(
                  "relative mt-3 min-w-0 overflow-hidden border-t border-slate-100 pt-3",
                  isLongReply && !replyBodyExpanded && "max-h-64"
                )}
              >
                <RichTextContent
                  value={r.content}
                  className={cn(
                    "w-full text-sm leading-6 text-slate-800",
                    isLongReply && replyBodyExpanded && "xl:columns-2 xl:gap-10 xl:[column-rule:1px_solid_#e2e8f0]"
                  )}
                />
                {isLongReply && !replyBodyExpanded && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white via-white/95 to-transparent" />
                )}
              </div>
              {isLongReply && (
                <button
                  type="button"
                  aria-expanded={replyBodyExpanded}
                  onClick={() => setExpandedReplyBodies((state) => ({ ...state, [r.id]: !replyBodyExpanded }))}
                  className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {replyBodyExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {replyBodyExpanded ? "Thu gọn nội dung" : "Xem toàn bộ phản hồi"}
                </button>
              )}
              {r.attachments.length > 0 && <AttachmentList links={r.attachments} compact />}
              <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleReplyLike.mutate(r.id)}
                  disabled={toggleReplyLike.isPending}
                  className={cn(
                    "h-8 rounded-md px-2.5 text-xs font-bold transition-colors duration-200",
                    r.likedByMe
                      ? "bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700"
                      : "text-slate-600 hover:bg-rose-50 hover:text-rose-600"
                  )}
                >
                  <Heart className={cn("h-3.5 w-3.5", r.likedByMe && "fill-current")} />
                  Thích{r.likeCount ? ` (${r.likeCount})` : ""}
                </Button>
                {canWrite && !isClosed && !isClosedBox && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onReplyTo(r)}
                    className="h-8 rounded-md px-2.5 text-xs font-bold text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                  >
                    <Reply className="h-3.5 w-3.5" />
                    Trả lời
                  </Button>
                )}
                {childCount > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleReplyThread(r.id)}
                    className="h-8 rounded-md px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  >
                    {childrenCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {childrenCollapsed ? `Hiện ${childCount} trả lời` : "Thu gọn trả lời"}
                  </Button>
                )}
              </div>
            </>
          )}
        </article>
        {childReplies.length > 0 && !childrenCollapsed && (
          <div className="mt-2 space-y-2">
            {childReplies.map((child) => renderReplyCard(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card
      id={`forum-post-${post.id}`}
      tabIndex={-1}
      className={cn(
        "overflow-hidden border-slate-200/90 bg-white shadow-[0_14px_36px_rgba(15,39,72,0.08)] transition-shadow duration-200 hover:shadow-[0_18px_44px_rgba(15,39,72,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
        post.isPinned && "ring-1 ring-amber-300/80",
        highlighted && "ring-2 ring-accent ring-offset-2"
      )}
    >
      <div className={cn("h-1.5 w-full", category.signal)} />
      <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="relative flex flex-col justify-between gap-5 overflow-hidden border-b border-slate-200 bg-[#f3f7fb] p-4 lg:border-b-0 lg:border-r lg:p-5">
          <div className="pointer-events-none absolute -right-12 -top-10 h-32 w-32 rounded-full border-[24px] border-white/70" />
          <div className="relative">
            <div className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl shadow-sm", category.tone)}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Nội dung chia sẻ</div>
            <div className="mt-1 text-sm font-black text-[#102d4d]">{category.label}</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.isPinned && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-800">
                  <Pin className="h-3 w-3" /> Ưu tiên
                </span>
              )}
              {isClosed ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-200 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-700">
                  <Archive className="h-3 w-3" /> Đã kết thúc
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-800">
                  <Activity className="h-3 w-3" /> Đang trao đổi
                </span>
              )}
            </div>
          </div>

          <div className="relative flex items-center gap-2.5 border-t border-slate-200 pt-4">
            <Avatar author={post.author} />
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-[#102d4d]">{post.author.name}</div>
              <div className="mt-0.5 text-[11px] leading-4 text-slate-500">
                {formatDateTime(post.createdAt)}{post.updatedAt !== post.createdAt ? " · đã sửa" : ""}
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 p-4 sm:p-5 lg:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {!!post.targetPositions?.length && (
                <Badge variant="secondary" className="rounded-md bg-slate-100 font-semibold text-slate-700">
                  Cương vị: {forumTargetPositionsLabel(post.targetPositions)}
                </Badge>
              )}
              {post.tags.map((tag) => <Badge key={tag} variant="outline" className="rounded-md border-slate-200 text-slate-500">#{tag}</Badge>)}
            </div>
            <div className="flex shrink-0 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 shadow-sm">
              {isAdmin && (
                <Button variant="ghost" size="icon" title={post.isPinned ? "Bỏ ghim" : "Ghim chủ đề"} className="h-8 w-8 text-slate-500 hover:bg-white hover:text-amber-600" onClick={onTogglePin} disabled={pinning}>
                  {post.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </Button>
              )}
              {canManagePost && !isClosed && (
                <Button variant="ghost" size="icon" title="Sửa chủ đề" className="h-8 w-8 text-slate-500 hover:bg-white hover:text-blue-700" onClick={onEditPost}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {canManagePost && !isClosed && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Đóng chủ đề"
                  className="h-8 w-8 text-slate-500 hover:bg-amber-50 hover:text-amber-700"
                  onClick={onClosePost}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              )}
              {canManagePost && (
                <Button variant="ghost" size="icon" title="Gỡ chủ đề" className="h-8 w-8 text-slate-500 hover:bg-red-50 hover:text-destructive" onClick={onDeletePost}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <h2 className="mt-4 max-w-5xl text-xl font-black leading-7 tracking-[-0.02em] text-[#0b2340] sm:text-[22px] sm:leading-8">{post.title}</h2>
          <div className={cn("mt-4 border-l-2 pl-4", category.rail)}>
            <RichTextContent value={post.content} className="max-w-5xl text-sm leading-7 text-slate-600" />
          </div>
        {post.attachments.length > 0 && <AttachmentList links={post.attachments} />}
        {isClosed && post.closeSummary && (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Biên bản tổng kết chủ đề</div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-emerald-950">{post.closeSummary}</p>
            <div className="mt-2 text-xs text-emerald-700">
              Đóng bởi {post.closedBy?.name ?? "—"} lúc {formatDateTime(post.closedAt)}
            </div>
          </div>
        )}
          <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <div className="inline-flex items-center gap-1.5 font-bold text-slate-600">
                <Heart className="h-4 w-4 fill-rose-100 text-rose-500" /> {likeCount} lượt thích
            </div>
            <button
              type="button"
              onClick={onToggleReplies}
                className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 font-bold text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <MessageCircle className="h-4 w-4 text-blue-600" />
              {replyCount} bình luận
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => toggleLike.mutate(post.id)}
              disabled={toggleLike.isPending}
              className={cn(
                  "rounded-lg px-4 font-bold transition-colors duration-200",
                post.likedByMe
                    ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700"
                  : "bg-white text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
              )}
            >
              <Heart className={cn("h-4 w-4 transition-all duration-200", post.likedByMe && "scale-110 fill-current")} />
              Thích
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onToggleReplies}
              className={cn(
                  "rounded-lg px-4 font-bold transition-colors duration-200",
                repliesOpen ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800" : "bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              )}
            >
              <MessageCircle className={cn("h-4 w-4", repliesOpen && "fill-blue-100 text-blue-700")} />
              {repliesOpen ? "Thu gọn" : "Phản hồi"}
            </Button>
          </div>
        </div>
      </div>
      </div>

      {repliesOpen && (
        <div className="space-y-4 border-t border-slate-200 bg-[#f5f8fb] p-4 sm:p-5 lg:p-6">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-[#102d4d] px-4 py-3 text-white">
          <div>
              <div className="flex items-center gap-2 text-sm font-black"><MessageCircle className="h-4 w-4 text-cyan-300" /> Luồng phản hồi · {replyCount}</div>
              <div className="mt-0.5 text-xs text-slate-300">Trao đổi theo mạch nội dung, phản hồi trực tiếp ngay tại điểm liên quan.</div>
          </div>
            <Button variant="ghost" size="sm" className="text-xs text-slate-300 hover:bg-white/10 hover:text-white" onClick={onToggleReplies}>
              <ChevronUp className="h-3.5 w-3.5" /> Thu gọn
          </Button>
        </div>
        {repliesQuery.isLoading && (
          <div className="space-y-2">
            {[1, 2].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-xl border border-border bg-white/70" />
            ))}
          </div>
        )}
        {!repliesQuery.isLoading && replies.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-white px-3 py-4 text-sm text-muted-foreground">
            Chưa có phản hồi nào cho chủ đề này.
          </div>
        )}
        {!repliesQuery.isLoading && replyTree.roots.map((r) => renderReplyCard(r))}
        {canWrite && !isClosed && !isClosedBox && (
            <div className="grid gap-3 rounded-xl border border-cyan-200 bg-white p-3 shadow-[0_8px_24px_rgba(8,145,178,0.06)] sm:p-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-800">
                <Send className="h-3.5 w-3.5" /> Gửi tín hiệu phản hồi
              </div>
            {replyTarget && (
              <ReplyContextBox
                label={`Bạn đang trả lời ${replyTarget.author.name}`}
                content={replyTarget.content}
                onClear={onClearReplyTarget}
              />
            )}
            <RichTextEditor value={reply} onChange={setReply} compact placeholder="Viết phản hồi, kinh nghiệm xử lý hoặc góp ý kỹ thuật..." />
            <Input value={replyLinks} onChange={(e) => setReplyLinks(e.target.value)} placeholder="Link tài liệu kèm theo nếu có..." />
            <div className="flex justify-end">
                <Button size="sm" className="bg-[#0d5ea6] hover:bg-[#0a4d89]" onClick={onReply} disabled={replying || !richTextPlainText(reply)}>
                <Send className="h-4 w-4" /> Gửi phản hồi
              </Button>
            </div>
          </div>
        )}
      </div>
      )}
      {!repliesOpen && canWrite && !isClosed && !isClosedBox && (
        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5 lg:pl-[244px]">
          <Button variant="ghost" size="sm" className="rounded-lg font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-700" onClick={onOpenReplies}>
            <MessageCircle className="h-4 w-4" /> Viết phản hồi
          </Button>
        </div>
      )}
    </Card>
  );
}

function RichTextEditor({
  value,
  onChange,
  placeholder,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  compact?: boolean;
}) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const [focused, setFocused] = React.useState(false);
  const empty = richTextPlainText(value).length === 0;

  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    editor.innerHTML = editorHtmlFromValue(value);
  }, [value]);

  function sync() {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(sanitizeForumHtml(editor.innerHTML));
  }

  function apply(command: string, commandValue?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    sync();
  }

  function pastePlainText(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    sync();
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-slate-50 px-2 py-1.5">
        <RichTextButton label="In đậm" onClick={() => apply("bold")}><Bold className="h-4 w-4" /></RichTextButton>
        <RichTextButton label="In nghiêng" onClick={() => apply("italic")}><Italic className="h-4 w-4" /></RichTextButton>
        <RichTextButton label="Gạch chân" onClick={() => apply("underline")}><Underline className="h-4 w-4" /></RichTextButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <RichTextButton label="Danh sách chấm" onClick={() => apply("insertUnorderedList")}><List className="h-4 w-4" /></RichTextButton>
        <RichTextButton label="Danh sách số" onClick={() => apply("insertOrderedList")}><ListOrdered className="h-4 w-4" /></RichTextButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <RichTextButton label="Căn trái" onClick={() => apply("justifyLeft")}><AlignLeft className="h-4 w-4" /></RichTextButton>
        <RichTextButton label="Căn giữa" onClick={() => apply("justifyCenter")}><AlignCenter className="h-4 w-4" /></RichTextButton>
        <RichTextButton label="Căn phải" onClick={() => apply("justifyRight")}><AlignRight className="h-4 w-4" /></RichTextButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <div className="flex items-center gap-1 rounded-md bg-white px-1 py-0.5 ring-1 ring-border">
          {TEXT_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              title={`Màu chữ: ${color.label}`}
              className={cn("h-5 w-5 rounded-full ring-1 ring-black/10 transition hover:scale-110", color.className)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => apply("foreColor", color.value)}
            />
          ))}
        </div>
        <RichTextButton label="Xóa định dạng" onClick={() => apply("removeFormat")}>
          <span className="text-xs font-black">Tx</span>
        </RichTextButton>
      </div>
      <div className="relative">
        {empty && !focused && (
          <div className={cn("pointer-events-none absolute left-3 right-3 top-2.5 text-sm text-muted-foreground", compact ? "top-2" : "top-3")}>
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className={cn(
            "min-h-[148px] px-3 py-2.5 text-sm leading-6 text-ink outline-none",
            compact && "min-h-[92px] py-2",
            richTextClassName
          )}
          onBlur={() => {
            setFocused(false);
            sync();
          }}
          onFocus={() => setFocused(true)}
          onInput={sync}
          onPaste={pastePlainText}
        />
      </div>
    </div>
  );
}

function buildReplyTree(replies: ForumReply[]) {
  const ids = new Set(replies.map((reply) => reply.id));
  const childrenByParent = new Map<string, ForumReply[]>();
  const roots: ForumReply[] = [];

  replies.forEach((reply) => {
    const parentId = reply.parentReplyId ?? null;
    if (parentId && ids.has(parentId)) {
      const children = childrenByParent.get(parentId) ?? [];
      children.push(reply);
      childrenByParent.set(parentId, children);
      return;
    }
    roots.push(reply);
  });

  return { roots, childrenByParent };
}

function countNestedReplies(parentId: string, childrenByParent: Map<string, ForumReply[]>): number {
  const children = childrenByParent.get(parentId) ?? [];
  return children.reduce((total, child) => total + 1 + countNestedReplies(child.id, childrenByParent), 0);
}

function RichTextButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      className="inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-slate-700 transition hover:bg-white hover:text-accent hover:shadow-sm hover:ring-1 hover:ring-border"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function RichTextContent({ value, className }: { value: string; className?: string }) {
  if (!looksLikeHtml(value)) {
    return <p className={cn("whitespace-pre-wrap", className)}>{value}</p>;
  }
  return (
    <div
      className={cn(richTextClassName, className)}
      dangerouslySetInnerHTML={{ __html: sanitizeForumHtml(value) }}
      suppressHydrationWarning
    />
  );
}

function ReplyContextBox({
  label,
  content,
  className,
  onClear,
}: {
  label: string;
  content: string;
  className?: string;
  onClear?: () => void;
}) {
  return (
    <div className={cn("rounded-lg border border-blue-200 bg-blue-50/80 px-3 py-2 text-sm", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-blue-700">
            <Reply className="h-3.5 w-3.5" />
            {label}
          </div>
          <div className="mt-1 max-h-10 overflow-hidden text-xs leading-5 text-blue-950">
            {shortRichTextText(content)}
          </div>
        </div>
        {onClear && (
          <button
            type="button"
            title="Bỏ chọn phản hồi"
            className="rounded-full p-1 text-blue-700 transition hover:bg-white hover:text-blue-900"
            onClick={onClear}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function AttachmentList({ links, compact = false }: { links: string[]; compact?: boolean }) {
  return (
    <div className={cn("flex flex-wrap gap-2", compact ? "mt-2" : "mt-3")}>
      {links.map((link) => (
        <a
          key={link}
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
        >
          <Link2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{shortLink(link)}</span>
        </a>
      ))}
    </div>
  );
}

function AuthorBlock({ author, date, edited }: { author: ForumAuthor; date: string; edited?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-xl bg-muted/40 px-3 py-2">
      <Avatar author={author} />
      <div className="min-w-0 text-right">
        <div className="truncate text-sm font-bold text-ink">{author.name}</div>
        <div className="text-xs text-muted-foreground">{formatDateTime(date)}{edited ? " · đã sửa" : ""}</div>
      </div>
    </div>
  );
}

function AuthorInline({ author, date }: { author: ForumAuthor; date: string }) {
  return (
    <div className="flex items-center gap-2">
      <Avatar author={author} small />
      <div>
        <div className="text-sm font-bold text-ink">{author.name}</div>
        <div className="text-xs text-muted-foreground">{formatDateTime(date)}</div>
      </div>
    </div>
  );
}

function Avatar({ author, small = false }: { author: ForumAuthor; small?: boolean }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy font-bold text-white ring-1 ring-border", small ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-xs")}>
      {author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={author.avatarUrl} alt={author.name} className="h-full w-full object-cover" />
      ) : (
        initials(author.name)
      )}
    </span>
  );
}

function WorkspaceStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="min-w-0 px-4 py-3.5">
      <div className={cn("text-2xl font-black leading-none", accent)}>{String(value).padStart(2, "0")}</div>
      <div className="mt-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
    </div>
  );
}

function GuideRow({ index, title, description }: { index: string; title: string; description: string }) {
  return (
    <div className="grid grid-cols-[28px_1fr] gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-[9px] font-black text-amber-600">{index}</span>
      <div>
        <div className="text-xs font-black text-[#0b2340]">{title}</div>
        <div className="mt-0.5 text-[10px] leading-4 text-slate-500">{description}</div>
      </div>
    </div>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function splitLines(value: string) {
  return value.split(/[,\n]/).map((v) => v.trim()).filter(Boolean);
}

function shortLink(link: string) {
  try {
    const url = new URL(link);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return link;
  }
}

const richTextClassName =
  "[&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:ml-5 [&_ol]:list-decimal [&_li]:mb-1";

function looksLikeHtml(value: string) {
  return /<\/?(p|div|br|ul|ol|li|span|strong|b|em|i|u|font)\b/i.test(value);
}

function editorHtmlFromValue(value: string) {
  if (!value) return "";
  return looksLikeHtml(value) ? sanitizeForumHtml(value) : textToHtml(value);
}

function textToHtml(value: string) {
  return value
    .split(/\n/)
    .map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`)
    .join("");
}

function richTextPlainText(value: string) {
  if (!value) return "";
  if (typeof document !== "undefined" && looksLikeHtml(value)) {
    const el = document.createElement("div");
    el.innerHTML = sanitizeForumHtml(value);
    return (el.textContent ?? "").trim();
  }
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
}

function shortRichTextText(value: string, max = 160) {
  const text = richTextPlainText(value).replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function sanitizeForumHtml(value: string) {
  if (!value) return "";
  if (typeof document === "undefined") return looksLikeHtml(value) ? "" : escapeHtml(value);

  const template = document.createElement("template");
  template.innerHTML = value;

  function cleanNode(node: Node): Node {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? "");
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode("");

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();
    const outputTag = tagName === "font" ? "span" : tagName;
    const allowedTags = new Set(["p", "div", "br", "ul", "ol", "li", "span", "strong", "b", "em", "i", "u"]);

    if (!allowedTags.has(outputTag)) {
      const fragment = document.createDocumentFragment();
      element.childNodes.forEach((child) => fragment.appendChild(cleanNode(child)));
      return fragment;
    }

    const clean = document.createElement(outputTag);
    const styles: string[] = [];
    const color = tagName === "font" ? element.getAttribute("color") : element.style.color;
    const textAlign = element.style.textAlign;

    if (color && isSafeCssColor(color)) styles.push(`color: ${color}`);
    if (["left", "center", "right", "justify"].includes(textAlign)) styles.push(`text-align: ${textAlign}`);
    if (styles.length) clean.setAttribute("style", styles.join("; "));

    element.childNodes.forEach((child) => clean.appendChild(cleanNode(child)));
    return clean;
  }

  const fragment = document.createDocumentFragment();
  template.content.childNodes.forEach((child) => fragment.appendChild(cleanNode(child)));
  const container = document.createElement("div");
  container.appendChild(fragment);
  return container.innerHTML;
}

function isSafeCssColor(value: string) {
  return /^#[0-9a-f]{3,8}$/i.test(value) || /^rgb(a)?\([\d\s,.%]+\)$/i.test(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
