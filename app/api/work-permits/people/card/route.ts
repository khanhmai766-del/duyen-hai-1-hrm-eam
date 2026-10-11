import { fail, ok, requireUser } from "@/lib/api";
import { permitHandle } from "@/lib/server/work-permits";
import { lookupPermitCardPerson } from "@/lib/server/work-permit-people";
export const dynamic = "force-dynamic";

/** Tra một thẻ khi quét QR trong hộp quét của PCT — logic ở lookupPermitCardPerson (dùng chung với "Quét QR"). */
export async function GET(req: Request) {
  return permitHandle(async () => {
    await requireUser();
    const result = await lookupPermitCardPerson(new URL(req.url).searchParams.get("q") ?? "");
    if (!result) return fail("Không đọc được số thẻ từ mã QR");
    return ok(result);
  });
}
