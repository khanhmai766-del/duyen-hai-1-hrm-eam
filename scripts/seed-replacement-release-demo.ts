/**
 * Dữ liệu DEMO cho vòng đời "điểm theo dõi ↔ SYC thay thế vật tư" trên máy dev.
 *
 *   npx tsx scripts/seed-replacement-release-demo.ts          # tạo / tạo lại
 *   npx tsx scripts/seed-replacement-release-demo.ts --revert # hoàn tác phiếu B
 *   npx tsx scripts/seed-replacement-release-demo.ts --status # xem trạng thái
 *   npx tsx scripts/seed-replacement-release-demo.ts --clean  # xoá sạch dữ liệu demo
 *
 * Mọi bản ghi đều mang tiền tố [DEMO] / mã DEMO-REL-* nên --clean gỡ đúng phần
 * này, không đụng dữ liệu khác trong DB dev.
 *
 * Dựng sẵn HAI phiếu để quan sát hai nửa của vòng đời:
 *   A — phiếu thường (websiteCreated=false): hoàn thành là ghi thẳng DefectHistory.
 *       Dùng để xem điểm được GIẢI PHÓNG.
 *   B — phiếu có đồng bộ Sheet (websiteCreated=true): hoàn thành chỉ tạo bản chờ chốt.
 *       Dùng để xem điểm được GẮN LẠI khi bản chờ bị huỷ (--revert).
 */
import { PrismaClient } from "@prisma/client";
import { revertMaterialRequestReplacements } from "@/lib/defect-material-request";

const prisma = new PrismaClient();

const MATERIAL_CODE = "DEMO-REL-001";
const MACHINE = "S1";
const POSITION = "Trưởng kíp điện";
const REQ_A = "9901/2026";
const REQ_B = "9902/2026";

/** Hai thiết bị lá có thật trên cây S1, cùng một hệ thống cha. */
const POINTS = [
  { deviceSeq: "DH1.S1.3.1.1.1.1", tag: "A", requestNumber: REQ_A, websiteCreated: false },
  { deviceSeq: "DH1.S1.3.1.1.1.2", tag: "B", requestNumber: REQ_B, websiteCreated: true },
];

function monthsFromNow(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d;
}

async function clean() {
  const material = await prisma.material.findFirst({ where: { code: MATERIAL_CODE, machine: MACHINE } });
  const defects = await prisma.defect.findMany({
    where: { requestNumber: { in: [REQ_A, REQ_B] } },
    select: { id: true },
  });
  const defectIds = defects.map((d) => d.id);

  if (defectIds.length) {
    await prisma.materialReplacementLog.deleteMany({ where: { defectId: { in: defectIds } } });
    await prisma.defectHistoryPending.deleteMany({ where: { defectId: { in: defectIds } } });
    await prisma.defectHistory.deleteMany({ where: { defectId: { in: defectIds } } });
    await prisma.defectSyncOutbox.deleteMany({ where: { defectId: { in: defectIds } } });
    // DefectMaterialRequest + DefectRelatedDevice cascade theo Defect.
    await prisma.defect.deleteMany({ where: { id: { in: defectIds } } });
  }
  if (material) {
    // Log của chính vật tư này (nếu có dòng không gắn defectId) phải đi trước điểm.
    await prisma.materialReplacementLog.deleteMany({ where: { materialId: material.id } });
    await prisma.materialReplacement.deleteMany({ where: { materialId: material.id } });
    await prisma.material.delete({ where: { id: material.id } });
  }
  console.log(`Đã dọn: ${defectIds.length} phiếu, vật tư ${material ? MATERIAL_CODE : "(không có)"}.`);
}

