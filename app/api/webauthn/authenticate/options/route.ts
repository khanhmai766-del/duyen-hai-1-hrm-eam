import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createChallengeCookie, rpIdFromRequest } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Nhập email để đăng nhập bằng vân tay" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { email },
    include: { webAuthnCredentials: true } as any,
  } as any);
  if (!user || !user.isActive) return NextResponse.json({ error: "Tài khoản không hợp lệ" }, { status: 401 });
  const credentials = (user as any).webAuthnCredentials ?? [];
  if (!credentials.length) {
    return NextResponse.json({ error: "Tài khoản này chưa đồng bộ vân tay trên thiết bị" }, { status: 404 });
  }

  const { payload, value } = createChallengeCookie({ purpose: "authenticate", email: user.email, userId: user.id });
  const response = NextResponse.json({
    challenge: payload.challenge,
    timeout: 60000,
    rpId: rpIdFromRequest(req),
    userVerification: "required",
    allowCredentials: credentials.map((credential: any) => ({
      type: "public-key",
      id: credential.credentialId,
      transports: ["internal", "hybrid"],
    })),
  });
  response.cookies.set("webauthn_authenticate", value, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 300 });
  return response;
}
