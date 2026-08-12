import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Lightweight edge guard: checks for the NextAuth session cookie and redirects
// unauthenticated users to /login. Fine-grained RBAC is enforced server-side in
// each route handler / page via auth().
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/webauthn", "/api/public", "/api/integrations/n8n", "/videos", "/public"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const hasSession = SESSION_COOKIES.some((c) => req.cookies.has(c));
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  if (token?.accessMode === "DEFECT_READ_ONLY") {
    const isAllowedPage = pathname === "/defects" || pathname.startsWith("/defects/") || pathname === "/account";
    const isAllowedApi =
      pathname.startsWith("/api/auth") ||
      pathname.startsWith("/api/public") ||
      (pathname === "/api/me" || pathname.startsWith("/api/me/")) ||
      pathname === "/api/auth/logout-audit" ||
      pathname === "/api/rbac/me" ||
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
