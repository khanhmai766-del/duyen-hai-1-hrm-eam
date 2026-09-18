import { createHash, timingSafeEqual } from "node:crypto";

/** So sánh bearer token theo thời gian cố định, không đưa bí mật vào log. */
export function verifyBearerToken(authorization: string | null, expectedValue: string | undefined) {
  const expected = expectedValue?.trim() ?? "";
  const received = authorization?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!expected || !received) return false;
  const expectedHash = createHash("sha256").update(expected).digest();
  const receivedHash = createHash("sha256").update(received).digest();
  return timingSafeEqual(expectedHash, receivedHash);
}
