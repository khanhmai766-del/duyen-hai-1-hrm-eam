import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { parseDateInput } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Retention: keep only the trailing 3 months of operation events.
function retentionCutoff(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const sp = req.nextUrl.searchParams;
    const month = sp.get("month"); // optional "YYYY-MM"
    let where: any = { date: { gte: retentionCutoff() } };
    if (month) {
      const [y, m] = month.split("-").map(Number);
      where = { date: { gte: new Date(y, m - 1, 1), lte: new Date(y, m, 0, 23, 59, 59, 999) } };
    }
    const events = await prisma.operationEvent.findMany({
      where,
      orderBy: { date: "desc" },
      include: { createdBy: { select: { name: true } } },
    });
    return ok(events);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "operation-events", ["create", "manage", "full"], "Không đủ quyền cập nhật thông tin vận hành");
    const body = await req.json();
    if (!body.title || !body.date || !body.type) return fail("Thiếu loại, tiêu đề hoặc ngày");
    const event = await prisma.operationEvent.create({
      data: {
        type: body.type,
        title: body.title,
        date: parseDateInput(body.date),
        note: body.note || null,
        createdById: user.id,
      },
    });
    // Quarterly retention: drop anything older than 3 months whenever new data is added.
    await prisma.operationEvent.deleteMany({ where: { date: { lt: retentionCutoff() } } });
    await audit(user.id, "CREATE_OPERATION", "OperationEvent", event.id, event.title);
    return ok(event);
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "operation-events", ["manage", "full"], "Không đủ quyền cập nhật thông tin vận hành");
    const body = await req.json();
    if (!body.id) return fail("Thiếu id");
    if (!body.title || !body.date || !body.type) return fail("Thiếu loại, tiêu đề hoặc ngày");
    const event = await prisma.operationEvent.update({
      where: { id: body.id },
      data: {
        type: body.type,
        title: body.title,
        date: parseDateInput(body.date),
        note: body.note || null,
      },
    });
    await audit(user.id, "UPDATE_OPERATION", "OperationEvent", event.id, event.title);
    return ok(event);
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "operation-events", ["full"], "Không đủ quyền xoá thông tin vận hành");
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return fail("Thiếu id");
    await prisma.operationEvent.delete({ where: { id } });
    await audit(user.id, "DELETE_OPERATION", "OperationEvent", id);
    return ok({ id });
  });
}
