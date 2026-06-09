"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ShieldAlert, History, Pencil, Trash2, Search, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RoleBadge } from "@/components/devices/status-badge";
import { AvatarPicker } from "@/components/shared/avatar-picker";
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@/hooks/useUsers";
import { apiGet } from "@/lib/fetcher";
import { ROLES, type RoleKey } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
import { formatDateTime, initials } from "@/lib/utils";
import type { SafeUser } from "@/types";

const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const { data, isLoading } = useUsers();
  const create = useCreateUser();
  const update = useUpdateUser();
  const del = useDeleteUser();
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => apiGet<any[]>("/api/audit"), enabled: session?.user?.role === "ADMIN" });

  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [form, setForm] = React.useState({ name: "", email: "", employeeId: "", position: "", department: "", role: "VIEWER", password: "password123", avatarUrl: "" });
  const [editTarget, setEditTarget] = React.useState<SafeUser | null>(null);
  const [delTarget, setDelTarget] = React.useState<SafeUser | null>(null);

  if (session && session.user?.role !== "ADMIN") {
    return (
      <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="font-medium text-ink">Bạn không có quyền truy cập trang này</p>
        <p className="text-sm text-muted-foreground">Chỉ Quản trị viên mới quản lý người dùng.</p>
      </CardContent></Card>
    );
  }

  const users = data?.data ?? [];
  const nq = normalizeText(search.trim());
  const filteredUsers = nq
    ? users.filter((u) => normalizeText(`${u.name} ${u.employeeId}`).includes(nq))
    : users;
  const auditRows = (audit.data?.data ?? []).slice(0, 20);

  async function createUser() {
    if (!form.name || !form.email || !form.employeeId) return toast.error("Nhập đủ thông tin bắt buộc");
    try {
      await create.mutateAsync(form);
      toast.success("Đã tạo người dùng");
      setOpen(false);
      setForm({ name: "", email: "", employeeId: "", position: "", department: "", role: "VIEWER", password: "password123", avatarUrl: "" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function changeRole(id: string, role: string) {
    try { await update.mutateAsync({ id, role }); toast.success("Đã cập nhật vai trò"); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function toggleActive(id: string, isActive: boolean) {
    try { await update.mutateAsync({ id, isActive }); toast.success(isActive ? "Đã kích hoạt" : "Đã vô hiệu hoá"); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Quản lý người dùng" description="Tài khoản & phân quyền hệ thống">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên hoặc mã nhân viên..."
            className="h-9 w-56 pl-9 pr-8 sm:w-64"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-ink"
              aria-label="Xoá tìm kiếm"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Thêm người dùng</Button>
      </PageHeader>

      {isLoading ? <TableSkeleton /> : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="[&_th]:whitespace-nowrap">
                <TableHead className="text-center">Hình ảnh</TableHead>
                <TableHead className="min-w-[200px]">Nhân viên</TableHead><TableHead>Mã NV</TableHead><TableHead>Email</TableHead>
                <TableHead>Phân quyền</TableHead><TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Không tìm thấy người dùng khớp “{search.trim()}”.
                  </TableCell>
                </TableRow>
              )}
              {filteredUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="mx-auto flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-navy text-sm font-semibold text-white ring-1 ring-border">
                      {u.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.avatarUrl} alt={u.name} className="h-full w-full object-cover" />
                      ) : (
                        initials(u.name)
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="whitespace-nowrap font-medium text-ink">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.position}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{u.employeeId}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Select value={u.role} onValueChange={(v) => changeRole(u.id, v)}>
                      <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLE_KEYS.map((r) => <SelectItem key={r} value={r}>{ROLES[r].label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggleActive(u.id, !u.isActive)}
                      title={u.isActive ? "Đang hoạt động" : "Ngừng hoạt động"}
                      className={`relative h-7 w-12 rounded-full shadow-inner ring-1 transition-all duration-300 ${
                        u.isActive
                          ? "bg-gradient-to-b from-emerald-400 to-green-600 ring-green-700/30"
                          : "bg-gradient-to-b from-slate-200 to-slate-400 ring-slate-400/40"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/5 transition-all duration-300 ${
                          u.isActive ? "translate-x-[22px]" : "translate-x-0.5"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${u.isActive ? "bg-green-500" : "bg-slate-400"}`} />
                      </span>
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Chỉnh sửa" onClick={() => setEditTarget(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Xoá" onClick={() => setDelTarget(u)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Audit log — show the 20 most recent entries; ~10 visible, scroll for the rest */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Nhật ký hoạt động</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table wrapperClassName="max-h-[460px]">
            <TableHeader>
              <TableRow>
                {["Thời gian", "Người dùng", "Hành động", "Đối tượng", "Chi tiết"].map((h) => (
                  <TableHead key={h} className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditRows.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</TableCell>
                  <TableCell className="text-sm">{a.user?.name}</TableCell>
                  <TableCell><span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{a.action}</span></TableCell>
                  <TableCell className="text-sm">{a.entity}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.detail}</TableCell>
                </TableRow>
              ))}
              {auditRows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Chưa có nhật ký</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Thêm người dùng</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hình ảnh" className="col-span-2">
              <AvatarPicker value={form.avatarUrl} onChange={(v) => setForm({ ...form, avatarUrl: v })} name={form.name} />
            </Field>
            <Field label="Họ tên *" className="col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email *"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Mã NV *"><Input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} /></Field>
            <Field label="Chức vụ"><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></Field>
            <Field label="Bộ phận"><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></Field>
            <Field label="Vai trò">
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLE_KEYS.map((r) => <SelectItem key={r} value={r}>{ROLES[r].label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Mật khẩu"><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button onClick={createUser} disabled={create.isPending}>Tạo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit user */}
      <EditUserDialog target={editTarget} onClose={() => setEditTarget(null)} />

      {/* Delete user */}
      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="Xoá người dùng?"
        description={`Xoá tài khoản "${delTarget?.name}" (${delTarget?.employeeId})? Nếu người dùng có dữ liệu liên quan sẽ được chuyển sang trạng thái ngừng hoạt động.`}
        confirmLabel="Xoá"
        loading={del.isPending}
        onConfirm={async () => {
          if (!delTarget) return;
          try {
            await del.mutateAsync(delTarget.id);
            toast.success("Đã xoá người dùng");
            setDelTarget(null);
          } catch (e) {
            toast.error((e as Error).message);
            setDelTarget(null);
          }
        }}
      />
    </div>
  );
}

function EditUserDialog({ target, onClose }: { target: SafeUser | null; onClose: () => void }) {
  const update = useUpdateUser();
  const [form, setForm] = React.useState<any>(null);

  React.useEffect(() => {
    if (target)
      setForm({
        name: target.name,
        email: target.email,
        employeeId: target.employeeId,
        phone: target.phone ?? "",
        position: target.position ?? "",
        department: target.department ?? "",
        avatarUrl: target.avatarUrl ?? "",
        role: target.role,
      });
  }, [target]);

  async function save() {
    if (!target || !form) return;
    try {
      await update.mutateAsync({ id: target.id, ...form });
      toast.success("Đã cập nhật người dùng");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Chỉnh sửa: {target?.name}</DialogTitle></DialogHeader>
        {form && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hình ảnh" className="col-span-2">
              <AvatarPicker value={form.avatarUrl} onChange={(v) => setForm({ ...form, avatarUrl: v })} name={form.name} />
            </Field>
            <Field label="Họ tên" className="col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Mã NV"><Input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} /></Field>
            <Field label="SĐT"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Chức vụ"><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></Field>
            <Field label="Bộ phận"><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></Field>
            <Field label="Vai trò">
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLE_KEYS.map((r) => <SelectItem key={r} value={r}>{ROLES[r].label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Huỷ</Button>
          <Button onClick={save} disabled={update.isPending}>Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><Label className="mb-1.5 block">{label}</Label>{children}</div>;
}
