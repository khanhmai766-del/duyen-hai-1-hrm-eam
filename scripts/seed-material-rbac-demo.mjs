// Dữ liệu mẫu không phá huỷ để kiểm tra Danh mục vật tư theo phạm vi RBAC thiết bị.
// Chạy lại an toàn: vật tư, phạm vi và dòng khai báo đều được cập nhật/tái sử dụng.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MACHINE = "S1";
const CATEGORY = "Dầu bôi trơn";
const DEMO_NOTE = "Dữ liệu mẫu kiểm tra lọc RBAC danh mục vật tư";

const samples = [
  {
    code: "DEMO-RBAC-LO-001",
    name: "[RBAC] Dầu hộp giảm tốc khối Lò",
    branchSeq: "DH1.S1.1",
    managingPosition: "Lò trưởng S1",
    quantity: 18,
    minStock: 24,
  },
  {
    code: "DEMO-RBAC-TB-001",
    name: "[RBAC] Dầu bôi trơn thiết bị Tuabin",
    branchSeq: "DH1.S1.2",
    managingPosition: "Máy trưởng S1",
    quantity: 12,
    minStock: 20,
  },
  {
    code: "DEMO-RBAC-DIEN-001",
    name: "[RBAC] Dầu cách điện thiết bị điện",
    branchSeq: "DH1.S1.3",
    managingPosition: "Trưởng kíp điện",
    quantity: 8,
    minStock: 16,
  },
];

const scopeTemplates = [
  { email: "lotruong.s1@powerplant.vn", fallbackPosition: "Lò trưởng S1", systemSeq: "DH1.S1.1", access: "edit" },
  { email: "lotruong.s1@powerplant.vn", fallbackPosition: "Lò trưởng S1", systemSeq: "DH1.S1.2", access: "view" },
  { email: "maytruong.s1@powerplant.vn", fallbackPosition: "Máy trưởng S1", systemSeq: "DH1.S1.2", access: "edit" },
  { email: "dien.kip@powerplant.vn", fallbackPosition: "Trưởng kíp điện", systemSeq: "DH1.S1.3", access: "view" },
];

async function demoDevice(branchSeq) {
  return prisma.equipmentNode.findFirst({
    where: {
      seq: { startsWith: `${branchSeq}.` },
      parentSeq: { not: null },
      childCount: 0,
    },
    orderBy: [{ depth: "asc" }, { sort: "asc" }],
    select: { seq: true, name: true, parentSeq: true },
  });
}

async function main() {
  const creator =
    (await prisma.user.findUnique({ where: { email: "admin@powerplant.vn" } })) ??
    (await prisma.user.findFirst({ where: { isActive: true } }));
  if (!creator) throw new Error("Không tìm thấy tài khoản để tạo dữ liệu mẫu");

  const scopeSamples = [];
  for (const template of scopeTemplates) {
    const account = await prisma.user.findUnique({
      where: { email: template.email },
      select: { position: true },
    });
    const position = account?.position?.trim() || template.fallbackPosition;
    // Dọn duy nhất scope nhãn fallback do lần chạy demo cũ tạo nếu DB local đang
    // dùng nhãn cương vị khác (ví dụ dữ liệu seed cũ bị lỗi mã hóa).
    if (position !== template.fallbackPosition) {
      await prisma.positionSystemScope.deleteMany({
        where: {
          position: template.fallbackPosition,
          systemSeq: template.systemSeq,
        },
      });
    }
    const scope = {
      position,
      systemSeq: template.systemSeq,
      access: template.access,
    };
    await prisma.positionSystemScope.upsert({
      where: {
        position_systemSeq: {
          position: scope.position,
          systemSeq: scope.systemSeq,
        },
      },
      update: { access: scope.access },
      create: scope,
    });
    scopeSamples.push(scope);
  }

  const created = [];
  for (const sample of samples) {
    const device = await demoDevice(sample.branchSeq);
    if (!device) throw new Error(`Không tìm thấy thiết bị mẫu dưới nhánh ${sample.branchSeq}`);

    const parent = device.parentSeq
      ? await prisma.equipmentNode.findUnique({
          where: { seq: device.parentSeq },
          select: { name: true },
        })
      : null;
    const material = await prisma.material.upsert({
      where: { code_machine: { code: sample.code, machine: MACHINE } },
      update: {
        name: sample.name,
        unit: "Lít",
        category: CATEGORY,
        quantity: sample.quantity,
        minStock: sample.minStock,
        erpCodes: [sample.code],
        note: DEMO_NOTE,
      },
      create: {
        code: sample.code,
        erpCodes: [sample.code],
        name: sample.name,
        unit: "Lít",
        machine: MACHINE,
        category: CATEGORY,
        quantity: sample.quantity,
        minStock: sample.minStock,
        note: DEMO_NOTE,
      },
    });

    const declaration = await prisma.materialReplacement.findFirst({
      where: { materialId: material.id, isActive: false, note: DEMO_NOTE },
      select: { id: true },
    });
    const declarationData = {
      deviceSeq: device.seq,
      machine: MACHINE,
      location: device.name,
      system: parent?.name ?? null,
      managingPosition: sample.managingPosition,
      quantity: 4,
      deviceCount: 1,
      intervalMonths: 6,
      nextDueAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      note: DEMO_NOTE,
    };
    if (declaration) {
      await prisma.materialReplacement.update({
        where: { id: declaration.id },
        data: declarationData,
      });
    } else {
      await prisma.materialReplacement.create({
        data: {
          ...declarationData,
          materialId: material.id,
          isActive: false,
          createdById: creator.id,
        },
      });
    }
    created.push({ code: material.code, deviceSeq: device.seq, branch: sample.branchSeq });
  }

  console.log(JSON.stringify({ scopes: scopeSamples, materials: created }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
