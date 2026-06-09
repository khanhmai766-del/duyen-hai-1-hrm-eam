"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoginBackground } from "@/components/auth/login-background";

const DEMO_ACCOUNTS = [
  { role: "Admin", email: "admin@powerplant.vn" },
  { role: "Trưởng ca", email: "supervisor@powerplant.vn" },
  { role: "Kỹ thuật", email: "tech@powerplant.vn" },
  { role: "Người xem", email: "viewer@powerplant.vn" },
];

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginInner />
    </React.Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/";

  const [email, setEmail] = React.useState("admin@powerplant.vn");
  const [password, setPassword] = React.useState("password123");
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      toast.error("Đăng nhập thất bại", { description: "Email hoặc mật khẩu không đúng." });
      return;
    }
    toast.success("Đăng nhập thành công");
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-navy p-12 text-white lg:flex">
        <LoginBackground />
        <div className="relative z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/1234.png"
            alt="EVNGENCO1 — Công ty Nhiệt điện Duyên Hải"
            className="h-24 w-auto rounded-xl bg-white/95 px-4 py-3 shadow-md"
          />
        </div>
        <div className="relative z-10 space-y-4">
          <h1 className="text-4xl font-bold uppercase leading-tight [text-shadow:0_2px_12px_rgba(0,0,0,0.55)]">
            HỆ THỐNG QUẢN LÝ NHÂN SỰ & THIẾT BỊ
          </h1>
          <p className="max-w-md text-white/90 [text-shadow:0_1px_10px_rgba(0,0,0,0.6)]">
            <span className="text-lg font-semibold uppercase tracking-wide text-white">
              Phân xưởng Vận hành 1
            </span>
            <br />
            An Toàn - Hiệu Quả - Kinh Tế - Bảo Vệ Môi Trường
          </p>
        </div>
        <div className="relative z-10 flex gap-8 text-sm text-white/70">
          <div>
            <div className="text-2xl font-bold text-white">15+</div>
            Thiết bị quản lý
          </div>
          <div>
            <div className="text-2xl font-bold text-white">24/7</div>
            Giám sát ca kíp
          </div>
          <div>
            <div className="text-2xl font-bold text-white">5</div>
            Phân hệ chính
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center overflow-hidden bg-warmwhite p-6">
        {/* Decorative brand motif, bottom-right */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/12345.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-6 -right-6 w-64 select-none opacity-70 sm:w-80 lg:w-[22rem]"
        />
        {/* Footer */}
        <p className="absolute bottom-5 left-0 right-0 z-10 text-center text-xs text-muted-foreground">
          © 2026 — Phân xưởng Vận hành 1
        </p>

        <div className="relative z-10 w-full max-w-sm space-y-8">
          <div className="flex justify-center lg:hidden">
            {/* Transparent PNG + layered drop-shadows → a 3D, lifted look (the
                shadow follows the logo shape, not a box). Gentle float animation. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/1234.png"
              alt="EVNGENCO1 — Công ty Nhiệt điện Duyên Hải"
              className="logo-3d h-28 w-auto sm:h-32"
            />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-2xl font-bold text-ink">Đăng nhập</h2>
            <p className="text-sm text-muted-foreground">Sử dụng tài khoản nội bộ để tiếp tục.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Đăng nhập
            </Button>
          </form>

          <div className="rounded-lg border border-dashed border-border bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tài khoản demo (mật khẩu: password123)
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword("password123");
                  }}
                  className="rounded-md border border-border px-2 py-1.5 text-left transition-colors hover:border-accent hover:bg-accent/5"
                >
                  <span className="block font-medium text-ink">{a.role}</span>
                  <span className="text-muted-foreground">{a.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