async function seed() {
  await clean();

  const author = await prisma.user.findFirstOrThrow({ where: { email: "admin@powerplant.vn" }, select: { id: true } });
  const nodes = await prisma.equipmentNode.findMany({
    where: { seq: { in: POINTS.map((p) => p.deviceSeq) } },
    select: { seq: true, name: true, parentSeq: true },
  });
  if (nodes.length !== POINTS.length) throw new Error("Thiếu thiết bị trên cây, kiểm tra lại mã seq");
  const parent = await prisma.equipmentNode.findUnique({
    where: { seq: nodes[0].parentSeq! },
    select: { name: true },
  });
  const systemLabel = parent?.name ?? "KHUNG STATOR";

  const material = await prisma.material.create({
    data: {
      code: MATERIAL_CODE,
      erpCodes: [MATERIAL_CODE],
      name: "[DEMO] Dầu làm mát máy phát — thử vòng đời điểm theo dõi",
      unit: "Lít",
      quantity: 40,
      minStock: 0,
      machine: MACHINE,
      category: "Dầu bôi trơn",
      system: systemLabel,
      note: "Dữ liệu DEMO — xoá bằng scripts/seed-replacement-release-demo.ts --clean",
    },
  });

  for (const point of POINTS) {
    const node = nodes.find((n) => n.seq === point.deviceSeq)!;
    const common = {
      materialId: material.id,
      deviceSeq: point.deviceSeq,
      machine: MACHINE,
      system: systemLabel,
      location: node.name,
      managingPosition: POSITION,
      quantity: 4,
      intervalMonths: 6,
      intervalNote: "1000 giờ",
      createdById: author.id,
    };

    // 1) DÒNG KHAI BÁO — isActive=false, chưa có lịch sử. Đây là dòng hiện trong
    //    bảng "Chi tiết điểm thay thế" của Danh mục vật tư.
    const declaration = await prisma.materialReplacement.create({
      data: { ...common, deviceCount: 1, isActive: false, nextDueAt: monthsFromNow(6) },
    });

    // 2) ĐIỂM THEO DÕI — isActive=true, tức là cột "Theo dõi" đang hiện "Đang theo dõi".
    await prisma.materialReplacement.create({
      data: {
        ...common,
        deviceCount: 1,
        isActive: true,
        lastReplacedAt: monthsFromNow(-5),
        nextDueAt: monthsFromNow(1),
        note: "[DEMO] điểm đang theo dõi",
      },
    });

    // 3) SYC thay thế vật tư đã ra cho chính điểm khai báo đó.
    const defect = await prisma.defect.create({
      data: {
        unit: MACHINE,
        deviceSeq: point.deviceSeq,
        mappedDeviceUnit: MACHINE,
        device: point.deviceSeq,
        system: POSITION,
        severity: "3",
        condition: "B",
        requestType: "Điện",
        requestNumber: point.requestNumber,
        content: `Thay thế ${material.name} — 4 Lít tại ${systemLabel} · ${node.name} (chu kỳ 6 tháng).`,
        status: "CHUA_XU_LY",
        detectedAt: new Date(),
        sourceType: "MANUAL",
        websiteCreated: point.websiteCreated,
        isMaterialRequest: true,
        createdById: author.id,
      },
    });

    await prisma.defectMaterialRequest.create({
      data: {
        defectId: defect.id,
        replacementId: declaration.id,
        materialId: material.id,
        quantity: 4,
        unitLabel: material.unit,
        pointLabel: `${systemLabel} · ${node.name}`,
      },
    });

    console.log(`  ✓ ${point.tag}: ${node.name} — SYC ${point.requestNumber} (websiteCreated=${point.websiteCreated})`);
  }

  console.log(`\nĐã tạo vật tư ${MATERIAL_CODE} + 2 điểm khai báo + 2 điểm đang theo dõi + 2 SYC.`);
}

/**
 * Mô phỏng "bản chờ chốt bị huỷ": Sheet trả trạng thái phiếu về chưa xử lý, tới lượt
 * cron chốt lịch sử thì phiếu không còn đủ điều kiện → nhánh CANCELLED chạy.
 *
 * Chạy ĐÚNG các bước của nhánh đó nhưng chỉ cho một phiếu, thay vì gọi
 * finalizePendingDefectHistories(): hàm ấy quét toàn bộ bản chờ đã tới hạn nên sẽ
 * chốt lây cả những phiếu khác đang nằm sẵn trong DB dev.
 */
async function revert() {
  const defect = await prisma.defect.findFirst({
    where: { requestNumber: REQ_B },
    include: { pendingHistory: { select: { id: true } } },
  });
  if (!defect) throw new Error(`Không tìm thấy phiếu ${REQ_B} — chạy seed trước`);
  if (!defect.pendingHistory) {
    throw new Error(`Phiếu ${REQ_B} chưa có bản chờ chốt. Hãy hoàn thành phiếu trên UI (nhớ tick "Ghi nhận đã thay thế vật tư") rồi chạy lại.`);
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.defectHistoryPending.delete({ where: { id: defect.pendingHistory!.id } });
    await tx.defect.update({
      where: { id: defect.id },
      data: {
        status: "CHUA_XU_LY",
        completedAt: null,
        confirmedAt: null,
        confirmedById: null,
        confirmedByName: null,
        confirmedHistoryId: null,
      },
    });
    return revertMaterialRequestReplacements(tx, { defectId: defect.id });
  });

  console.log("Kết quả hoàn tác:", result);
  console.log(`\n→ Phiếu ${REQ_B} quay về "Chưa xử lý", điểm theo dõi được gắn lại.`);
}

async function status() {
  const material = await prisma.material.findFirst({
    where: { code: MATERIAL_CODE, machine: MACHINE },
    select: { id: true, unit: true },
  });
  if (!material) return console.log("Chưa có dữ liệu demo — chạy script không kèm cờ để tạo.");

  for (const point of POINTS) {
    const rows = await prisma.materialReplacement.findMany({
      where: { materialId: material.id, deviceSeq: point.deviceSeq },
      select: { isActive: true, _count: { select: { logs: true } } },
    });
    const active = rows.filter((r) => r.isActive).length;
    const declarations = rows.filter((r) => !r.isActive && r._count.logs === 0).length;
    const defect = await prisma.defect.findFirst({
      where: { requestNumber: point.requestNumber },
      select: { status: true, confirmedAt: true, pendingHistory: { select: { finalizeAt: true } } },
    });
    const logs = await prisma.materialReplacementLog.count({
      where: { materialId: material.id, deviceSeq: point.deviceSeq },
    });
    console.log(
      `${point.tag} (${point.deviceSeq}) — SYC ${point.requestNumber}: ${defect?.status ?? "?"}` +
        `${defect?.pendingHistory ? " (chờ chốt)" : ""}\n` +
        `    cột Theo dõi: ${active > 0 ? "Đang theo dõi" : "Thêm điểm"}` +
        ` | dòng khai báo: ${declarations} | lịch sử thay thế: ${logs}`
    );
  }
}

const mode = process.argv[2] ?? "";
const run =
  mode === "--clean" ? clean : mode === "--revert" ? revert : mode === "--status" ? status : seed;

run()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
