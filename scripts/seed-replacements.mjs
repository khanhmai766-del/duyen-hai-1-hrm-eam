// Non-destructive seeding for the material-replacement tracking feature.
// Adds a few MaterialReplacement points (mixed due buckets) for existing
// materials/devices WITHOUT touching anything else. Idempotent.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const daysFromNow = (n, hour = 8) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const monthsAgo = (m) => {
  const d = new Date();
  d.setMonth(d.getMonth() - m);
  d.setHours(8, 0, 0, 0);
  return d;
};

async function main() {
  const existing = await prisma.materialReplacement.count();
  if (existing > 0) {
    console.log(`ℹ️  Đã có ${existing} điểm thay thế — bỏ qua seed.`);
    return;
  }

  const creator =
    (await prisma.user.findFirst({ where: { role: "SUPERVISOR" } })) ??
    (await prisma.user.findFirst());
  if (!creator) {
    console.error("Không tìm thấy user nào. Hãy seed user trước.");
    process.exit(1);
  }

  const materials = await prisma.material.findMany({ orderBy: { code: "asc" }, take: 4 });
  if (!materials.length) {
    console.error("Không có vật tư nào để gắn điểm thay thế.");
    process.exit(1);
  }
  const devices = await prisma.device.findMany({ orderBy: { code: "asc" }, take: 6 });

  // (intervalMonths, intervalNote, nextDueAt, lastReplacedAt, location)
  const plans = [
    { intervalMonths: 6, intervalNote: "2500h", nextDue: daysFromNow(-10), last: monthsAgo(6), location: "Trạm dầu ĐCC Máy Nghiền" },
    { intervalMonths: 3, intervalNote: null, nextDue: daysFromNow(20), last: monthsAgo(2), location: "HGT động cơ xích cào" },
    { intervalMonths: 12, intervalNote: null, nextDue: daysFromNow(5), last: monthsAgo(11), location: "Trạm dầu LP-HP" },
    { intervalMonths: 6, intervalNote: "băng tải", nextDue: daysFromNow(120), last: monthsAgo(1), location: "HGT động cơ băng tải" },
    { intervalMonths: 12, intervalNote: null, nextDue: daysFromNow(-3), last: monthsAgo(12), location: "HGT động cơ vận thùng" },
  ];

  let created = 0;
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i];
    const material = materials[i % materials.length];
    // Alternate between linking a device and using a free-text location.
    const useDevice = devices.length && i % 2 === 0;
    await prisma.materialReplacement.create({
      data: {
        materialId: material.id,
        deviceId: useDevice ? devices[i % devices.length].id : null,
        location: useDevice ? null : p.location,
        intervalMonths: p.intervalMonths,
        intervalNote: p.intervalNote,
        lastReplacedAt: p.last,
        nextDueAt: p.nextDue,
        createdById: creator.id,
      },
    });
    created++;
    console.log(`✓ ${material.code} → ${useDevice ? devices[i % devices.length].code : p.location}`);
  }
  console.log(`✅ Đã tạo ${created} điểm thay thế vật tư.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
