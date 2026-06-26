"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Eye, FileSpreadsheet, History, ImageUp, Pencil, PenLine, Plus, Search, ShieldAlert, Trash2, UploadCloud, X, type LucideIcon } from "lucide-react";
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
import { SignaturePad } from "@/components/shared/signature-pad";
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, usePositions } from "@/hooks/useUsers";
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
  const [positionFilter, setPositionFilter] = React.useState("ALL");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [form, setForm] = React.useState({ name: "", email: "", username: "", employeeId: "", position: "", department: "", role: "VIEWER", password: "password123", avatarUrl: "", signatureUrl: "" });
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
  const positions = usePositions();
  const nq = normalizeText(search.trim());
  const filteredUsers = users.filter(
    (u) =>
      (!nq || normalizeText(`${u.name} ${u.employeeId} ${u.username ?? ""}`).includes(nq)) &&
      (positionFilter === "ALL" || u.position === positionFilter)
  );
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const firstShown = filteredUsers.length ? (page - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(page * pageSize, filteredUsers.length);
  const pagedUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);
  const auditRows = (audit.data?.data ?? []).slice(0, 20);

  React.useEffect(() => {
    setPage(1);
  }, [search, positionFilter, pageSize]);

  React.useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), totalPages));
  }, [totalPages]);

  async function createUser() {
    if (!form.name || !form.email || !form.employeeId) return toast.error("Nhập đủ thông tin bắt buộc");
    try {
      await create.mutateAsync(form);
      toast.success("Đã tạo người dùng");
      setOpen(false);
      setForm({ name: "", email: "", username: "", employeeId: "", position: "", department: "", role: "VIEWER", password: "password123", avatarUrl: "", signatureUrl: "" });
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
      <PageHeader title="QUẢN LÝ NGƯỜI DÙNG" description="Tài khoản & phân quyền hệ thống">
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
        <Select value={positionFilter} onValueChange={setPositionFilter}>
          <SelectTrigger className="h-9 w-52" aria-label="Lọc theo chức vụ"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả chức vụ</SelectItem>
            {positions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Thêm người dùng</Button>
      </PageHeader>

      <AdminUserUploadPanel />

      {isLoading ? <TableSkeleton /> : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="[&_th]:whitespace-nowrap">
                <TableHead className="text-center">Hình ảnh</TableHead>
                <TableHead className="min-w-[200px]">Nhân viên</TableHead><TableHead>Mã NV</TableHead><TableHead>User</TableHead><TableHead>Email</TableHead>
                <TableHead className="text-center">Chữ ký số</TableHead>
                <TableHead>Phân quyền</TableHead><TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    Không tìm thấy người dùng phù hợp với điều kiện lọc.
                  </TableCell>
                </TableRow>
              )}
              {pagedUsers.map((u) => (
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
                  <TableCell className="font-mono text-xs text-muted-foreground">{u.username ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-center">
                    {u.signatureUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.signatureUrl}
                        alt={`Chữ ký ${u.name}`}
                        className="mx-auto h-10 max-w-[120px] rounded bg-white object-contain px-1 ring-1 ring-border"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
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
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div>
              Hiển thị {firstShown}-{lastShown} trong tổng số {filteredUsers.length} bản ghi
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="h-8 rounded-md border border-input bg-white px-2 text-sm font-medium text-ink shadow-none"
                aria-label="Số dòng hiển thị"
              >
                {[10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span>dòng</span>
              <PageButton icon={ChevronsLeft} label="Trang đầu" disabled={page <= 1} onClick={() => setPage(1)} />
              <PageButton icon={ChevronLeft} label="Trang trước" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} />
              <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-ink">
                {page}/{totalPages}
              </span>
              <PageButton icon={ChevronRight} label="Trang sau" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} />
              <PageButton icon={ChevronsRight} label="Trang cuối" disabled={page >= totalPages} onClick={() => setPage(totalPages)} />
            </div>
          </div>
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
            <Field label="Chữ ký số" className="col-span-2">
              <SignaturePad value={form.signatureUrl} onChange={(v) => setForm({ ...form, signatureUrl: v })} />
            </Field>
            <Field label="Họ tên *" className="col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email *"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="User"><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
            <Field label="Mã NV *"><Input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} /></Field>
            <Field label="Chức vụ"><PositionSelect value={form.position} onChange={(v) => setForm({ ...form, position: v })} /></Field>
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

function PageButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-8 w-8 rounded-lg disabled:cursor-not-allowed disabled:opacity-45"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

type ImportReport = {
  preview: boolean;
  mode: string;
  import_key: string | null;
  total_rows: number;
  success_rows: number;
  error_rows: number;
  created: number;
  updated: number;
  rows: Array<{
    row: number;
    employee_code: string | null;
    email: string | null;
    action: string;
    status: string;
    errors: string[];
  }>;
};

type ZipReport = {
  total_files: number;
  success_files: number;
  error_files: number;
  errors: Array<{ file: string; reason: string }>;
};

async function postForm<T>(url: string, formData: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", body: formData });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || "Thao tác thất bại");
  return json.data as T;
}

function AdminUserUploadPanel() {
  const enabled = process.env.NEXT_PUBLIC_USER_IMPORT_ENABLED === "true";
  const qc = useQueryClient();
  const [mode, setMode] = React.useState("upsert");
  const [employeeCode, setEmployeeCode] = React.useState("");
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [signatureFile, setSignatureFile] = React.useState<File | null>(null);
  const [avatarZip, setAvatarZip] = React.useState<File | null>(null);
  const [signatureZip, setSignatureZip] = React.useState<File | null>(null);
  const [importReport, setImportReport] = React.useState<ImportReport | null>(null);
  const [zipReport, setZipReport] = React.useState<ZipReport | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function refreshAfterMutation() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["users"] }),
      qc.invalidateQueries({ queryKey: ["audit"] }),
      qc.invalidateQueries({ queryKey: ["me-dashboard"] }),
    ]);
  }

  async function submitImport(preview: boolean) {
    if (!importFile) return toast.error("Chọn file Excel hoặc CSV trước khi import");
    const fd = new FormData();
    fd.append("file", importFile);
    fd.append("mode", mode);
    fd.append("preview", String(preview));
    setBusy(preview ? "preview" : "import");
    try {
      const report = await postForm<ImportReport>("/admin/import-users", fd);
      setImportReport(report);
      toast.success(preview ? "Đã đọc thử file import" : "Đã import người dùng");
      if (!preview) await refreshAfterMutation();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function submitSingle(kind: "avatar" | "signature") {
    const file = kind === "avatar" ? avatarFile : signatureFile;
    if (!employeeCode.trim()) return toast.error("Nhập mã nhân viên để map file");
    if (!file) return toast.error(kind === "avatar" ? "Chọn ảnh đại diện" : "Chọn file chữ ký");
    const fd = new FormData();
    fd.append("employee_code", employeeCode.trim());
    fd.append("file", file);
    setBusy(kind);
    try {
      await postForm(kind === "avatar" ? "/admin/upload-avatar" : "/admin/upload-signature", fd);
      toast.success(kind === "avatar" ? "Đã upload ảnh đại diện" : "Đã upload chữ ký");
      await refreshAfterMutation();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function submitZip(kind: "avatar" | "signature") {
    const file = kind === "avatar" ? avatarZip : signatureZip;
    if (!file) return toast.error(kind === "avatar" ? "Chọn avatar.zip" : "Chọn signature.zip");
    const fd = new FormData();
    fd.append("file", file);
    setBusy(`${kind}-zip`);
    try {
      const report = await postForm<ZipReport>(kind === "avatar" ? "/admin/upload-avatars-zip" : "/admin/upload-signatures-zip", fd);
      setZipReport(report);
      toast.success(`Đã xử lý ${report.success_files}/${report.total_files} file`);
      await refreshAfterMutation();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="overflow-hidden border-sky-200/70">
      <CardHeader className="border-b bg-[linear-gradient(135deg,#f8fbff_0%,#eef8f5_100%)]">
        <CardTitle className="flex items-center gap-2 text-base">
          <UploadCloud className="h-4 w-4 text-navy" />
          Nhập liệu & lưu trữ S3
        </CardTitle>
      </CardHeader>
      {!enabled ? (
        <CardContent className="p-4">
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-muted-foreground">
            Chức năng import/upload người dùng đang tắt trên môi trường này.
          </div>
        </CardContent>
      ) : (
      <CardContent className="grid gap-4 p-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-3 rounded-lg border border-border bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink">Import người dùng từ Excel/CSV</p>
              <p className="text-xs text-muted-foreground">Preview trước khi ghi database, file gốc lưu vào S3 khi import thật.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => window.open("/admin/import-users?format=xlsx", "_blank")}>
              <Download className="h-4 w-4" /> Tải mẫu
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_180px]">
            <Input type="file" accept=".xlsx,.csv" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="create">Chỉ thêm mới</SelectItem>
                <SelectItem value="update">Chỉ cập nhật</SelectItem>
                <SelectItem value="upsert">Thêm mới/cập nhật</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => submitImport(true)} disabled={!!busy}>
              <Eye className="h-4 w-4" /> Xem trước
            </Button>
            <Button type="button" onClick={() => submitImport(false)} disabled={!!busy}>
              <FileSpreadsheet className="h-4 w-4" /> Import
            </Button>
          </div>
          {importReport && <ImportReportView report={importReport} />}
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-white p-3">
          <div>
            <p className="text-sm font-semibold text-ink">Upload ảnh/chữ ký theo mã nhân viên</p>
            <p className="text-xs text-muted-foreground">File thật lên S3, database chỉ lưu key.</p>
          </div>
          <Input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="Mã nhân viên, ví dụ NV001" />
          <MediaUploadRow icon={ImageUp} label="Ảnh đại diện" accept=".jpg,.jpeg,.png,.webp" onFile={setAvatarFile} onSubmit={() => submitSingle("avatar")} busy={busy === "avatar"} />
          <MediaUploadRow icon={PenLine} label="Chữ ký" accept=".png,.jpg,.jpeg,.pdf" onFile={setSignatureFile} onSubmit={() => submitSingle("signature")} busy={busy === "signature"} />
          <div className="grid gap-2 border-t pt-3 md:grid-cols-2">
            <ZipUploadBox label="avatar.zip" onFile={setAvatarZip} onSubmit={() => submitZip("avatar")} busy={busy === "avatar-zip"} />
            <ZipUploadBox label="signature.zip" onFile={setSignatureZip} onSubmit={() => submitZip("signature")} busy={busy === "signature-zip"} />
          </div>
          {zipReport && <ZipReportView report={zipReport} />}
        </div>
      </CardContent>
      )}
    </Card>
  );
}

function MediaUploadRow({ icon: Icon, label, accept, onFile, onSubmit, busy }: { icon: LucideIcon; label: string; accept: string; onFile: (file: File | null) => void; onSubmit: () => void; busy: boolean }) {
  return (
    <div className="grid gap-2 rounded-md bg-muted/40 p-2 md:grid-cols-[auto_1fr_auto] md:items-center">
      <div className="flex items-center gap-2 text-sm font-medium text-ink"><Icon className="h-4 w-4 text-navy" /> {label}</div>
      <Input type="file" accept={accept} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <Button type="button" size="sm" onClick={onSubmit} disabled={busy}>
        <UploadCloud className="h-4 w-4" /> Upload
      </Button>
    </div>
  );
}

function ZipUploadBox({ label, onFile, onSubmit, busy }: { label: string; onFile: (file: File | null) => void; onSubmit: () => void; busy: boolean }) {
  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-2">
      <div className="flex items-center gap-2 text-sm font-medium text-ink"><Archive className="h-4 w-4 text-navy" /> {label}</div>
      <Input type="file" accept=".zip" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <Button type="button" variant="outline" size="sm" onClick={onSubmit} disabled={busy} className="w-full">
        <UploadCloud className="h-4 w-4" /> Upload ZIP
      </Button>
    </div>
  );
}

function ImportReportView({ report }: { report: ImportReport }) {
  const errorRows = report.rows.filter((row) => row.status === "error").slice(0, 8);
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-4">
        <Metric label="Tổng dòng" value={report.total_rows} />
        <Metric label="Thành công" value={report.success_rows} />
        <Metric label="Tạo mới" value={report.created} />
        <Metric label="Lỗi" value={report.error_rows} tone={report.error_rows ? "danger" : "normal"} />
      </div>
      {errorRows.length > 0 && (
        <div className="mt-3 max-h-44 overflow-auto rounded border bg-white">
          {errorRows.map((row) => (
            <div key={row.row} className="border-b px-3 py-2 last:border-b-0">
              <span className="font-mono text-xs">Dòng {row.row}</span>
              <span className="ml-2 text-xs text-muted-foreground">{row.employee_code ?? "Chưa có mã"}</span>
              <p className="mt-1 text-xs text-destructive">{row.errors.join("; ")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ZipReportView({ report }: { report: ZipReport }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-3">
        <Metric label="Tổng file" value={report.total_files} />
        <Metric label="Thành công" value={report.success_files} />
        <Metric label="Lỗi" value={report.error_files} tone={report.error_files ? "danger" : "normal"} />
      </div>
      {report.errors.length > 0 && (
        <div className="mt-3 max-h-36 overflow-auto rounded border bg-white">
          {report.errors.slice(0, 8).map((item) => (
            <div key={item.file} className="border-b px-3 py-2 text-xs last:border-b-0">
              <span className="font-mono">{item.file}</span>
              <span className="ml-2 text-destructive">{item.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "normal" }: { label: string; value: number; tone?: "normal" | "danger" }) {
  return (
    <div className="rounded-md bg-white px-3 py-2 ring-1 ring-border">
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className={tone === "danger" ? "text-lg font-bold text-destructive" : "text-lg font-bold text-ink"}>{value}</div>
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
        username: target.username ?? "",
        employeeId: target.employeeId,
        phone: target.phone ?? "",
        position: target.position ?? "",
        department: target.department ?? "",
        avatarUrl: target.avatarUrl ?? "",
        signatureUrl: target.signatureUrl ?? "",
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
            <Field label="Chữ ký số" className="col-span-2">
              <SignaturePad value={form.signatureUrl} onChange={(v) => setForm({ ...form, signatureUrl: v })} />
            </Field>
            <Field label="Họ tên" className="col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="User"><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
            <Field label="Mã NV"><Input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} /></Field>
            <Field label="SĐT"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Chức vụ"><PositionSelect value={form.position} onChange={(v) => setForm({ ...form, position: v })} /></Field>
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

const NO_POSITION = "__none__";

/** Dropdown chọn Chức vụ — lấy từ data chức vụ hiện có (bỏ trùng). */
function PositionSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const positions = usePositions();
  // Đảm bảo giá trị hiện tại (vd khi sửa) luôn có trong danh sách.
  const options = value && !positions.includes(value) ? [value, ...positions] : positions;
  return (
    <Select value={value || NO_POSITION} onValueChange={(v) => onChange(v === NO_POSITION ? "" : v)}>
      <SelectTrigger><SelectValue placeholder="Chọn chức vụ" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_POSITION}>— Không chọn —</SelectItem>
        {options.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
