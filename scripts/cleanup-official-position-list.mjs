import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const positionAliases = new Map([
  ["Khí Nén – Nhà Dầu", "VHV Trạm khí nén – Nhà dầu HFO 300m3"],
  ["NH3 - Lò hơi phụ", "VHV Trạm NH3 - Lò hơi phụ"],
  ["TK Lò máy", "Trưởng kíp lò máy"],
  ["Thiết bị đo lường điều khiển", "VHV Thiết bị đo lường điều khiển"],
  ["Trưởng kíp điện", "TK điện"],
  ["Trực chính Điện", "Trực chính điện"],
  ["XLN hỗn hợp", "VHV XLN hỗn hợp"],
  ["XLNT", "VHV XLN thải – Nhà dầu 5000m3"],
]);

const renamedConfigs = new Map([
  ["Thải xỉ", "Thải xỉ"],
  ["Trạm bơm nước thô", "Trạm bơm nước thô"],
]);

const unusedDemoConfigs = [
  "Thiết bị đo lường điều khiển",
  "Trực phụ điện , Trực phụ điện đào tạo cương vị Trực chính điện",
];

await prisma.$transaction(async (tx) => {
  for (const [from, to] of renamedConfigs) {
    await tx.shiftPositionConfig.updateMany({
      where: { name: from },
      data: { name: to },
    });
  }

  for (const [from, to] of positionAliases) {
    await tx.user.updateMany({
      where: { position: from },
      data: { position: to },
    });
  }

  for (const name of unusedDemoConfigs) {
    const config = await tx.shiftPositionConfig.findUnique({ where: { name } });
    if (!config) continue;
    const [assignmentCount, scheduleCount, crewRotationCount] = await Promise.all([
      tx.shiftStaffingAssignment.count({ where: { positionId: config.id } }),
      tx.shiftScheduleEntry.count({ where: { positionConfigId: config.id } }),
      tx.crewRotationConfig.count({ where: { positionConfigId: config.id } }),
    ]);
    if (assignmentCount || scheduleCount || crewRotationCount) {
      throw new Error(`Không thể xóa cương vị ${name} vì đang được sử dụng`);
    }
    await tx.positionRotationAssignment.deleteMany({
      where: { positionConfigId: config.id },
    });
    await tx.shiftPositionConfig.delete({ where: { id: config.id } });
  }
});

console.log("Đã chuẩn hóa danh sách cương vị chính thức và xóa cấu hình demo rỗng.");
await prisma.$disconnect();
