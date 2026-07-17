import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const positions = [
  ["Trưởng ca", "SINGLE", 1, null, false],
  ["TK Lò máy", "SINGLE", 1, null, false],
  ["Lò Trưởng", "S1_S2", 2, "ĐT - Lò Trưởng", false],
  ["Lò phó", "S1_S2", 2, "ĐT - Lò phó", false],
  ["Máy trưởng", "S1_S2", 2, null, false],
  ["Trợ thủ", "S1_S2", 2, null, false],
  ["Máy nghiền", "S1_S2", 2, null, false],
  ["Máy phó", "S1_S2", 2, null, false],
  ["Trạm bơm tuần hoàn", "SINGLE", 1, null, false],
  ["Trạm bơm nước thô", "SINGLE", 1, null, false],
  ["Trưởng kíp điện", "SINGLE", 1, null, false],
  ["Trực chính Điện", "SINGLE", 1, null, false],
  ["Trực phụ điện", "SINGLE", 1, "ĐT - Trực phụ điện", false],
  ["Thải xỉ", "SINGLE", 1, null, false],
  ["ESP", "S1_S2", 2, "ĐT - ESP", false],
  ["FGD", "S1_S2", 2, null, false],
  ["Khí Nén – Nhà Dầu", "SINGLE", 1, null, false],
  ["XLN hỗn hợp", "SINGLE", 1, null, false],
  ["XLNT", "SINGLE", 1, null, false],
  ["NH3 - Lò hơi phụ", "SINGLE", 1, null, false],
  ["Thiết bị đo lường điều khiển", "S1_S2", 2, "Đào tạo - Thiết bị đo lường điều khiển", true],
];

const renamedPositions = new Map([
  ["Trưởng kíp lò máy", "TK Lò máy"],
  ["Lò trưởng", "Lò Trưởng"],
  ["TK điện", "Trưởng kíp điện"],
  ["Trực chính điện", "Trực chính Điện"],
  ["VHV Trạm khí nén – Nhà dầu HFO 300m3", "Khí Nén – Nhà Dầu"],
  ["VHV XLN hỗn hợp", "XLN hỗn hợp"],
  ["VHV XLN thải – Nhà dầu 5000m3", "XLNT"],
  ["VHV Trạm NH3 - Lò hơi phụ", "NH3 - Lò hơi phụ"],
  ["VHV Thiết bị đo lường điều khiển", "Thiết bị đo lường điều khiển"],
]);

try {
  const actor = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!actor) throw new Error("Không tìm thấy tài khoản ADMIN đang hoạt động để ghi nhận người khởi tạo");

  const existingRows = await prisma.shiftPositionConfig.findMany({ select: { id: true, name: true } });
  const existing = new Set(existingRows.map((item) => item.name));
  const renames = [];
  for (const [from, to] of renamedPositions) {
    if (!existing.has(from)) continue;
    if (existing.has(to)) throw new Error(`Đang tồn tại đồng thời “${from}” và “${to}”; cần kiểm tra thủ công trước khi gộp`);
    renames.push([from, to]);
    existing.delete(from);
    existing.add(to);
  }
  const missing = positions.filter(([name]) => !existing.has(name));
  console.log(`Sẽ đổi tên ${renames.length} cấu hình và bổ sung ${missing.length}/${positions.length} cương vị chuẩn.`);
  for (const [from, to] of renames) console.log(`~ ${from} → ${to}`);
  for (const [name] of missing) console.log(`- ${name}`);

  if (!apply) {
    console.log("Chưa thay đổi dữ liệu. Chạy lại với --apply để bổ sung các cương vị còn thiếu.");
    process.exit(0);
  }

  await prisma.$transaction(async (tx) => {
    for (const [from, to] of renames) {
      await tx.shiftPositionConfig.update({ where: { name: from }, data: { name: to, updatedById: actor.id } });
    }
    for (const [name, positionType, required, trainingRowName, showTrainingRow] of missing) {
      await tx.shiftPositionConfig.create({
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
      });
    }
  });
  console.log(`Đã đổi tên ${renames.length} và bổ sung ${missing.length} cương vị; ID cùng dữ liệu liên kết được giữ nguyên.`);
} finally {
  await prisma.$disconnect();
}
