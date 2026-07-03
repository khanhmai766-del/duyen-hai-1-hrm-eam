"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  BookOpenText,
  FileText,
  Heart,
  MessageCircle,
  Link2,
  MessageSquareText,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  useCreateForumPost,
  useCreateForumReply,
  useDeleteForumPost,
  useDeleteForumReply,
  useForumPosts,
  useForumReplies,
  useToggleForumLike,
  useUpdateForumPost,
  useUpdateForumReply,
  type ForumAuthor,
  type ForumPost,
  type ForumReply,
} from "@/hooks/useForum";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { cn, formatDateTime, initials } from "@/lib/utils";

const CATEGORIES = [
  { value: "ALL", label: "Tất cả", icon: MessageSquareText, tone: "bg-slate-100 text-slate-700" },
  { value: "DISCUSSION", label: "Trao đổi kỹ thuật", icon: MessageSquareText, tone: "bg-blue-50 text-blue-700" },
  { value: "DOCUMENT", label: "Tài liệu", icon: FileText, tone: "bg-emerald-50 text-emerald-700" },
  { value: "PROCEDURE", label: "Quy trình", icon: BookOpenText, tone: "bg-amber-50 text-amber-700" },
  { value: "DRAWING", label: "Sơ đồ / bản vẽ", icon: Workflow, tone: "bg-violet-50 text-violet-700" },
] as const;

const DEFAULT_FORM = {
  title: "",
  content: "",
  category: "DISCUSSION",
  tags: "",
  attachments: "",
};

