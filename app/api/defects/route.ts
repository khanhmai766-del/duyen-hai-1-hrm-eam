import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";

export const dynamic = "force-dynamic";

const INCLUDE = { createdBy: { select: { id: true, name: true, position: true } } };

/** Sinh mã khiếm khuyết kế tiếp dạng KKTB//001. */
async function nextCode(): Promise<string> {
  const last = await prisma.defect.findFirst({ orderBy: { createdAt: "desc" }, select: { code: true } });
  const n = last?.code?.match(/(\d+)\s*$/)?.[1];
  const seq = (n ? parseInt(n, 10) : 0) + 1;
  return `KKTB//${String(seq).padStart(3, "0")}`;
}

export async function GET() {
  return handle(async () => {
    await requireUser();
    const defects = await prisma.defect.findMany({ orderBy: { createdAt: "desc" }, include: INCLUDE });
    // gợi ý mã kế tiếp cho form thêm mới
    const suggestedCode = await nextCode();
    return ok(defects, { total: defects.length, suggestedCode });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR", "TECHNICIAN"]);
    const body = await req.json();

    if (!body.unit) return fail("Vui lòng chọn tổ máy");
    let code = body.code?.trim();
    if (!code) code = await nextCode();
    const exists = await prisma.defect.findUnique({ where: { code } });
    if (exists) return fail("Mã khiếm khuyết đã tồn tại");

    const defect = await prisma.defect.create({
      data: {
        code,
        unit: body.unit,
        system: body.system || null,
        severity: body.severity || null,
        condition: body.condition || null,
        requestType: body.requestType || null,
        requestNumber: body.requestNumber?.trim() || null,
        content: body.content?.trim() || null,
        status: body.status || "CHUA_XU_LY",
        detectedAt: body.detectedAt ? new Date(body.detectedAt) : null,
        note: body.note?.trim() || null,
        imageUrl: body.imageUrl || null,
        createdById: user.id,
      },
      include: INCLUDE,
    });
    await audit(user.id, "CREATE_DEFECT", "Defect", defect.id, defect.code);
    return ok(defect);
  });
}
