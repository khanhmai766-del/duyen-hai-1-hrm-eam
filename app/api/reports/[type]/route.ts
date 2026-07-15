import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { buildEquipmentTreeIndex } from "@/lib/equipment-tree";
import { getCachedEquipmentNodeList } from "@/lib/equipment-node-cache";
import { EQUIPMENT_DEVICE_SELECT, equipmentNodeToDevice } from "@/lib/equipment-device";
import { normalizeText } from "@/lib/nav";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { dateRange, vietnamTodayUtcMidnight } from "@/lib/utils";

async function getLeafEquipmentCount() {
  // Chỉ cần seq/parent để đếm node lá → dùng bản nhẹ đã cache, khỏi đọc DB mỗi lần.
  const nodes = await getCachedEquipmentNodeList();
  const index = buildEquipmentTreeIndex(nodes);
  return nodes.filter((node) => (index.childrenOf.get(node.seq) ?? []).length === 0).length;
}

export async function GET(req: NextRequest, { params }: { params: { type: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const access = await resolveEquipmentAccessForUser(user);
    const sp = req.nextUrl.searchParams;
    const from = sp.get("from") ? dateRange(sp.get("from")).start : undefined;
    const to = sp.get("to") ? dateRange(sp.get("to")).end : undefined;
    const dateFilter = from || to ? { gte: from, lte: to } : undefined;

    switch (params.type) {
      case "summary": {
        const [deviceCount, repairs, materials, todayShift] = await Promise.all([
          access.hasExplicitScopes
            ? Promise.resolve(
                access.nodes.filter((node) => (access.index.childrenOf.get(node.seq) ?? []).length === 0).length
              )
            : getLeafEquipmentCount(),
          prisma.repairLog.groupBy({
            by: ["status"],
            where: access.hasExplicitScopes ? { deviceSeq: { in: Array.from(access.visibleSeqs) } } : undefined,
            _count: true,
          }),
          prisma.material.findMany({
            include: { deviceMaterials: { select: { deviceSeq: true } } },
          }),
          (async () => {
            // "Ca hôm nay" theo NGÀY VIỆT NAM (shift.date lưu UTC-midnight của ngày VN).
            const start = vietnamTodayUtcMidnight();
            const end = new Date(start);
            end.setUTCDate(end.getUTCDate() + 1);
            end.setUTCMilliseconds(-1);
            return prisma.shift.findFirst({
              where: { date: { gte: start, lte: end } },
              include: {
                assignments: { include: { user: { select: { id: true, name: true, position: true, phone: true } } } },
                checkIns: true,
              },
            });
          })(),
        ]);
        const visibleMaterials = access.hasExplicitScopes
          ? materials.filter((m) => {
              if (m.system && access.visibleSystemNames.has(normalizeText(m.system))) return true;
              return m.deviceMaterials.some((dm) => access.canViewSeq(dm.deviceSeq));
            })
          : materials;
        const lowStock = visibleMaterials.filter((m) => m.quantity <= m.minStock).length;
        const onShift = todayShift?.checkIns.filter((c) => c.status !== "ABSENT").length ?? 0;
        const recentRepairs = await prisma.repairLog.findMany({
          where: access.hasExplicitScopes ? { deviceSeq: { in: Array.from(access.visibleSeqs) } } : undefined,
          orderBy: { startedAt: "desc" },
          take: 5,
          include: { device: { select: EQUIPMENT_DEVICE_SELECT } },
        });
        return ok({
          deviceCount,
          repairStatus: repairs.map((r) => ({ status: r.status, count: r._count })),
          lowStock,
          onShift,
          todayShift,
          recentRepairs: recentRepairs.map((row) => ({ ...row, device: equipmentNodeToDevice(row.device) })),
          openRepairs: repairs
            .filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS" || r.status === "WAITING_PARTS")
            .reduce((a, r) => a + r._count, 0),
        });
      }

      case "repair-frequency": {
        const grouped = await prisma.repairLog.groupBy({
          by: ["deviceSeq"],
          where: {
            ...(dateFilter ? { startedAt: dateFilter } : {}),
            ...(access.hasExplicitScopes ? { deviceSeq: { in: Array.from(access.visibleSeqs) } } : {}),
          },
          _count: true,
        });
        const devices = await prisma.equipmentNode.findMany({
          where: { seq: { in: grouped.map((g) => g.deviceSeq) } },
          select: EQUIPMENT_DEVICE_SELECT,
        });
        const map = new Map(devices.map((d) => [d.seq, d]));
        const data = grouped
          .map((g) => ({ device: g.deviceSeq, name: map.get(g.deviceSeq)?.name ?? "", count: g._count }))
          .sort((a, b) => b.count - a.count);
        return ok(data);
      }

      case "mtbf": {
        const devices = await prisma.equipmentNode.findMany({
          where: access.hasExplicitScopes ? { seq: { in: Array.from(access.visibleSeqs) } } : undefined,
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
              code: d.seq,
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
          where: {
            ...(dateFilter ? { startedAt: dateFilter } : {}),
            ...(access.hasExplicitScopes ? { deviceSeq: { in: Array.from(access.visibleSeqs) } } : {}),
          },
          include: { device: { select: { parentSeq: true } } },
        });
        const map = new Map<string, number>();
        for (const l of logs) {
          const key = l.device.parentSeq || "(Chưa đặt)";
          map.set(key, (map.get(key) ?? 0) + (l.downtime ?? 0));
        }
        return ok(Array.from(map.entries()).map(([category, downtime]) => ({ category, downtime })));
      }

      case "material-consumption": {
        const used = await prisma.equipmentMaterial.findMany({
          where: access.hasExplicitScopes ? { deviceSeq: { in: Array.from(access.visibleSeqs) } } : undefined,
          include: { material: true },
        });
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
