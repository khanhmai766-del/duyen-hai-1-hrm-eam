import { NextRequest, NextResponse } from "next/server";
import { createChallengeCookie, rpIdFromRequest } from "@/lib/webauthn";
import { checkPassword, findLoginUser, recordLoginFailure, recordLoginSuccess } from "@/lib/login-credentials";

export async function POST(req: NextRequest) {
  const { email: rawLogin, password } = await req.json();
  const login = typeof rawLogin === "string" ? rawLogin.trim() : "";
  if (!login || !password) return NextResponse.json({ error: "Thiếu email/user hoặc mật khẩu" }, { status: 400 });

  // Route nằm dưới prefix công khai /api/webauthn: kiểm mật khẩu qua cùng đường với form
  // đăng nhập để lần sai ở đây cũng bị đếm và khóa tài khoản (trước đây không đếm → dò
  // mật khẩu không giới hạn qua route này).
  const user = await findLoginUser(login);
  if (!user || !user.isActive || user.lockedAt) return NextResponse.json({ error: "Tài khoản không hợp lệ" }, { status: 401 });
  if (!(await checkPassword(user, String(password)))) {
    await recordLoginFailure(user);
    return NextResponse.json({ error: "Mật khẩu không đúng" }, { status: 401 });
  }
  await recordLoginSuccess(user, String(password));

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
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    },
  });
  response.cookies.set("webauthn_register", value, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 300 });
  return response;
}
