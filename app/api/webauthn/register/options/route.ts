import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createChallengeCookie, rpIdFromRequest } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const { email: rawLogin, password } = await req.json();
  const login = typeof rawLogin === "string" ? rawLogin.trim() : "";
  if (!login || !password) return NextResponse.json({ error: "Thiếu email/user hoặc mật khẩu" }, { status: 400 });

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: login.toLowerCase() }, { username: login }] },
  });
  if (!user || !user.isActive) return NextResponse.json({ error: "Tài khoản không hợp lệ" }, { status: 401 });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Mật khẩu không đúng" }, { status: 401 });

  const { payload, value } = createChallengeCookie({ purpose: "register", email: user.email, userId: user.id });
  const response = NextResponse.json({
    challenge: payload.challenge,
    rp: { name: "Vận hành 1 HRM & EAM", id: rpIdFromRequest(req) },
    user: {
      id: Buffer.from(user.id).toString("base64url"),
      name: user.email,
      displayName: user.name,
    },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    timeout: 60000,
    attestation: "none",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "required",
    },
  });
  response.cookies.set("webauthn_register", value, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 300 });
  return response;
}
