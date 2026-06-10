import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle } from "@/lib/api";

export async function GET(req: NextRequest, { params }: { params: { type: string } }) {
  return handle(async () => {
    await requireUser();
    const sp = req.nextUrl.searchParams;
    const from = sp.get("from") ? new Date(sp.get("from")!) : undefined;
    const to = sp.get("to") ? new Date(sp.get("to")! + "T23:59:59") : undefined;
    const dateFilter = from || to ? { gte: from, lte: to } : undefined;

    switch (params.type) {
      case "summary": {
        const [deviceCount, repairs, materials, todayShift] = await Promise.all([
          prisma.device.count(),
          prisma.repairLog.groupBy({ by: ["status"], _count: true }),
          prisma.material.findMany(),
          (async () => {
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            const end = new Date();
            end.setHours(23, 59, 59, 999);
            return prisma.shift.findFirst({
              where: { date: { gte: start, lte: end } },
              include: {
                assignments: { include: { user: { select: { id: true, name: true, position: true, phone: true } } } },
                checkIns: true,
              },
            });
          })(),
        ]);
        const lowStock = materials.filter((m) => m.quantity <= m.minStock).length;
        const onShift = todayShift?.checkIns.filter((c) => c.status !== "ABSENT").length ?? 0;
        const recentRepairs = await prisma.repairLog.findMany({
          orderBy: { startedAt: "desc" },
          take: 5,
          include: { device: { select: { code: true, name: true } } },
        });
        return ok({
          deviceCount,
          repairStatus: repairs.map((r) => ({ status: r.status, count: r._count })),
          lowStock,
          onShift,
          todayShift,
          recentRepairs,
          openRepairs: repairs.filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS" || r.status === "WAITING_PARTS").reduce((a, r) => a + r._count, 0),
        });
      }

      case "repair-frequency": {
        const grouped = await prisma.repairLog.groupBy({
          by: ["deviceId"],
          where: dateFilter ? { startedAt: dateFilter } : undefined,
          _count: true,
        });
        const devices = await prisma.device.findMany({
          where: { id: { in: grouped.map((g) => g.deviceId) } },
          select: { id: true, code: true, name: true },
        });
        const map = new Map(devices.map((d) => [d.id, d]));
        const data = grouped
          .map((g) => ({ device: map.get(g.deviceId)?.code ?? "?", name: map.get(g.deviceId)?.name ?? "", count: g._count }))
          .sort((a, b) => b.count - a.count);
        return ok(data);
      }

      case "mtbf": {
        // Mean Time Between Failures per device (days), approximated from repair start dates.
        const devices = await prisma.device.findMany({
          include: { repairLogs: { orderBy: { startedAt: "asc" }, select: { startedAt: true, downtime: true } } },
        });
        const data = devices
          .filter((d) => d.repairLogs.length > 0)
          .map((d) => {
            const logs = d.repairLogs;
            let mtbf = 0;
            if (logs.length > 1) {
              const span = logs[logs.length - 1].startedAt.getTime() - logs[0].startedAt.getTime();
              mtbf = span / (logs.length - 1) / (1000 * 60 * 60 * 24);
            }
            const totalDowntime = logs.reduce((a, l) => a + (l.downtime ?? 0), 0);
            return {
              code: d.code,
              name: d.name,
              failures: logs.length,
              mtbfDays: Math.round(mtbf * 10) / 10,
              totalDowntimeMin: totalDowntime,
            };
          })
          .sort((a, b) => b.failures - a.failures);
        return ok(data);
      }

      case "attendance": {
        const checkIns = await prisma.checkIn.groupBy({ by: ["status"], _count: true });
        const byUser = await prisma.checkIn.findMany({
          include: { user: { select: { name: true, position: true } } },
        });
        const userMap = new Map<string, { name: string; present: number; late: number; absent: number }>();
        for (const c of byUser) {
          const key = c.userId;
          const e = userMap.get(key) ?? { name: c.user.name, present: 0, late: 0, absent: 0 };
          if (c.status === "PRESENT") e.present++;
          else if (c.status === "LATE") e.late++;
          else if (c.status === "ABSENT") e.absent++;
          userMap.set(key, e);
        }
        return ok({
          summary: checkIns.map((c) => ({ status: c.status, count: c._count })),
          byUser: Array.from(userMap.values()),
        });
      }

      case "downtime-by-category": {
        const logs = await prisma.repairLog.findMany({
          where: dateFilter ? { startedAt: dateFilter } : undefined,
          include: { device: { select: { system: true } } },
        });
        const map = new Map<string, number>();
        for (const l of logs) {
          const key = l.device.system || "(Chưa đặt)";
          map.set(key, (map.get(key) ?? 0) + (l.downtime ?? 0));
        }
        return ok(Array.from(map.entries()).map(([category, downtime]) => ({ category, downtime })));
      }

      case "material-consumption": {
        const used = await prisma.deviceMaterial.findMany({ include: { material: true } });
        const map = new Map<string, { name: string; quantity: number; value: number }>();
        for (const u of used) {
          const e = map.get(u.materialId) ?? { name: u.material.name, quantity: 0, value: 0 };
          e.quantity += u.quantity;
          e.value += u.quantity * (u.material.unitPrice ?? 0);
          map.set(u.materialId, e);
        }
        return ok(Array.from(map.values()).sort((a, b) => b.value - a.value));
      }

      default:
        return fail("Loại báo cáo không hợp lệ", 404);
    }
  });
}
