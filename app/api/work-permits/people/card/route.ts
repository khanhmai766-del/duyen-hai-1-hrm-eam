import { fail, ok, requireUser } from "@/lib/api";
import { permitHandle } from "@/lib/server/work-permits";
import { lookupPermitCardPerson } from "@/lib/server/work-permit-people";
export const dynamic = "force-dynamic";

/** Tra một thẻ khi quét QR trong hộp quét của PCT — logic ở lookupPermitCardPerson (dùng chung với "Quét QR"). */
export async function GET(req: Request) {
  return permitHandle(async () => {
    await requireUser();
    const params = new URL(req.url).searchParams;
    // `scope`: nhóm PCT đang quét (SCTX → thẻ "/SXKD" trước).
    const result = await lookupPermitCardPerson(params.get("q") ?? "", params.get("scope"));
    if (!result) return fail("Không đọc được số thẻ từ mã QR");
    return ok(result);
  });
}
