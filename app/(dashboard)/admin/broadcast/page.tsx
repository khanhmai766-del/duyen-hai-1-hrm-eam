"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Megaphone, Plus, Pencil, Trash2, Loader2, ShieldAlert, Check, Info } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useBroadcasts,
  useCreateBroadcast,
  useUpdateBroadcast,
  useDeleteBroadcast,
  type SystemBroadcast,
} from "@/hooks/useBroadcast";
import { formatDateTime, cn } from "@/lib/utils";

export default function BroadcastAdminPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const { data, isLoading } = useBroadcasts();
  const items = data?.data ?? [];
  const create = useCreateBroadcast();
  const update = useUpdateBroadcast();
  const del = useDeleteBroadcast();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SystemBroadcast | null>(null);
  const [form, setForm] = React.useState({ title: "", body: "" });
  const [deleting, setDeleting] = React.useState<SystemBroadcast | null>(null);
  const pending = create.isPending || update.isPending;

  if (session && !isAdmin) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <ShieldAlert className="h-10 w-10 text-destructive" />
          <p className="font-medium text-ink">Bạn không có quyền truy cập trang này</p>
          <p className="text-sm text-muted-foreground">Chỉ Quản trị viên mới gửi thông báo hệ thống.</p>
        </CardContent>
      </Card>
    );
  }

  function openCreate() {
    setEditing(null);
    setForm({ title: "", body: "" });
    setDialogOpen(true);
  }
  function openEdit(b: SystemBroadcast) {
    setEditing(b);
    setForm({ title: b.title, body: b.body });
    setDialogOpen(true);
  }

  async function submit() {
    if (!form.title.trim() || !form.body.trim()) return toast.error("Nhập tiêu đề và nội dung");
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, title: form.title, body: form.body });
        toast.success("Đã cập nhật thông báo");
      } else {
        await create.mutateAsync({ title: form.title, body: form.body });
        toast.success("Đã phát thông báo — hiển thị cho mọi người khi đăng nhập");
      }
      setDialogOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function toggleActive(b: SystemBroadcast) {
    try {
      await update.mutateAsync({ id: b.id, isActive: !b.isActive });
      toast.success(b.isActive ? "Đã ngừng hiển thị" : "Đã bật hiển thị");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="THÔNG BÁO HỆ THỐNG" description="Phát thông báo dạng hộp thoại giữa màn hình cho mọi người dùng">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Tạo thông báo
        </Button>
      </PageHeader>

      <div className="flex items-start gap-2.5 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-ink">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p>
          Thông báo ở trạng thái <span className="font-semibold text-emerald-600">Đang hiển thị</span> sẽ hiện chính giữa
          màn hình cho mọi người dùng mỗi khi đăng nhập, cho đến khi bạn <span className="font-semibold">ngừng hiển thị</span> hoặc
          xoá. Người dùng có thể đóng để dùng web, nhưng lần đăng nhập sau vẫn thấy lại.
        </p>
      </div>

      {isLoading ? (
        <TableSkeleton rows={3} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={Megaphone}
              title="Chưa có thông báo"
              description="Nhấn “Tạo thông báo” để gửi thông báo hệ thống đầu tiên."
              action={{ label: "Tạo thông báo", onClick: openCreate }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((b) => (
            <Card key={b.id} className={cn("transition-colors", b.isActive && "border-emerald-300 ring-1 ring-emerald-200")}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-ink">{b.title}</h3>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          b.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {b.isActive ? "Đang hiển thị" : "Đã tắt"}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{b.body}</p>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {b.createdByName ?? "Quản trị viên"} · {formatDateTime(b.updatedAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <button
                      onClick={() => toggleActive(b)}
                      title={b.isActive ? "Ngừng hiển thị" : "Bật hiển thị"}
                      className={cn(
                        "relative h-7 w-12 shrink-0 rounded-full shadow-inner ring-1 transition-all duration-300",
                        b.isActive
                          ? "bg-gradient-to-b from-emerald-400 to-green-600 ring-green-700/30"
                          : "bg-gradient-to-b from-slate-200 to-slate-400 ring-slate-400/40"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform duration-300",
                          b.isActive ? "translate-x-[20px]" : "translate-x-0"
                        )}
                      />
                    </button>
                    <Button variant="ghost" size="icon" title="Sửa" onClick={() => openEdit(b)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Xoá"
                      className="text-muted-foreground hover:bg-red-50 hover:text-destructive"
                      onClick={() => setDeleting(b)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Sửa thông báo" : "Tạo thông báo hệ thống"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block">Tiêu đề</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="VD: Bảo trì hệ thống tối nay" />
            </div>
            <div>
              <Label className="mb-1.5 block">Nội dung</Label>
              <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={6} placeholder="Nội dung thông báo gửi tới mọi người dùng..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Huỷ</Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {editing ? "Lưu" : "Phát thông báo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Xoá thông báo?"
        description={deleting ? `Xoá thông báo “${deleting.title}”? Hành động này không thể hoàn tác.` : undefined}
        confirmLabel="Xoá"
        loading={del.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await del.mutateAsync(deleting.id);
            toast.success("Đã xoá thông báo");
            setDeleting(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}
