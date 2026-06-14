"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  BookOpenText,
  FileText,
  Link2,
  MessageSquareText,
  Plus,
  Search,
  Send,
  Trash2,
  Workflow,
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
  type ForumAuthor,
  type ForumPost,
  type ForumReply,
} from "@/hooks/useForum";
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
  const isAdmin = session?.user?.role === "ADMIN";
  const [category, setCategory] = React.useState("ALL");
  const [q, setQ] = React.useState("");
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [form, setForm] = React.useState(DEFAULT_FORM);
  const [replyDrafts, setReplyDrafts] = React.useState<Record<string, string>>({});
  const [replyLinks, setReplyLinks] = React.useState<Record<string, string>>({});
  const [deletePostTarget, setDeletePostTarget] = React.useState<ForumPost | null>(null);
  const [deleteReplyTarget, setDeleteReplyTarget] = React.useState<ForumReply | null>(null);

  const posts = useForumPosts({ category, q });
  const createPost = useCreateForumPost();
  const createReply = useCreateForumReply();
  const deletePost = useDeleteForumPost();
  const deleteReply = useDeleteForumReply();
  const rows = posts.data?.data ?? [];

  async function submitPost() {
    try {
      await createPost.mutateAsync({
        title: form.title,
        content: form.content,
        category: form.category,
        tags: splitLines(form.tags),
        attachments: splitLines(form.attachments),
      });
      setForm(DEFAULT_FORM);
      setComposeOpen(false);
      toast.success("Đã đăng chủ đề Forum");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function submitReply(postId: string) {
    try {
      await createReply.mutateAsync({
        postId,
        content: replyDrafts[postId] ?? "",
        attachments: splitLines(replyLinks[postId] ?? ""),
      });
      setReplyDrafts((s) => ({ ...s, [postId]: "" }));
      setReplyLinks((s) => ({ ...s, [postId]: "" }));
      toast.success("Đã gửi phản hồi");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="FORUM KỸ THUẬT" description="Trao đổi kinh nghiệm, chia sẻ tài liệu, quy trình, sơ đồ và bản vẽ vận hành">
        <Button onClick={() => setComposeOpen((v) => !v)}>
          <Plus className="h-4 w-4" /> Chủ đề mới
        </Button>
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
            <Metric label="Phản hồi" value={rows.reduce((sum, p) => sum + p.replies.length, 0)} />
          </div>
        </Card>
      </div>

      {composeOpen && (
        <Card className="p-4">
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
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Tiêu đề</label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="VD: Chia sẻ quy trình xử lý rung quạt khói IDF..." />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nội dung trao đổi</label>
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
            <Button variant="outline" onClick={() => setComposeOpen(false)}>Hủy</Button>
            <Button onClick={submitPost} disabled={createPost.isPending}>
              <Send className="h-4 w-4" /> Đăng chủ đề
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
          action={{ label: "Tạo chủ đề", onClick: () => setComposeOpen(true) }}
        />
      ) : (
        <div className="space-y-4">
          {rows.map((post) => (
            <ForumPostCard
              key={post.id}
              post={post}
              reply={replyDrafts[post.id] ?? ""}
              replyLinks={replyLinks[post.id] ?? ""}
              setReply={(v) => setReplyDrafts((s) => ({ ...s, [post.id]: v }))}
              setReplyLinks={(v) => setReplyLinks((s) => ({ ...s, [post.id]: v }))}
              onReply={() => submitReply(post.id)}
              replying={createReply.isPending}
              isAdmin={isAdmin}
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
  setReply,
  setReplyLinks,
  onReply,
  replying,
  isAdmin,
  onDeletePost,
  onDeleteReply,
}: {
  post: ForumPost;
  reply: string;
  replyLinks: string;
  setReply: (v: string) => void;
  setReplyLinks: (v: string) => void;
  onReply: () => void;
  replying: boolean;
  isAdmin: boolean;
  onDeletePost: () => void;
  onDeleteReply: (reply: ForumReply) => void;
}) {
  const category = CATEGORIES.find((c) => c.value === post.category) ?? CATEGORIES[1];
  const Icon = category.icon;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", category.tone)}>
                <Icon className="h-3.5 w-3.5" /> {category.label}
              </span>
              {post.tags.map((tag) => <Badge key={tag} variant="outline">#{tag}</Badge>)}
            </div>
            <h2 className="text-lg font-black text-ink">{post.title}</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{post.content}</p>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <AuthorBlock author={post.author} date={post.createdAt} />
            {isAdmin && (
              <Button variant="ghost" size="icon" title="Gỡ chủ đề" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={onDeletePost}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {post.attachments.length > 0 && <AttachmentList links={post.attachments} />}
      </div>

      <div className="space-y-3 bg-muted/20 p-4">
        <div className="text-sm font-bold text-ink">Phản hồi ({post.replies.length})</div>
        {post.replies.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <AuthorInline author={r.author} date={r.createdAt} />
              {isAdmin && (
                <Button variant="ghost" size="icon" title="Gỡ phản hồi" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={() => onDeleteReply(r)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{r.content}</p>
            {r.attachments.length > 0 && <AttachmentList links={r.attachments} compact />}
          </div>
        ))}
        <div className="grid gap-2 rounded-xl border border-dashed border-border bg-white p-3">
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Viết phản hồi, kinh nghiệm xử lý hoặc góp ý kỹ thuật..." />
          <Input value={replyLinks} onChange={(e) => setReplyLinks(e.target.value)} placeholder="Link tài liệu kèm theo nếu có..." />
          <div className="flex justify-end">
            <Button size="sm" onClick={onReply} disabled={replying}>
              <Send className="h-4 w-4" /> Gửi phản hồi
            </Button>
          </div>
        </div>
      </div>
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

function AuthorBlock({ author, date }: { author: ForumAuthor; date: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-xl bg-muted/40 px-3 py-2">
      <Avatar author={author} />
      <div className="min-w-0 text-right">
        <div className="truncate text-sm font-bold text-ink">{author.name}</div>
        <div className="text-xs text-muted-foreground">{formatDateTime(date)}</div>
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
