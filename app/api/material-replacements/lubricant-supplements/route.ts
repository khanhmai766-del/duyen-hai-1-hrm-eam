import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { isLubricantSupervisor } from "@/lib/lubricant-access";
import { isSupplementReason, materialCategoryMatches } from "@/lib/constants";
import { latestSupplements, manualSupplementLogs, supplementDayToDate, vnDay } from "@/lib/lubricant-supplements";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    if (!isLubricantSupervisor(user)) await requirePermissionLevel(user, "replacement-manage", ["read", "personal", "manage", "full"], "Không đủ quyền xem lần bổ sung dầu mỡ");
    // Log không có quan hệ tới phiếu: lấy log dầu mỡ có ticketId rồi tra lý do phiếu theo lô (2 truy vấn).
    const logs = await prisma.materialReplacementLog.findMany({
      where: { ticketId: { not: null }, material: { category: "Dầu bôi trơn" } },
      select: {
        replacementId: true, deviceSeq: true, machine: true, materialId: true, replacedAt: true,
        usedQuantity: true, quantity: true, unitLabel: true, ticketId: true,
        material: { select: { category: true } },
      },
    });
    const tickets = await prisma.materialTicket.findMany({
      where: { id: { in: [...new Set(logs.flatMap((log) => log.ticketId ?? []))] } },
      select: { id: true, proposalNote: true },
    });
    const supplementTickets = new Set(tickets.filter((ticket) => isSupplementReason(ticket.proposalNote)).map((ticket) => ticket.id));
    const manual = await prisma.lubricantSupplement.findMany({ select: { replacementId: true, suppliedAt: true, quantity: true, unit: true } });
    return ok(latestSupplements([
      ...logs.filter((log) =>
        log.ticketId && supplementTickets.has(log.ticketId) && materialCategoryMatches(log.material?.category, "Dầu bôi trơn")),
      ...manualSupplementLogs(manual),
    ]));
  });
}

const permission = "replacement-manage";

/** POST { replacementId, date: YYYY-MM-DD, quantity?, materialId?, note? } — thêm một lần bổ sung nhập tay. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (!isLubricantSupervisor(user)) await requirePermissionLevel(user, permission, ["personal", "manage", "full"], "Không đủ quyền ghi lần bổ sung dầu mỡ");
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const replacementId = typeof body?.replacementId === "string" ? body.replacementId : "";
    const date = typeof body?.date === "string" ? body.date : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(supplementDayToDate(date).getTime())) return fail("Ngày bổ sung không hợp lệ");
    if (date > vnDay(new Date())) return fail("Ngày bổ sung không được ở tương lai");
    const quantity = body?.quantity == null || body.quantity === "" ? null : Number(body.quantity);
    if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) return fail("Khối lượng bổ sung phải từ 0 trở lên");
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) || null : null;

    const point = replacementId
      ? await prisma.materialReplacement.findUnique({
        where: { id: replacementId },
        select: { id: true, materialId: true, alternateMaterialIds: true, material: { select: { category: true, unit: true } } },
      })
      : null;
    if (!point) return fail("Không tìm thấy điểm theo dõi", 404);
    if (!materialCategoryMatches(point.material.category, "Dầu bôi trơn")) return fail("Chỉ ghi bổ sung cho điểm dầu bôi trơn");
    const materialId = typeof body?.materialId === "string" && body.materialId ? body.materialId : point.materialId;
    if (![point.materialId, ...point.alternateMaterialIds].includes(materialId)) return fail("Dầu không thuộc điểm theo dõi này");
    const oil = materialId === point.materialId ? point.material : await prisma.material.findUnique({ where: { id: materialId }, select: { unit: true } });

    const saved = await prisma.lubricantSupplement.create({
      data: {
        replacementId: point.id, suppliedAt: supplementDayToDate(date), quantity, unit: oil?.unit ?? null, materialId, note,
        createdById: user.id, createdByName: user.name ?? user.email ?? user.id,
      },
    });
    await audit(user.id, "CREATE_LUBRICANT_SUPPLEMENT", "LubricantSupplement", saved.id, JSON.stringify({ replacementId: point.id, date, quantity, materialId }));
    return ok({ id: saved.id });
  });
}

/** DELETE ?id= — chỉ xoá lần nhập tay; người nhập, quản trị hoặc chức danh giám sát. */
export async function DELETE(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id") ?? "";
    const row = id ? await prisma.lubricantSupplement.findUnique({ where: { id } }) : null;
    if (!row) return fail("Không tìm thấy lần bổ sung nhập tay", 404);
    if (row.createdById !== user.id && !isLubricantSupervisor(user)) return fail("Chỉ người nhập, quản trị hoặc giám sát được xoá", 403);
    await prisma.lubricantSupplement.delete({ where: { id } });
    await audit(user.id, "DELETE_LUBRICANT_SUPPLEMENT", "LubricantSupplement", id,
      JSON.stringify({ replacementId: row.replacementId, date: vnDay(row.suppliedAt), quantity: row.quantity }));
    return ok({ id });
  });
}
