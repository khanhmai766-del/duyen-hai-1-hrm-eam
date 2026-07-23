import { NextRequest, NextResponse } from "next/server";
import { createChallengeCookie, rpIdFromRequest } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const { payload, value } = createChallengeCookie({ purpose: "authenticate" });
  const response = NextResponse.json({
    challenge: payload.challenge,
    timeout: 60000,
    rpId: rpIdFromRequest(req),
    userVerification: "required",
  });
  response.cookies.set("webauthn_authenticate", value, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 300 });
  return response;
}
