import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createLoginToken,
  originFromRequest,
  readChallengeCookie,
  verifyAuthenticationResponse,
  verifyClientData,
} from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const payload = readChallengeCookie(req.cookies.get("webauthn_authenticate")?.value, "authenticate");
  if (!payload?.userId) return NextResponse.json({ error: "Phiên đăng nhập vân tay đã hết hạn" }, { status: 400 });

  const { credential } = await req.json();
  if (!credential?.id || !credential?.response?.clientDataJSON || !credential?.response?.authenticatorData || !credential?.response?.signature) {
    return NextResponse.json({ error: "Dữ liệu vân tay không hợp lệ" }, { status: 400 });
  }

  const stored = await (prisma as any).webAuthnCredential.findUnique({
    where: { credentialId: credential.id },
    include: { user: true },
  });
  if (!stored || stored.userId !== payload.userId || !stored.user?.isActive) {
    return NextResponse.json({ error: "Thiết bị chưa được đồng bộ" }, { status: 401 });
  }

  const okClient = verifyClientData({
    clientDataJSON: credential.response.clientDataJSON,
    expectedChallenge: payload.challenge,
    expectedOrigin: originFromRequest(req),
    expectedType: "webauthn.get",
  });
  if (!okClient) return NextResponse.json({ error: "Không xác thực được trình duyệt" }, { status: 400 });

  const result = verifyAuthenticationResponse({
    authenticatorData: credential.response.authenticatorData,
    clientDataJSON: credential.response.clientDataJSON,
    signature: credential.response.signature,
    publicKey: stored.publicKey,
  });
  if (!result.ok) return NextResponse.json({ error: "Xác thực vân tay thất bại" }, { status: 401 });

  if (result.counter > stored.counter) {
    await (prisma as any).webAuthnCredential.update({
      where: { id: stored.id },
      data: { counter: result.counter, lastUsedAt: new Date() },
    });
  } else {
    await (prisma as any).webAuthnCredential.update({
      where: { id: stored.id },
      data: { lastUsedAt: new Date() },
    });
  }

  const response = NextResponse.json({
    ok: true,
    email: stored.user.email,
    loginToken: createLoginToken({ userId: stored.user.id, email: stored.user.email }),
  });
  response.cookies.delete("webauthn_authenticate");
  return response;
}
