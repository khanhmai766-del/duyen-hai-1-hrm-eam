import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Lightweight guard (Next 16 "proxy", trước là middleware.ts; chạy Node runtime): checks for the NextAuth session cookie and redirects
// unauthenticated users to /login. Fine-grained RBAC is enforced server-side in
// each route handler / page via auth().
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/webauthn",
  "/api/public",
  "/api/integrations/n8n",
  // Hai endpoint máy-máy này không dùng cookie; mỗi route tự kiểm bearer token riêng.
  "/api/integrations/sync-monitor",
  "/api/internal/telegram-jobs",
  "/videos",
  "/public",
];
const AUTHENTICATED_PUBLIC_PATHS = ["/public/equipment", "/public/devices"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const requiresAuthentication = AUTHENTICATED_PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (!requiresAuthentication && PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const hasSession = SESSION_COOKIES.some((c) => req.cookies.has(c));
  if (!hasSession) {
    const url = req.nextUrl.clone();
    const callbackUrl = `${pathname}${req.nextUrl.search}`;
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("callbackUrl", callbackUrl);
    return NextResponse.redirect(url);
  }

  // `secureCookie` phải khớp tên cookie đang có. Mặc định getToken chỉ đọc "authjs.session-token",
  // còn trên production (https) Auth.js đặt "__Secure-authjs.session-token" — thiếu tham số này thì
  // token luôn rỗng và đoạn chặn DEFECT_READ_ONLY bên dưới không bao giờ chạy (lỗi tới 2026-09-13).
  // Dựa vào cookie có mặt, không dựa vào giao thức của URL: sau nginx, request tới app là http.
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: req.cookies.has("__Secure-authjs.session-token"),
  });
  if (token?.accessMode === "DEFECT_READ_ONLY") {
    const isAllowedPage = pathname === "/defects" || pathname.startsWith("/defects/") || pathname === "/devices/scan" || pathname === "/account" || requiresAuthentication;
    const isAllowedApi =
      pathname.startsWith("/api/auth") ||
      pathname.startsWith("/api/public") ||
      (pathname === "/api/me" || pathname.startsWith("/api/me/")) ||
      pathname === "/api/auth/logout-audit" ||
      pathname === "/api/rbac/me" ||
      pathname.startsWith("/api/ai") ||
      (req.method === "POST" && pathname === "/api/device-qr/resolve") ||
      (req.method === "GET" && (
        pathname === "/api/defects" ||
        pathname.startsWith("/api/defects/") ||
        pathname.startsWith("/api/defect-history") ||
        pathname.startsWith("/api/equipment-tree")
      ));

    if (pathname.startsWith("/api/") && !isAllowedApi) {
      return NextResponse.json(
        { data: null, meta: null, error: "Tài khoản này chỉ được tra cứu khiếm khuyết" },
        { status: 403 }
      );
    }
    if (!pathname.startsWith("/api/") && !isAllowedPage) {
      const url = req.nextUrl.clone();
      url.pathname = "/defects";
      url.search = "?phan=co";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|mov|ico|woff2?)$).*)",
  ],
};
