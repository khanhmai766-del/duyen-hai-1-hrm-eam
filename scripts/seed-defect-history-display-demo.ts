import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_DEVICE_SEQ = "9.1.1.99";
const DEMO_DEVICE_NAME = "Bơm dầu tuần hoàn DEMO-LS";
const DEMO_POSITION = "Máy nghiền S1";

function at(day: number, hour = 8) {
  return new Date(Date.UTC(2026, 6, day, hour, 0, 0));
}

function repairSnapshot(index: number, completedAt: Date): Prisma.InputJsonObject {
  return {
    repairOrderNumberRaw: `PCT-DEMO-${String(index).padStart(2, "0")}/2026`,
    repairSolutionRaw: `Cô lập thiết bị, kiểm tra và xử lý hạng mục demo số ${index}`,
    repairPlanRaw: `Kế hoạch sửa chữa demo đợt ${index}`,
    repairUnitRaw: "Phân xưởng Sửa chữa Cơ nhiệt",
    repairResultRaw: "Đã thực hiện xong",
    repairPerformedByRaw: `Nguyễn Văn Sửa Chữa ${index}\nTrần Văn Demo ${index}`,
    sourceCompletedAt: completedAt.toISOString(),
    repairPerformedContentRaw: `Đã kiểm tra, căn chỉnh và chạy thử thiết bị demo lần ${index}. Thông số sau sửa chữa đạt yêu cầu.`,
    repairNoteRaw: `Ghi chú sửa chữa demo ${index}: tiếp tục theo dõi trong ca vận hành.`,
  };
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { isActive: true, email: "admin@powerplant.vn" },
    select: { id: true, name: true },
  });
  if (!user) throw new Error("Không tìm thấy tài khoản demo admin@powerplant.vn");

  const parent = await prisma.equipmentNode.findUnique({
    where: { seq: "9.1.1" },
    select: { seq: true },
  });
  if (!parent) throw new Error("Không tìm thấy nhánh thiết bị demo 9.1.1");

  await prisma.equipmentNode.upsert({
    where: { seq: DEMO_DEVICE_SEQ },
    update: {
      name: DEMO_DEVICE_NAME,
      searchText: "bom dau tuan hoan demo ls",
    },
    create: {
      seq: DEMO_DEVICE_SEQ,
      parentSeq: parent.seq,
      code: DEMO_DEVICE_SEQ,
      name: DEMO_DEVICE_NAME,
      kks: "DEMO-LS-PUMP-01",
      depth: 4,
      sort: 99,
      childCount: 0,
      searchText: "bom dau tuan hoan demo ls demo-ls-pump-01",
      deviceSynced: true,
      attachedInfo: "Thiết bị demo dùng để xem mẫu khiếm khuyết và lịch sử sửa chữa.",
    },
  });
  const childCount = await prisma.equipmentNode.count({ where: { parentSeq: parent.seq } });
  await prisma.equipmentNode.update({
    where: { seq: parent.seq },
    data: { childCount },
  });

  for (let index = 1; index <= 5; index++) {
    const requestNumber = `${1900 + index}/2026`;
    await prisma.defect.upsert({
      where: { sourceKey: `DEMO-DISPLAY-DEFECT-${index}` },
      update: {
        unit: "S1",
        device: DEMO_DEVICE_SEQ,
        deviceSeq: DEMO_DEVICE_SEQ,
        mappedDeviceUnit: "S1",
        system: DEMO_POSITION,
        severity: String(((index - 1) % 4) + 1),
        condition: index % 2 ? "B" : "A",
        fireSafetyImpact: "Không",
        environmentSafetyImpact: "Không",
        requestType: "Cơ",
        requestNumber,
        content: `[DEMO] Khiếm khuyết chưa thực hiện ${index} của ${DEMO_DEVICE_NAME}`,
        status: "CHUA_XU_LY",
        detectedAt: at(30 - index, 1),
        note: "Dữ liệu demo phục vụ kiểm tra giao diện.",
        createdById: user.id,
      },
      create: {
        unit: "S1",
        device: DEMO_DEVICE_SEQ,
        deviceSeq: DEMO_DEVICE_SEQ,
        mappedDeviceUnit: "S1",
        system: DEMO_POSITION,
        severity: String(((index - 1) % 4) + 1),
        condition: index % 2 ? "B" : "A",
        fireSafetyImpact: "Không",
        environmentSafetyImpact: "Không",
        requestType: "Cơ",
        requestNumber,
        content: `[DEMO] Khiếm khuyết chưa thực hiện ${index} của ${DEMO_DEVICE_NAME}`,
        status: "CHUA_XU_LY",
        detectedAt: at(30 - index, 1),
        sourceType: "MANUAL",
        websiteCreated: false,
        sourceKey: `DEMO-DISPLAY-DEFECT-${index}`,
        note: "Dữ liệu demo phục vụ kiểm tra giao diện.",
        createdById: user.id,
      },
    });
  }

  for (let index = 1; index <= 5; index++) {
    const performedAt = at(24 - index, 3);
    await prisma.defectHistory.upsert({
      where: { id: `demo-device-history-${index}` },
      update: {
        unit: "S1",
        device: DEMO_DEVICE_SEQ,
        deviceSeq: DEMO_DEVICE_SEQ,
        mappedDeviceUnit: "S1",
        system: DEMO_POSITION,
        requestType: "Cơ",
        workOrderNumber: `PCT-DEMO-TB-${String(index).padStart(2, "0")}/2026`,
        performedAt,
        result: "Thiết bị vận hành ổn định sau sửa chữa.",
        content: `[DEMO] Lịch sử sửa chữa ${index} của ${DEMO_DEVICE_NAME}`,
        requestNumber: `${1850 + index}/2026`,
        sourceSnapshot: repairSnapshot(index, performedAt),
        images: [],
        createdById: user.id,
      },
      create: {
        id: `demo-device-history-${index}`,
        unit: "S1",
        device: DEMO_DEVICE_SEQ,
        deviceSeq: DEMO_DEVICE_SEQ,
        mappedDeviceUnit: "S1",
        system: DEMO_POSITION,
        requestType: "Cơ",
        workOrderNumber: `PCT-DEMO-TB-${String(index).padStart(2, "0")}/2026`,
        performedAt,
        result: "Thiết bị vận hành ổn định sau sửa chữa.",
        content: `[DEMO] Lịch sử sửa chữa ${index} của ${DEMO_DEVICE_NAME}`,
        requestNumber: `${1850 + index}/2026`,
        sourceKey: `DEMO-DISPLAY-HISTORY-${index}`,
        sourceSnapshot: repairSnapshot(index, performedAt),
        images: [],
        createdById: user.id,
      },
    });
  }

  const fullHistoryDate = at(28, 2);
  await prisma.defectHistory.upsert({
    where: { id: "demo-full-repair-information-history" },
    update: {
      unit: "S1",
      device: "9.1.1.1",
      deviceSeq: "9.1.1.1",
      mappedDeviceUnit: "S1",
      system: DEMO_POSITION,
      requestType: "Cơ",
      workOrderNumber: "PCT-DEMO-DAY-DU/2026",
      performedAt: fullHistoryDate,
      result: "Đã xử lý xong, chạy thử đạt yêu cầu.",
      content: "[DEMO] Phiếu lịch sử có đầy đủ thông tin của bộ phận Sửa chữa",
      requestNumber: "1899/2026",
      sourceSnapshot: repairSnapshot(99, fullHistoryDate),
      images: [],
      createdById: user.id,
    },
    create: {
      id: "demo-full-repair-information-history",
      unit: "S1",
      device: "9.1.1.1",
      deviceSeq: "9.1.1.1",
      mappedDeviceUnit: "S1",
      system: DEMO_POSITION,
      requestType: "Cơ",
      workOrderNumber: "PCT-DEMO-DAY-DU/2026",
      performedAt: fullHistoryDate,
      result: "Đã xử lý xong, chạy thử đạt yêu cầu.",
      content: "[DEMO] Phiếu lịch sử có đầy đủ thông tin của bộ phận Sửa chữa",
      requestNumber: "1899/2026",
      sourceKey: "DEMO-FULL-REPAIR-INFORMATION-HISTORY",
      sourceSnapshot: repairSnapshot(99, fullHistoryDate),
      images: [],
      createdById: user.id,
    },
  });

  console.log(JSON.stringify({
    user: user.name,
    deviceSeq: DEMO_DEVICE_SEQ,
    deviceName: DEMO_DEVICE_NAME,
    openDefects: 5,
    savedHistoriesForDevice: 5,
    fullRepairInformationHistories: 1,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
