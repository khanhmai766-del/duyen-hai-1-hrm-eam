import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  originFromRequest,
  parseRegistrationResponse,
  readChallengeCookie,
  rpIdFromRequest,
  verifyClientData,
} from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const payload = readChallengeCookie(req.cookies.get("webauthn_register")?.value, "register");
  if (!payload?.userId) return NextResponse.json({ error: "Phiên đăng ký Passkey đã hết hạn" }, { status: 400 });

  const { credential, deviceName } = await req.json();
  if (!credential?.response?.clientDataJSON || !credential?.response?.attestationObject) {
    return NextResponse.json({ error: "Dữ liệu Passkey không hợp lệ" }, { status: 400 });
  }

  const okClient = verifyClientData({
    clientDataJSON: credential.response.clientDataJSON,
    expectedChallenge: payload.challenge,
    expectedOrigin: originFromRequest(req),
    expectedType: "webauthn.create",
  });
  if (!okClient) return NextResponse.json({ error: "Không xác thực được thiết bị" }, { status: 400 });

  const parsed = parseRegistrationResponse(credential.response.attestationObject, rpIdFromRequest(req));
  if (credential.id && credential.id !== parsed.credentialId) {
    return NextResponse.json({ error: "Credential ID không khớp" }, { status: 400 });
  }

  await (prisma as any).webAuthnCredential.upsert({
    where: { credentialId: parsed.credentialId },
    update: {
      publicKey: parsed.publicKey,
      counter: parsed.counter,
      userId: payload.userId,
      deviceName: deviceName ?? "Thiết bị cá nhân",
    },
    create: {
      credentialId: parsed.credentialId,
      publicKey: parsed.publicKey,
      counter: parsed.counter,
      userId: payload.userId,
      deviceName: deviceName ?? "Thiết bị cá nhân",
    },
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.delete("webauthn_register");
  return response;
}