export default function ForumPage() {
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
  const [expandedReplies, setExpandedReplies] = React.useState<Record<string, boolean>>({});
  const [deletePostTarget, setDeletePostTarget] = React.useState<ForumPost | null>(null);
  const [deleteReplyTarget, setDeleteReplyTarget] = React.useState<ForumReply | null>(null);

  const posts = useForumPosts({ category, q });
  const createPost = useCreateForumPost();
  const updatePost = useUpdateForumPost();
  const createReply = useCreateForumReply();
  const deletePost = useDeleteForumPost();
  const deleteReply = useDeleteForumReply();
  const rows = posts.data?.data ?? [];

  const postValid = form.title.trim().length > 0 && form.content.trim().length > 0;
  const savingPost = createPost.isPending || updatePost.isPending;

  function openCreate() {
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
    });
    setComposeOpen(true);
  }

  async function submitPost() {
    if (!postValid) return;
    try {
      const payload = {
        title: form.title,
        content: form.content,
        category: form.category,
        tags: splitLines(form.tags),
        attachments: splitLines(form.attachments),
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

  async function submitReply(postId: string) {
    if (!(replyDrafts[postId] ?? "").trim()) return;
    try {
      await createReply.mutateAsync({
        postId,
        content: replyDrafts[postId] ?? "",
        attachments: splitLines(replyLinks[postId] ?? ""),
      });
      setReplyDrafts((s) => ({ ...s, [postId]: "" }));
      setReplyLinks((s) => ({ ...s, [postId]: "" }));
      setExpandedReplies((s) => ({ ...s, [postId]: true }));
      toast.success("Đã gửi phản hồi");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function canManage(authorId: string) {
    return canModerateForum || (!!currentUserId && authorId === currentUserId);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="FORUM KỸ THUẬT" description="Trao đổi kinh nghiệm, chia sẻ tài liệu, quy trình, sơ đồ và bản vẽ vận hành">
        {canWriteForum && (
          <Button onClick={() => (composeOpen ? setComposeOpen(false) : openCreate())}>
            <Plus className="h-4 w-4" /> Chủ đề mới
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid gap-3 sm:grid-cols-[220px_1fr] xl:min-w-[660px]">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Loại nội dung</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Tìm kiếm</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm chủ đề, nội dung, tag..." className="pl-9" />
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-bold text-ink">Không gian chia sẻ</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <Metric label="Chủ đề" value={rows.length} />
            <Metric label="Phản hồi" value={rows.reduce((sum, p) => sum + (p.replyCount ?? 0), 0)} />
          </div>
        </Card>
      </div>

      {composeOpen && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-bold text-ink">{editingPost ? "Sửa chủ đề" : "Tạo chủ đề mới"}</div>
            <Button variant="ghost" size="icon" onClick={() => { setComposeOpen(false); setEditingPost(null); }}><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
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
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="VD: Chia sẻ quy trình xử lý rung quạt khói IDF..." />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nội dung trao đổi *</label>
              <Textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} rows={4} placeholder="Nhập mô tả, kinh nghiệm xử lý, câu hỏi kỹ thuật..." />
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
          <div className="mt-4 flex justify-end gap-2">
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
          title="Chưa có chủ đề Forum"
          description="Tạo chủ đề đầu tiên để chia sẻ tài liệu, quy trình hoặc câu hỏi kỹ thuật với ca/kíp."
          action={canWriteForum ? { label: "Tạo chủ đề", onClick: openCreate } : undefined}
        />
      ) : (
        <div className="space-y-4">
          {rows.map((post) => (
            <ForumPostCard
              key={post.id}
              post={post}
              reply={replyDrafts[post.id] ?? ""}
              replyLinks={replyLinks[post.id] ?? ""}
              repliesOpen={expandedReplies[post.id] ?? false}
              setReply={(v) => setReplyDrafts((s) => ({ ...s, [post.id]: v }))}
              setReplyLinks={(v) => setReplyLinks((s) => ({ ...s, [post.id]: v }))}
              onToggleReplies={() => setExpandedReplies((s) => ({ ...s, [post.id]: !(s[post.id] ?? false) }))}
              onOpenReplies={() => setExpandedReplies((s) => ({ ...s, [post.id]: true }))}
              onReply={() => submitReply(post.id)}
              replying={createReply.isPending}
              canWrite={canWriteForum}
              isAdmin={canModerateForum}
              canManagePost={canManage(post.author.id)}
              canManageReply={(authorId) => canManage(authorId)}
              onEditPost={() => openEditPost(post)}
              onTogglePin={() => togglePin(post)}
              pinning={updatePost.isPending}
              onDeletePost={() => setDeletePostTarget(post)}
              onDeleteReply={(reply) => setDeleteReplyTarget(reply)}
            />
          ))}
        </div>
      )}

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
  repliesOpen,
  setReply,
  setReplyLinks,
  onToggleReplies,
  onOpenReplies,
  onReply,
  replying,
  canWrite,
  isAdmin,
  canManagePost,
  canManageReply,
  onEditPost,
  onTogglePin,
  pinning,
  onDeletePost,
  onDeleteReply,
}: {
  post: ForumPost;
  reply: string;
  replyLinks: string;
  repliesOpen: boolean;
  setReply: (v: string) => void;
  setReplyLinks: (v: string) => void;
  onToggleReplies: () => void;
  onOpenReplies: () => void;
  onReply: () => void;
  replying: boolean;
  canWrite: boolean;
  isAdmin: boolean;
  canManagePost: boolean;
  canManageReply: (authorId: string) => boolean;
  onEditPost: () => void;
  onTogglePin: () => void;
  pinning: boolean;
  onDeletePost: () => void;
  onDeleteReply: (reply: ForumReply) => void;
}) {
  const category = CATEGORIES.find((c) => c.value === post.category) ?? CATEGORIES[1];
  const Icon = category.icon;
  const updateReply = useUpdateForumReply();
  const toggleLike = useToggleForumLike();
  const repliesQuery = useForumReplies(post.id, repliesOpen);
  const [editingReplyId, setEditingReplyId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState("");
  const [editLinks, setEditLinks] = React.useState("");
  const replies = repliesQuery.data?.data ?? [];
  const likeCount = post.likeCount ?? 0;
  const replyCount = post.replyCount ?? 0;

  function startEditReply(r: ForumReply) {
    setEditingReplyId(r.id);
    setEditDraft(r.content);
    setEditLinks(r.attachments.join("\n"));
  }
  async function saveEditReply(id: string) {
    if (!editDraft.trim()) return;
    try {
      await updateReply.mutateAsync({ id, content: editDraft, attachments: splitLines(editLinks) });
      setEditingReplyId(null);
      toast.success("Đã cập nhật phản hồi");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card className={cn("overflow-hidden", post.isPinned && "ring-1 ring-amber-300")}>
      <div className="border-b border-border bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {post.isPinned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                  <Pin className="h-3.5 w-3.5" /> Đã ghim
                </span>
              )}
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", category.tone)}>
                <Icon className="h-3.5 w-3.5" /> {category.label}
              </span>
              {post.tags.map((tag) => <Badge key={tag} variant="outline">#{tag}</Badge>)}
            </div>
            <h2 className="text-lg font-black text-ink">{post.title}</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{post.content}</p>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <AuthorBlock author={post.author} date={post.createdAt} edited={post.updatedAt !== post.createdAt} />
            <div className="flex items-center">
              {isAdmin && (
                <Button variant="ghost" size="icon" title={post.isPinned ? "Bỏ ghim" : "Ghim chủ đề"} className="text-muted-foreground hover:text-amber-600" onClick={onTogglePin} disabled={pinning}>
                  {post.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </Button>
              )}
              {canManagePost && (
                <Button variant="ghost" size="icon" title="Sửa chủ đề" className="text-muted-foreground hover:text-accent" onClick={onEditPost}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {canManagePost && (
                <Button variant="ghost" size="icon" title="Gỡ chủ đề" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={onDeletePost}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
        {post.attachments.length > 0 && <AttachmentList links={post.attachments} />}
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white">
                <Heart className="h-3 w-3 fill-current" />
              </span>
              {likeCount} lượt thích
            </div>
            <button
              type="button"
              onClick={onToggleReplies}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:text-blue-700 hover:ring-blue-200"
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
                "rounded-full px-4 font-bold transition-all duration-200",
                post.likedByMe
                  ? "border-rose-200 bg-rose-50 text-rose-600 shadow-sm shadow-rose-200/60 hover:bg-rose-100 hover:text-rose-700"
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
                "rounded-full px-4 font-bold transition-all duration-200",
                repliesOpen ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800" : "bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              )}
            >
              <MessageCircle className={cn("h-4 w-4", repliesOpen && "fill-blue-100 text-blue-700")} />
              {repliesOpen ? "Thu gọn" : "Phản hồi"}
            </Button>
          </div>
        </div>
      </div>

      {repliesOpen && (
      <div className="space-y-3 bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-bold text-ink">Phản hồi ({replyCount})</div>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-ink" onClick={onToggleReplies}>
            Thu gọn
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
        {!repliesQuery.isLoading && replies.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <AuthorInline author={r.author} date={r.createdAt} />
              {canManageReply(r.author.id) && editingReplyId !== r.id && (
                <div className="flex items-center">
                  <Button variant="ghost" size="icon" title="Sửa phản hồi" className="text-muted-foreground hover:text-accent" onClick={() => startEditReply(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title="Gỡ phản hồi" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={() => onDeleteReply(r)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            {editingReplyId === r.id ? (
              <div className="mt-2 grid gap-2">
                <Textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={2} />
                <Input value={editLinks} onChange={(e) => setEditLinks(e.target.value)} placeholder="Link tài liệu kèm theo nếu có..." />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingReplyId(null)}>Hủy</Button>
                  <Button size="sm" onClick={() => saveEditReply(r.id)} disabled={updateReply.isPending || !editDraft.trim()}>Lưu</Button>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{r.content}</p>
                {r.attachments.length > 0 && <AttachmentList links={r.attachments} compact />}
              </>
            )}
          </div>
        ))}
        {canWrite && (
          <div className="grid gap-2 rounded-xl border border-dashed border-border bg-white p-3">
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Viết phản hồi, kinh nghiệm xử lý hoặc góp ý kỹ thuật..." />
            <Input value={replyLinks} onChange={(e) => setReplyLinks(e.target.value)} placeholder="Link tài liệu kèm theo nếu có..." />
            <div className="flex justify-end">
              <Button size="sm" onClick={onReply} disabled={replying || !reply.trim()}>
                <Send className="h-4 w-4" /> Gửi phản hồi
              </Button>
            </div>
          </div>
        )}
      </div>
      )}
      {!repliesOpen && canWrite && (
        <div className="border-t border-border bg-muted/20 px-4 py-3">
          <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground hover:bg-white hover:text-blue-700" onClick={onOpenReplies}>
            <MessageCircle className="h-4 w-4" /> Viết phản hồi
          </Button>
        </div>
      )}
    </Card>
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
      <div className="text-lg font-black text-ink">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
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
