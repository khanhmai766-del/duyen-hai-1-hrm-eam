import { fail, ok, requireUser } from "@/lib/api";
import { requirePermitVisible } from "@/lib/server/work-permit-scope";
import { loadPermitSessionViolations } from "@/lib/server/work-permit-session-violations";
import { permitHandle } from "@/lib/server/work-permits";

export const dynamic = "force-dynamic";

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  return permitHandle(async () => {
    const user = await requireUser();
    const { id } = await props.params;
    await requirePermitVisible(user, id);
    const sessionId = new URL(req.url).searchParams.get("sessionId");
    if (!sessionId || sessionId.length > 100) return fail("Lần làm việc không hợp lệ");
    return ok(await loadPermitSessionViolations(id, sessionId));
  });
}
