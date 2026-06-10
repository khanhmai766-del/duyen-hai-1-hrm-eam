import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";

export const dynamic = "force-dynamic";

const INCLUDE = { createdBy: { select: { id: true, name: true, position: true } } };

export async function GET() {
  return handle(async () => {
    await requireUser();
    // Ẩn các phiếu đã xử lý quá 2 tuần khỏi danh sách (lịch sử vẫn giữ riêng).
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const defects = await prisma.defect.findMany({
      where: { NOT: { AND: [{ status: "DA_XU_LY" }, { completedAt: { lt: cutoff } }] } },
      orderBy: { createdAt: "desc" },
      include: INCLUDE,
    });
    return ok(defects, { total: defects.length });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN", "SUPERVISOR", "TECHNICIAN"]);
    const body = await req.json();

    if (!body.unit) return fail("Vui lòng chọn tổ máy");

    const defect = await prisma.defect.create({
      data: {
        unit: body.unit,
        device: body.device || null,
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
    await audit(user.id, "CREATE_DEFECT", "Defect", defect.id);
    return ok(defect);
  });
}
