"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Cpu, ExternalLink, Fingerprint, Loader2, Network, ScanFace, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoginBackground } from "@/components/auth/login-background";

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
  const rawCallbackUrl = params.get("callbackUrl") || "/";
  const callbackUrl = rawCallbackUrl.startsWith("/login") ? "/" : rawCallbackUrl;

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [passwordVisible, setPasswordVisible] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [biometricLoading, setBiometricLoading] = React.useState(false);
  const [biometricSupported, setBiometricSupported] = React.useState(false);
  const [stats, setStats] = React.useState<{ devices: number; users: number; materials: number } | null>(null);
  const [loginError, setLoginError] = React.useState("");
  const passwordRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    document.documentElement.classList.remove("dark");
    // Reset cờ "đã đóng" thông báo hệ thống để mỗi lần đăng nhập đều hiển thị lại.
    try {
      sessionStorage.removeItem("broadcast-dismissed");
      localStorage.removeItem("pp:last-activity");
      sessionStorage.removeItem("pp:org-chart-viewer-active");
    } catch {
      /* Web storage không khả dụng */
    }
  }, []);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/public/stats")
      .then((r) => r.json())
      .then((j) => { if (alive && j?.data) setStats(j.data); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    setBiometricSupported(typeof window !== "undefined" && !!window.PublicKeyCredential);
  }, []);

  React.useEffect(() => {
    if (params.get("reason") === "timeout") {
      toast.warning("Phiên đăng nhập đã hết hạn", {
        description: "Bạn đã không hoạt động hoặc mất kết nối quá 30 phút. Vui lòng đăng nhập lại.",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setLoginError("");
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        setPassword("");
        setPasswordVisible(false);
        const message = await readLoginFailureMessage(email);
        setLoginError(message);
        toast.error("Đăng nhập thất bại", { description: message });
        window.setTimeout(() => passwordRef.current?.focus(), 0);
        return;
      }
      toast.success("Đăng nhập thành công");
      try {
        localStorage.setItem("pp:last-activity", String(Date.now()));
      } catch {
        /* Web storage không khả dụng */
      }
      router.push(callbackUrl);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function syncBiometric() {
    if (!biometricSupported) {
      toast.error("Thiết bị chưa hỗ trợ Passkey.");
      return;
    }
    setBiometricLoading(true);
    try {
      const optionsRes = await fetch("/api/webauthn/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const options = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(options.error || "Không tạo được phiên đăng ký Passkey");

      const credential = await navigator.credentials.create({
        publicKey: {
          ...options,
          challenge: base64urlToBuffer(options.challenge),
          user: { ...options.user, id: base64urlToBuffer(options.user.id) },
          excludeCredentials: options.excludeCredentials?.map((item: any) => ({
            ...item,
            id: base64urlToBuffer(item.id),
          })),
        },
      });
      if (!credential) throw new Error("Người dùng đã huỷ đăng ký thiết bị");

      const verifyRes = await fetch("/api/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: publicKeyCredentialToJSON(credential), deviceName: navigator.userAgent }),
      });
      const verify = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verify.error || "Đăng ký Passkey thất bại");
      toast.success("Đã đăng ký Passkey cho thiết bị này");
    } catch (error) {
      toast.error("Không thể đăng ký thiết bị", { description: readableWebAuthnError(error) });
    } finally {
      setBiometricLoading(false);
    }
  }

  async function loginWithBiometric() {
    if (!biometricSupported) {
      toast.error("Thiết bị chưa hỗ trợ Passkey.");
      return;
    }
    setBiometricLoading(true);
    try {
      const optionsRes = await fetch("/api/webauthn/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const options = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(options.error || "Không tạo được phiên đăng nhập Passkey");

      const credential = await navigator.credentials.get({
        publicKey: {
          ...options,
          challenge: base64urlToBuffer(options.challenge),
          allowCredentials: options.allowCredentials?.map((item: any) => ({
            ...item,
            id: base64urlToBuffer(item.id),
          })),
        },
      });
      if (!credential) throw new Error("Người dùng đã huỷ xác thực Passkey");

      const verifyRes = await fetch("/api/webauthn/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: publicKeyCredentialToJSON(credential) }),
      });
      const verify = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verify.error || "Xác thực Passkey thất bại");

      const res = await signIn("credentials", {
        email: verify.email,
        password: "biometric",
        biometricToken: verify.loginToken,
        redirect: false,
      });
      if (res?.error) throw new Error("Không tạo được phiên đăng nhập");
      toast.success("Đăng nhập bằng Passkey thành công");
      try {
        localStorage.setItem("pp:last-activity", String(Date.now()));
      } catch {
        /* Web storage không khả dụng */
      }
      router.push(callbackUrl);
      router.refresh();
    } catch (error) {
      toast.error("Không thể đăng nhập bằng Passkey", { description: readableWebAuthnError(error) });
    } finally {
      setBiometricLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden min-h-dvh flex-col justify-between overflow-hidden bg-navy p-12 text-white lg:flex">
        <LoginBackground />
        <div className="relative z-10">
          <div className="login-logo-stage" aria-label="EVNGENCO1 - Công ty Nhiệt điện Duyên Hải">
            <div className="login-logo-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/1234.png"
                alt="EVNGENCO1 — Công ty Nhiệt điện Duyên Hải"
                className="login-logo-mark"
              />
            </div>
          </div>
        </div>
        <div className="relative z-10">
          <div className="mb-2 text-lg font-semibold tracking-[0.3em] text-slate-200 [text-shadow:0_1px_10px_rgba(0,0,0,0.6)]">
            HỆ THỐNG QUẢN LÝ VẬN HÀNH
          </div>
          <h1 className="text-4xl font-bold uppercase leading-tight tracking-wide [text-shadow:0_2px_12px_rgba(0,0,0,0.55)]">
            NHÂN SỰ · VẬT TƯ · THIẾT BỊ
          </h1>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <span className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-slate-100 backdrop-blur-sm">
              {stats ? stats.users.toLocaleString("vi-VN") : "—"} nhân sự
            </span>
            <span className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-slate-100 backdrop-blur-sm">
              {stats ? stats.materials.toLocaleString("vi-VN") : "—"} mã vật tư ERP
            </span>
            <span className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-slate-100 backdrop-blur-sm">
              {stats ? stats.devices.toLocaleString("vi-VN") : "—"} thiết bị
            </span>
          </div>
          <div className="mt-5 text-base font-bold uppercase tracking-wide text-slate-100 [text-shadow:0_1px_10px_rgba(0,0,0,0.6)]">
            Phân xưởng Vận hành 1
          </div>
          <div className="mt-1 text-sm text-slate-300 [text-shadow:0_1px_10px_rgba(0,0,0,0.6)]">
            An Toàn – Hiệu Quả – Kinh Tế – Bảo Vệ Môi Trường
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-warmwhite px-4 py-8 pb-16 sm:px-6 sm:py-10 sm:pb-16 lg:p-6">
        {/* Decorative brand motif, bottom-right */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/12345.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-8 -right-14 w-52 select-none opacity-45 sm:-bottom-6 sm:-right-6 sm:w-80 sm:opacity-70 lg:w-[22rem]"
        />
        {/* Footer */}
        <p className="absolute bottom-3 left-0 right-0 z-10 text-center text-xs text-muted-foreground sm:bottom-5">
          © 2026 — Phân xưởng Vận hành 1
        </p>

        <div className="relative z-10 w-full max-w-md">
          <div className="mb-4 flex justify-center sm:mb-7 lg:hidden">
            <div className="login-logo-stage login-logo-stage-mobile" aria-label="EVNGENCO1 - Công ty Nhiệt điện Duyên Hải">
              <div className="login-logo-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/1234.png"
                  alt="EVNGENCO1 — Công ty Nhiệt điện Duyên Hải"
                  className="login-logo-mark"
                />
              </div>
            </div>
          </div>

          <div className="login-access-card">
            <div className="login-access-grid" aria-hidden="true" />
            <div className="relative space-y-4 sm:space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="login-access-icon">
                    <Fingerprint className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                      <Sparkles className="h-3 w-3" />
                      AI Access
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Đăng nhập</h2>
                    <p className="text-sm text-muted-foreground">Kết nối tài khoản nội bộ để vào hệ thống vận hành.</p>
                  </div>
                </div>
                <div className="hidden rounded-2xl border border-slate-200 bg-white/80 p-2 shadow-sm sm:block">
                  <Cpu className="h-5 w-5 text-blue-600" />
                </div>
              </div>

              <form onSubmit={onSubmit} className="space-y-3 sm:space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Email hoặc User
                  </Label>
                  <Input
                    id="email"
                    type="text"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setLoginError("");
                    }}
                    className="login-access-input"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Mật khẩu
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      ref={passwordRef}
                      type={passwordVisible ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setLoginError("");
                      }}
                      className="login-access-input pr-20"
                      autoComplete="current-password"
                      aria-invalid={Boolean(loginError)}
                      aria-describedby={loginError ? "login-error" : undefined}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setPasswordVisible((visible) => !visible)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-navy focus:outline-none focus:ring-2 focus:ring-accent/30"
                      aria-label={passwordVisible ? "Ẩn mật khẩu" : "Hiển thị mật khẩu"}
                      aria-pressed={passwordVisible}
                    >
                      {passwordVisible ? "Ẩn" : "Hiển thị"}
                    </button>
                  </div>
                  {loginError && (
                    <p id="login-error" className="text-sm font-medium text-red-600">
                      {loginError}
                    </p>
                  )}
                </div>
                <Button type="submit" className="login-access-button w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Đăng nhập
                </Button>
              </form>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="login-biometric-button"
                  disabled={biometricLoading || !biometricSupported}
                  onClick={loginWithBiometric}
                >
                  {biometricLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="flex items-center gap-1" aria-hidden="true">
                      <Fingerprint className="h-4 w-4" />
                      <ScanFace className="h-4 w-4" />
                    </span>
                  )}
                  Đăng nhập
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="login-biometric-button"
                  disabled={biometricLoading || !biometricSupported}
                  onClick={syncBiometric}
                >
                  <Smartphone className="h-4 w-4" />
                  Đăng ký thiết bị này
                </Button>
              </div>
              {!biometricSupported && (
                <p className="text-xs text-muted-foreground">
                  Trình duyệt hiện tại chưa hỗ trợ Passkey. Hãy dùng Safari/Chrome/Edge mới trên smartphone hoặc iPad.
                </p>
              )}

              <div className="border-t border-slate-200/80 pt-4">
                <Button
                  asChild
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-between gap-3 border-emerald-200 bg-emerald-50/70 px-4 py-3 text-left text-emerald-950 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-100/80 hover:text-emerald-950"
                >
                  <Link href="/public/org-chart">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white shadow-sm">
                        <Network className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">Xem sơ đồ ca vận hành</span>
                        <span className="block text-xs font-normal text-emerald-800">
                          Danh sách công khai · Không cần đăng nhập
                        </span>
                      </span>
                    </span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-emerald-700" />
                  </Link>
                </Button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function readLoginFailureMessage(email: string) {
  try {
    const res = await fetch("/api/auth/login-attempt-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = await res.json();
    return json?.data?.message || "Email/User hoặc mật khẩu không đúng.";
  } catch {
    return "Email/User hoặc mật khẩu không đúng.";
  }
}

function base64urlToBuffer(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  const binary = atob(normalized + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function publicKeyCredentialToJSON(credential: Credential) {
  const publicKeyCredential = credential as PublicKeyCredential;
  const response = publicKeyCredential.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse;
  return {
    id: publicKeyCredential.id,
    rawId: bufferToBase64url(publicKeyCredential.rawId),
    type: publicKeyCredential.type,
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      attestationObject: "attestationObject" in response ? bufferToBase64url(response.attestationObject) : undefined,
      authenticatorData: "authenticatorData" in response ? bufferToBase64url(response.authenticatorData) : undefined,
      signature: "signature" in response ? bufferToBase64url(response.signature) : undefined,
      userHandle: "userHandle" in response && response.userHandle ? bufferToBase64url(response.userHandle) : undefined,
    },
  };
}

function readableWebAuthnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("NotAllowedError")) return "Thiết bị đã huỷ hoặc chưa xác nhận sinh trắc học.";
  if (message.includes("NotSupportedError")) return "Trình duyệt hoặc thiết bị chưa hỗ trợ Passkey.";
  return message;
}
