/**
 * Đo hiệu năng các đường dữ liệu của mục Quản lý vật tư.
 *
 *   npx tsx scripts/bench-vat-tu.ts [năm] [kỳ YYYY-MM] [số vòng]
 *
 * In ra THỜI GIAN và SỐ TRUY VẤN của từng hàm. Số truy vấn mới là con số đáng tin khi chạy
 * trên DB dev (dữ liệu vật tư thật nằm trên prod — xem CLAUDE.md), vì nó phản ánh đúng hình
 * dạng thuật toán chứ không phụ thuộc quy mô dữ liệu.
 *
 * Vòng 2 trở đi đo luôn hiệu quả của bộ nhớ đệm theo năm (lib/material-annual-plan-cache.ts):
 * số truy vấn phải tụt về 0 nếu cache còn hạn.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: [{ emit: "event", level: "query" }] });

let queryCount = 0;
const queries: Array<{ ms: number; sql: string }> = [];
prisma.$on("query" as never, ((event: { query: string; duration: number }) => {
  queryCount += 1;
  queries.push({ ms: event.duration, sql: event.query });
}) as never);

async function measure(label: string, fn: () => Promise<unknown>) {
  queryCount = 0;
  queries.length = 0;
  const startedAt = Date.now();
  try {
    await fn();
  } catch (error) {
    console.log(`${label.padEnd(36)} LỖI: ${(error as Error).message.slice(0, 90)}`);
    return;
  }
  const ms = Date.now() - startedAt;
  console.log(`${label.padEnd(36)} ${String(ms).padStart(6)} ms | ${String(queryCount).padStart(3)} truy vấn`);
  for (const row of [...queries].sort((a, b) => b.ms - a.ms).slice(0, 3)) {
    console.log(`   ${String(row.ms).padStart(5)}ms  ${row.sql.replace(/\s+/g, " ").slice(0, 104)}`);
  }
}

async function main() {
  const year = Number(process.argv[2] ?? new Date().getFullYear());
  const periodKey = process.argv[3] ?? `${year}-08`;
  const rounds = Number(process.argv[4] ?? 2);

  const [materials, points, logs, lots, tickets, plans, requests, editAudit] = await Promise.all([
    prisma.material.count(),
    prisma.materialReplacement.count(),
    prisma.materialReplacementLog.count(),
    prisma.materialStockLot.count(),
    prisma.materialTicket.count(),
    prisma.materialAnnualPlan.count(),
    prisma.materialMonthlyRequest.count(),
    prisma.auditLog.count({ where: { entity: "MaterialTicket", action: "MT_EDIT_STEP" } }),
  ]);
  console.log("Quy mô DB:", JSON.stringify({
    Material: materials, MaterialReplacement: points, MaterialReplacementLog: logs,
    MaterialStockLot: lots, MaterialTicket: tickets, MaterialAnnualPlan: plans,
    MaterialMonthlyRequest: requests, "AuditLog(MT_EDIT_STEP)": editAudit,
  }));

  const { getMaterialAnnualPlanSummary } = await import("../lib/material-annual-plan-summary");
  const { getMaterialMonthlyReport } = await import("../lib/material-monthly-report");
  const { getMaterialAnnualForecast } = await import("../lib/material-annual-forecast");
  const { getAnnualSummary } = await import("../lib/chemical-inventory/queries");

  for (let round = 1; round <= rounds; round += 1) {
    console.log(`\n--- Vòng ${round}${round > 1 ? " (kỳ vọng dùng cache)" : " (cache rỗng)"} ---`);
    await measure("getAnnualSummary (hóa chất)", () => getAnnualSummary(prisma, year));
    await measure("getMaterialAnnualPlanSummary", () => getMaterialAnnualPlanSummary(prisma, year));
    await measure("getMaterialMonthlyReport", () =>
      getMaterialMonthlyReport(prisma, { periodKey, year, month: Number(periodKey.slice(5, 7)) }));
    await measure("getMaterialAnnualForecast", () => getMaterialAnnualForecast(prisma, year + 1));
  }

  console.log("\n--- Đường vào hai màn nặng nhất ---");
  await measure("materials: tập SYC đã ghi lịch sử", async () => {
    const processed = await prisma.defect.findMany({
      where: { status: "DA_XU_LY", cancelledAt: null },
      select: { id: true },
      take: 500,
    });
    await prisma.materialReplacementLog.findMany({
      where: { defectId: { in: processed.map((row) => row.id) } },
      distinct: ["defectId"],
      select: { defectId: true },
    });
  });
  await measure("material-tickets: 1 tháng", async () => {
    const month = periodKey;
    await prisma.materialTicket.findMany({
      where: { sequenceMonth: month },
      orderBy: [{ sequenceMonth: "desc" }, { sequenceScope: "asc" }, { sequenceNumber: "desc" }],
      take: 500,
      include: {
        items: {
          include: {
            material: { select: { id: true, code: true, name: true, unit: true, quantity: true } },
            device: { select: { seq: true, name: true, kks: true } },
          },
        },
      },
    });
  });

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
