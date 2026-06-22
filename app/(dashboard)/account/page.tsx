"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Loader2, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RoleBadge } from "@/components/devices/status-badge";
import { AvatarPicker } from "@/components/shared/avatar-picker";
import { SignaturePad } from "@/components/shared/signature-pad";
import { useUpdateProfile, useUsers } from "@/hooks/useUsers";
import { apiGet } from "@/lib/fetcher";
import { cn, initials } from "@/lib/utils";
import { ROLES, type RoleKey } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
import type { SafeUser } from "@/types";

const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

// Chức vụ loại khỏi dropdown (so khớp không dấu/hoa-thường).
const EXCLUDED_POSITIONS = new Set(["quan doc", "pho quan doc", "ky thuat vien"]);

export default function AccountPage() {
  const { data: session } = useSession();
  const u = session?.user;
  const isAdmin = u?.role === "ADMIN";

  const { data } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<SafeUser[]>("/api/users"),
    enabled: !!u,
  });
  const profile = data?.data?.find((x) => x.id === u?.id);

  const [open, setOpen] = React.useState(false);

  return (
    <div className="space-y-6">
      <PageHeader title="Tài khoản" description="Thông tin cá nhân của bạn" />

      {/* Profile card: large photo (left) + name & details (right) */}
      <Card className="overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* Photo */}
          <div className="relative shrink-0 bg-gradient-to-br from-navy/10 to-accent/10 md:w-72">
            {profile?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt={u?.name ?? ""}
                className="h-64 w-full object-cover md:h-full md:min-h-[300px]"
              />
            ) : (
              <div className="flex h-64 w-full items-center justify-center text-5xl font-bold text-navy md:h-full md:min-h-[300px]">
                {u?.name ? initials(u.name) : "?"}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-ink">{u?.name ?? "—"}</h2>
                <p className="mt-0.5 text-muted-foreground">{profile?.position ?? "—"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {u?.role && <RoleBadge role={u.role} />}
                  <span
                    className="inline-flex h-6 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 text-[11px] font-bold text-amber-700 shadow-sm"
                    title="Mật khẩu được lưu bằng mã hóa một chiều, không hiển thị lại mật khẩu gốc"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Mật khẩu: đã mã hóa
                  </span>
                </div>
              </div>
              <Button onClick={() => setOpen(true)}>
                <Pencil className="h-4 w-4" /> Chỉnh sửa thông tin
              </Button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field icon="idcard" tint="from-sky-100 to-sky-200" label="Mã nhân viên" value={u?.employeeId} />
              <Field icon="mail" tint="from-violet-100 to-violet-200" label="Email" value={u?.email ?? undefined} />
              <Field icon="phone" tint="from-emerald-100 to-emerald-200" label="Số điện thoại" value={profile?.phone ?? undefined} />
              <Field icon="briefcase" tint="from-amber-100 to-amber-200" label="Chức vụ" value={profile?.position ?? undefined} />
              <Field icon="building" tint="from-rose-100 to-rose-200" label="Bộ phận" value={profile?.department ?? undefined} />
              <Field icon="shield" tint="from-indigo-100 to-indigo-200" label="Phân quyền" value={u?.role} />
            </div>
          </div>
        </div>
      </Card>

      {profile && (
        <EditProfileDialog open={open} onOpenChange={setOpen} profile={profile} isAdmin={isAdmin} />
      )}
    </div>
  );
}

function EditProfileDialog({
  open,
  onOpenChange,
  profile,
  isAdmin,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  profile: SafeUser;
  isAdmin: boolean;
}) {
  const update = useUpdateProfile();
  const { data: usersData } = useUsers();
  // Chức vụ options synced from the database — distinct (case/diacritic-insensitive),
  // with Quản đốc / Phó Quản đốc / Kỹ thuật viên excluded.
  const positionOptions = React.useMemo(() => {
    const byKey = new Map<string, string>(); // normalized key → first display value
    const add = (raw?: string | null) => {
      const p = raw?.trim();
      if (!p) return;
      const key = normalizeText(p);
      if (EXCLUDED_POSITIONS.has(key) || byKey.has(key)) return;
      byKey.set(key, p);
    };
    (usersData?.data ?? []).forEach((u) => add(u.position));
    add(profile.position);
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, "vi"));
  }, [usersData, profile.position]);

  const [form, setForm] = React.useState({
    avatarUrl: profile.avatarUrl ?? "",
    signatureUrl: profile.signatureUrl ?? "",
    employeeId: profile.employeeId,
    phone: profile.phone ?? "",
    email: profile.email,
    name: profile.name,
    position: profile.position ?? "",
    department: profile.department ?? "",
    role: profile.role,
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    // Non-admin sends only the limited set; admin sends everything.
    const payload: Record<string, unknown> = {
      signatureUrl: form.signatureUrl,
      employeeId: form.employeeId,
      phone: form.phone,
      email: form.email,
    };
    if (isAdmin) {
      // Chỉ quản trị viên mới được thay ảnh đại diện.
      payload.avatarUrl = form.avatarUrl;
      payload.name = form.name;
      payload.position = form.position;
      payload.department = form.department;
      payload.role = form.role;
    }
    try {
      await update.mutateAsync(payload);
      toast.success("Đã cập nhật thông tin");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa thông tin</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <EditField label="Hình ảnh" className="sm:col-span-2">
            {isAdmin ? (
              <AvatarPicker value={form.avatarUrl} onChange={(v) => set("avatarUrl", v)} name={form.name} />
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-sm font-semibold text-white ring-1 ring-border">
                  {form.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials(form.name)
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Chỉ quản trị viên mới được thay ảnh đại diện.</p>
              </div>
            )}
          </EditField>
          <EditField label="Mã nhân viên">
            <Input value={form.employeeId} onChange={(e) => set("employeeId", e.target.value)} />
          </EditField>
          <EditField label="Số điện thoại">
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </EditField>
          <EditField label="Email" className="sm:col-span-2">
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </EditField>
          <EditField label="Chữ ký số" className="sm:col-span-2">
            <SignaturePad value={form.signatureUrl} onChange={(v) => set("signatureUrl", v)} />
          </EditField>

          {isAdmin && (
            <>
              <EditField label="Họ tên" className="sm:col-span-2">
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
              </EditField>
              <EditField label="Chức vụ">
                <Select value={form.position} onValueChange={(v) => set("position", v)}>
                  <SelectTrigger><SelectValue placeholder="Chọn chức vụ" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {positionOptions.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </EditField>
              <EditField label="Bộ phận">
                <Input value={form.department} onChange={(e) => set("department", e.target.value)} />
              </EditField>
              <EditField label="Vai trò" className="sm:col-span-2">
                <Select value={form.role} onValueChange={(v) => set("role", v as typeof form.role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_KEYS.map((r) => (
                      <SelectItem key={r} value={r}>{ROLES[r].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </EditField>
            </>
          )}
        </div>
        {!isAdmin && (
          <p className="text-xs text-muted-foreground">
            Bạn chỉ có thể chỉnh sửa ảnh, mã nhân viên, số điện thoại và email. Liên hệ Quản trị để đổi vai trò/chức vụ.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Lưu thay đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ icon, tint, label, value }: { icon: string; tint: string; label: string; value?: string }) {
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-accent/40 hover:bg-accent/5">
      <span
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-sm ring-1 ring-white/60",
          "transition-transform duration-300 group-hover:scale-110",
          tint
        )}
      >
        {/* Microsoft Fluent 3D emoji */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/icons3d/${icon}.png`} alt="" className="h-8 w-8 object-contain drop-shadow-sm" />
      </span>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate font-medium text-ink">{value || "—"}</div>
      </div>
    </div>
  );
}

function EditField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}
