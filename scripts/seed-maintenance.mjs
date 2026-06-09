// Non-destructive seeding for the Preventive Maintenance feature.
// Adds a handful of MaintenancePlan rows for devices that already exist,
// WITHOUT touching any other tables. Safe to run on a populated database.
// Idempotent: skips if maintenance plans already exist.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const daysAgo = (n, hour = 8) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const daysFromNow = (n, hour = 8) => daysAgo(-n, hour);

// title + interval + due-bucket offset, matched to devices by code prefix/category.
const plans = [
  { match: "ESP", title: "Vệ sinh & kiểm tra điện cực ESP", intervalDays: 90, priority: "MEDIUM", lastDone: daysAgo(95), nextDue: daysFromNow(-5) },
  { match: "FGD", title: "Kiểm tra bơm tuần hoàn FGD", intervalDays: 30, priority: "HIGH", lastDone: daysAgo(25), nextDue: daysFromNow(5) },
  { match: "Boiler", title: "Kiểm tra van an toàn lò hơi", intervalDays: 30, priority: "CRITICAL", lastDone: daysAgo(28), nextDue: daysFromNow(2) },
  { match: "Turbine", title: "Bảo dưỡng định kỳ tuabin (đo độ rung)", intervalDays: 180, priority: "HIGH", lastDone: daysAgo(30), nextDue: daysFromNow(150) },
  { match: "I&C", title: "Hiệu chuẩn tủ điều khiển DCS", intervalDays: 365, priority: "LOW", lastDone: daysAgo(160), nextDue: daysFromNow(205) },
];

async function main() {
  const existing = await prisma.maintenancePlan.count();
  if (existing > 0) {
    console.log(`ℹ️  Đã có ${existing} kế hoạch bảo trì — bỏ qua seed.`);
    return;
  }

  const creator =
    (await prisma.user.findFirst({ where: { role: "SUPERVISOR" } })) ??
    (await prisma.user.findFirst());
  if (!creator) {
    console.error("Không tìm thấy user nào để gán createdBy. Hãy seed user trước.");
    process.exit(1);
  }
  const technicians = await prisma.user.findMany({ where: { role: "TECHNICIAN" } });

  let created = 0;
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i];
    const device = await prisma.device.findFirst({
      where: { OR: [{ category: p.match }, { code: { startsWith: p.match } }] },
      orderBy: { code: "asc" },
    });
    if (!device) {
      console.warn(`⚠️  Không có thiết bị khớp "${p.match}" — bỏ qua "${p.title}".`);
      continue;
    }
    await prisma.maintenancePlan.create({
      data: {
        deviceId: device.id,
        title: p.title,
        intervalDays: p.intervalDays,
        priority: p.priority,
        lastDoneAt: p.lastDone,
        nextDueAt: p.nextDue,
        assigneeId: technicians.length ? technicians[i % technicians.length].id : null,
        createdById: creator.id,
      },
    });
    created++;
    console.log(`✓ ${device.code} — ${p.title}`);
  }
  console.log(`✅ Đã tạo ${created} kế hoạch bảo trì định kỳ.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
