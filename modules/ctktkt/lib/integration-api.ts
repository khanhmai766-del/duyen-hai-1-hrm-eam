import { createHash, timingSafeEqual } from "node:crypto";

export function integrationAuthorized(request: Request, expectedHash: string | undefined) {
  if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  const auth = request.headers.get("authorization") || "";
  if (!/^Bearer [A-Za-z0-9_-]{40,100}$/.test(auth)) return false;
  const hash = createHash("sha256").update(auth.slice(7)).digest();
  return timingSafeEqual(hash, Buffer.from(expectedHash, "hex"));
}
export function integrationPeriod(raw: string | null) {
  if (!raw || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(raw)) return null;
  const [year,month]=raw.split("-").map(Number);
  return { period:raw, from:`${raw}-01`, next:`${month===12?year+1:year}-${String(month===12?1:month+1).padStart(2,"0")}-01` };
}
