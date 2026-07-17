import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const positions = [
  ["Trưởng ca", "SINGLE", 1, null, false],
  ["Trưởng kíp lò máy", "SINGLE", 1, null, false],
  ["Lò trưởng", "S1_S2", 2, "ĐT - Lò trưởng", false],
  ["Lò phó", "S1_S2", 2, "ĐT - Lò phó", false],
  ["Máy trưởng", "S1_S2", 2, null, false],
  ["Trợ thủ", "S1_S2", 2, null, false],
  ["Máy nghiền", "S1_S2", 2, null, false],
  ["Máy phó", "S1_S2", 2, null, false],
  ["Trạm bơm tuần hoàn", "SINGLE", 1, null, false],
  ["Trạm bơm nước thô", "SINGLE", 1, null, false],
  ["TK điện", "SINGLE", 1, null, false],
  ["Trực chính điện", "SINGLE", 1, null, false],
  ["Trực phụ điện", "SINGLE", 1, "ĐT - Trực phụ điện", false],
  ["Thải xỉ", "SINGLE", 1, null, false],
  ["ESP", "S1_S2", 2, "ĐT - ESP", false],
  ["FGD", "S1_S2", 2, null, false],
  ["VHV Trạm khí nén – Nhà dầu HFO 300m3", "SINGLE", 1, null, false],
  ["VHV XLN hỗn hợp", "SINGLE", 1, null, false],
  ["VHV XLN thải – Nhà dầu 5000m3", "SINGLE", 1, null, false],
  ["VHV Trạm NH3 - Lò hơi phụ", "SINGLE", 1, null, false],
  ["VHV Thiết bị đo lường điều khiển", "S1_S2", 2, "Đào tạo - Thiết bị đo lường điều khiển", true],
];

try {
  const actor = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!actor) throw new Error("Không tìm thấy tài khoản ADMIN đang hoạt động để ghi nhận người khởi tạo");

  const existing = new Set((await prisma.shiftPositionConfig.findMany({ select: { name: true } })).map((item) => item.name));
  const missing = positions.filter(([name]) => !existing.has(name));
  console.log(`Đã có ${existing.size} cấu hình; còn thiếu ${missing.length}/${positions.length} cương vị chuẩn.`);
  for (const [name] of missing) console.log(`- ${name}`);

  if (!apply) {
    console.log("Chưa thay đổi dữ liệu. Chạy lại với --apply để bổ sung các cương vị còn thiếu.");
    process.exit(0);
  }

  await prisma.$transaction(
    missing.map(([name, positionType, required, trainingRowName, showTrainingRow]) =>
      prisma.shiftPositionConfig.create({
        data: {
          name,
          positionType,
          requiredMorningStaff: required,
          requiredAfternoonStaff: required,
          requiredNightStaff: required,
          trainingRowName,
          showTrainingRow,
          isActive: true,
          createdById: actor.id,
          updatedById: actor.id,
        },
      }),
    ),
  );
  console.log(`Đã bổ sung ${missing.length} cương vị. Các cấu hình có sẵn được giữ nguyên.`);
} finally {
  await prisma.$disconnect();
}
