import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { LOOKUP_ACCESS_MODE, lookupLandingPage, lookupRequestAllowed } from "@/lib/lookup-access";
import { lookupModulesFor } from "@/lib/server/lookup-access";

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
  // Đọc chế độ hiện tại để đổi/thu hồi quyền có hiệu lực với phiên đang mở.
  if (token?.id) {
    try {
      const user = await prisma.user.findUnique({ where: { id: String(token.id) },
        select: { id: true, accessMode: true, isActive: true, lockedAt: true } });
      if (!user?.isActive || user.lockedAt) {
        return NextResponse.json({ data: null, meta: null, error: "Tài khoản không hợp lệ" }, { status: 401 });
      }
      if (user.accessMode === LOOKUP_ACCESS_MODE) {
        const modules = await lookupModulesFor(user.id);
        if (!lookupRequestAllowed(req.nextUrl, req.method, modules)) {
          if (pathname.startsWith("/api/")) return NextResponse.json(
            { data: null, meta: null, error: "Tài khoản tra cứu chưa được cấp quyền đọc mục này hoặc không được thực hiện thao tác ghi" },
            { status: 403 });
          return NextResponse.redirect(new URL(lookupLandingPage(modules), req.url));
        }
      }
    } catch {
      return NextResponse.json({ data: null, meta: null, error: "Không thể kiểm tra quyền truy cập" }, { status: 503 });
    }
  } else if (token?.accessMode === LOOKUP_ACCESS_MODE) {
    return NextResponse.json({ data: null, meta: null, error: "Tài khoản không hợp lệ" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|mov|ico|woff2?)$).*)",
  ],
};
