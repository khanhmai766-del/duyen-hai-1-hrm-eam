import { PrismaClient, Role, ShiftType, RepairStatus, Priority } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Deterministic helpers (avoid Math.random for reproducible seeds)
function daysAgo(n: number, hour = 8): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}
function atToday(hour: number, min = 0): Date {
  const d = new Date();
  d.setHours(hour, min, 0, 0);
  return d;
}

async function main() {
  console.log("ðŸŒ± Seeding PowerPlant EAM database...");

  // ---- Clean (order matters for FKs) ----
  await prisma.operationEvent.deleteMany();
  await prisma.defect.deleteMany();
  await prisma.materialReplacementLog.deleteMany();
  await prisma.materialReplacement.deleteMany();
  await prisma.equipmentMaterial.deleteMany();
  await prisma.repairLog.deleteMany();
  await prisma.checkIn.deleteMany();
  await prisma.shiftHandover.deleteMany();
  await prisma.shiftAssignment.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.material.deleteMany();
  await prisma.user.deleteMany();

  const pw = await bcrypt.hash("password123", 10);

  // ---- Users ----
  const usersData = [
    { name: "Nguyá»…n VÄƒn HÃ¹ng", employeeId: "NV001", email: "admin@powerplant.vn", phone: "0901234567", role: Role.ADMIN, position: "Quáº£n Ä‘á»‘c phÃ¢n xÆ°á»Ÿng", department: "Váº­n hÃ nh" },
    { name: "Tráº§n Thá»‹ Mai", employeeId: "NV002", email: "supervisor@powerplant.vn", phone: "0902345678", role: Role.SUPERVISOR, position: "TrÆ°á»Ÿng ca", department: "Váº­n hÃ nh 1" },
    { name: "LÃª Minh Tuáº¥n", employeeId: "NV003", email: "tech@powerplant.vn", phone: "0903456789", role: Role.TECHNICIAN, position: "Ká»¹ thuáº­t viÃªn I&C", department: "Ká»¹ thuáº­t" },
    { name: "Pháº¡m Thu HÃ ", employeeId: "NV004", email: "viewer@powerplant.vn", phone: "0904567890", role: Role.VIEWER, position: "NhÃ¢n viÃªn vÄƒn phÃ²ng", department: "HÃ nh chÃ­nh" },
    { name: "HoÃ ng Äá»©c Anh", employeeId: "NV005", email: "lotruong.s1@powerplant.vn", phone: "0905111222", role: Role.TECHNICIAN, position: "LÃ² trÆ°á»Ÿng S1", department: "Váº­n hÃ nh 1" },
    { name: "VÅ© Quá»‘c Báº£o", employeeId: "NV006", email: "maytruong.s1@powerplant.vn", phone: "0905222333", role: Role.TECHNICIAN, position: "MÃ¡y trÆ°á»Ÿng S1", department: "Váº­n hÃ nh 1" },
    { name: "Äáº·ng VÄƒn CÆ°á»ng", employeeId: "NV007", email: "tktruong@powerplant.vn", phone: "0905333444", role: Role.SUPERVISOR, position: "TrÆ°á»Ÿng kÃ­p LÃ² - MÃ¡y", department: "Váº­n hÃ nh 1" },
    { name: "BÃ¹i Thá»‹ Dung", employeeId: "NV008", email: "dien.kip@powerplant.vn", phone: "0905444555", role: Role.TECHNICIAN, position: "TrÆ°á»Ÿng kÃ­p Ä‘iá»‡n", department: "Äiá»‡n" },
    { name: "NgÃ´ VÄƒn Em", employeeId: "NV009", email: "ic1@powerplant.vn", phone: "0905555666", role: Role.TECHNICIAN, position: "I&C", department: "Ká»¹ thuáº­t" },
    { name: "DÆ°Æ¡ng Thá»‹ Hoa", employeeId: "NV010", email: "vh2@powerplant.vn", phone: "0905666777", role: Role.TECHNICIAN, position: "Váº­n hÃ nh viÃªn", department: "Váº­n hÃ nh 2" },
  ];

  const users = [];
  for (const u of usersData) {
    users.push(
      await prisma.user.create({
        data: {
          ...u,
          passwordHash: pw,
          passwordChangedAt: new Date(),
          avatarUrl: null,
          isActive: true,
        },
      })
    );
  }
  console.log(`âœ“ ${users.length} users`);

  // ---- Shifts ----
  const shiftToday = await prisma.shift.create({
    data: { date: daysAgo(0), shiftType: ShiftType.AFTERNOON, unit: "Váº­n hÃ nh 1" },
  });
  const shiftTomorrow = await prisma.shift.create({
    data: { date: daysAgo(-1), shiftType: ShiftType.MORNING, unit: "Váº­n hÃ nh 2" },
  });
  console.log("âœ“ 2 shifts");

  // ---- Shift assignments (org chart hierarchy) for today's shift ----
  const tc = await prisma.shiftAssignment.create({
    data: { shiftId: shiftToday.id, userId: users[1].id, positionLabel: "TrÆ°á»Ÿng ca", parentId: null, isApproved: true },
  });
  const tkip = await prisma.shiftAssignment.create({
    data: { shiftId: shiftToday.id, userId: users[6].id, positionLabel: "TrÆ°á»Ÿng kÃ­p LÃ² - MÃ¡y DH1", parentId: tc.id, isApproved: true },
  });
  await prisma.shiftAssignment.createMany({
    data: [
      { shiftId: shiftToday.id, userId: users[5].id, positionLabel: "MÃ¡y trÆ°á»Ÿng S1", parentId: tkip.id, isApproved: true },
      { shiftId: shiftToday.id, userId: users[4].id, positionLabel: "LÃ² trÆ°á»Ÿng S1", parentId: tkip.id, isApproved: true },
      { shiftId: shiftToday.id, userId: users[8].id, positionLabel: "I&C", parentId: tkip.id, isApproved: false },
      { shiftId: shiftToday.id, userId: users[9].id, positionLabel: "Váº­n hÃ nh viÃªn LÃ²", parentId: tkip.id, isApproved: true },
    ],
  });
  const tdien = await prisma.shiftAssignment.create({
    data: { shiftId: shiftToday.id, userId: users[7].id, positionLabel: "TrÆ°á»Ÿng kÃ­p Ä‘iá»‡n", parentId: tc.id, isApproved: true },
  });
  await prisma.shiftAssignment.create({
    data: { shiftId: shiftToday.id, userId: users[2].id, positionLabel: "Ká»¹ thuáº­t viÃªn Ä‘iá»‡n", parentId: tdien.id, isApproved: false },
  });
  console.log("âœ“ shift assignments (org chart)");

  // ---- Check-ins for today's shift ----
  await prisma.checkIn.createMany({
    data: [
      { userId: users[1].id, shiftId: shiftToday.id, checkInAt: atToday(13, 55), status: "PRESENT", approvedBy: users[0].id },
      { userId: users[6].id, shiftId: shiftToday.id, checkInAt: atToday(13, 58), status: "PRESENT", approvedBy: users[1].id },
      { userId: users[5].id, shiftId: shiftToday.id, checkInAt: atToday(14, 12), status: "LATE", note: "Káº¹t xe" },
      { userId: users[4].id, shiftId: shiftToday.id, checkInAt: atToday(13, 50), status: "PRESENT", approvedBy: users[1].id },
      { userId: users[8].id, shiftId: shiftToday.id, checkInAt: null, status: "ABSENT", note: "Nghá»‰ phÃ©p" },
      { userId: users[9].id, shiftId: shiftToday.id, checkInAt: atToday(13, 59), status: "PRESENT" },
    ],
  });

  // ---- Handover ----
  await prisma.shiftHandover.create({
    data: {
      shiftId: shiftToday.id,
      fromUserId: users[1].id,
      toUserId: users[6].id,
      handoverAt: atToday(14, 0),
      notes: "Tá»• mÃ¡y 1 váº­n hÃ nh á»•n Ä‘á»‹nh, táº£i 300MW.",
      issues: "BÆ¡m cáº¥p 1B cÃ³ tiáº¿ng á»“n nháº¹, cáº§n theo dÃµi. Van FGD-S1 Ä‘ang chá» phá»¥ tÃ¹ng.",
    },
  });
  console.log("âœ“ check-ins + handover");

  // ---- Devices ----
  const deviceSeed: Array<{ code: string; name: string; system: string; managingPosition: string }> = [
    { code: "ESP-S1-001", name: "Bá»™ lá»c bá»¥i tÄ©nh Ä‘iá»‡n S1", system: "ESP", managingPosition: "LÃ² trÆ°á»Ÿng S1" },
    { code: "ESP-S1-002", name: "Bá»™ lá»c bá»¥i tÄ©nh Ä‘iá»‡n S2", system: "ESP", managingPosition: "LÃ² trÆ°á»Ÿng S1" },
    { code: "ESP-S2-003", name: "BÃºa gÃµ Ä‘iá»‡n cá»±c ESP", system: "ESP", managingPosition: "LÃ² trÆ°á»Ÿng S1" },
    { code: "FGD-S1-001", name: "Há»‡ thá»‘ng khá»­ lÆ°u huá»³nh S1", system: "FGD", managingPosition: "MÃ¡y trÆ°á»Ÿng S1" },
    { code: "FGD-S1-002", name: "BÆ¡m tuáº§n hoÃ n FGD 1A", system: "FGD", managingPosition: "MÃ¡y trÆ°á»Ÿng S1" },
    { code: "FGD-S2-003", name: "BÆ¡m tuáº§n hoÃ n FGD 1B", system: "FGD", managingPosition: "MÃ¡y trÆ°á»Ÿng S1" },
    { code: "IC-S1-001", name: "Tá»§ Ä‘iá»u khiá»ƒn DCS lÃ² 1", system: "I&C", managingPosition: "I&C" },
    { code: "IC-S1-002", name: "Cáº£m biáº¿n nhiá»‡t Ä‘á»™ hÆ¡i quÃ¡ nhiá»‡t", system: "I&C", managingPosition: "I&C" },
    { code: "IC-S2-003", name: "Bá»™ truyá»n tÃ­n hiá»‡u Ã¡p suáº¥t", system: "I&C", managingPosition: "I&C" },
    { code: "BLR-S1-001", name: "LÃ² hÆ¡i tá»• mÃ¡y 1", system: "LÃ² hÆ¡i", managingPosition: "LÃ² trÆ°á»Ÿng S1" },
    { code: "BLR-S1-002", name: "Quáº¡t giÃ³ chÃ­nh FD 1A", system: "LÃ² hÆ¡i", managingPosition: "TrÆ°á»Ÿng kÃ­p LÃ² - MÃ¡y" },
    { code: "BLR-S2-003", name: "Bá»™ hÃ¢m nÆ°á»›c economizer", system: "LÃ² hÆ¡i", managingPosition: "TrÆ°á»Ÿng kÃ­p LÃ² - MÃ¡y" },
    { code: "TBN-S1-001", name: "Tuabin hÆ¡i tá»• mÃ¡y 1", system: "Tuabin", managingPosition: "MÃ¡y trÆ°á»Ÿng S1" },
    { code: "TBN-S1-002", name: "MÃ¡y phÃ¡t Ä‘iá»‡n tá»• mÃ¡y 1", system: "MÃ¡y phÃ¡t", managingPosition: "TrÆ°á»Ÿng kÃ­p Ä‘iá»‡n" },
    { code: "TBN-S2-003", name: "BÆ¡m dáº§u bÃ´i trÆ¡n tuabin", system: "Tuabin", managingPosition: "MÃ¡y trÆ°á»Ÿng S1" },
  ];

  const devices = [];
  for (let i = 0; i < deviceSeed.length; i++) {
    const d = deviceSeed[i];
    devices.push(
      await prisma.equipmentNode.upsert({
        where: { seq: d.code },
        update: {
          code: d.code,
          name: d.name,
          parentSeq: null,
          depth: 1,
          sort: 10_000 + i,
          attachedInfo: `Há»‡ thá»‘ng: ${d.system}; CÆ°Æ¡ng vá»‹ quáº£n lÃ½: ${d.managingPosition}`,
          deviceSynced: true,
        },
        create: {
          seq: d.code,
          code: d.code,
          name: d.name,
          parentSeq: null,
          depth: 1,
          sort: 10_000 + i,
          attachedInfo: `Há»‡ thá»‘ng: ${d.system}; CÆ°Æ¡ng vá»‹ quáº£n lÃ½: ${d.managingPosition}`,
          deviceSynced: true,
        },
      })
    );
  }
  console.log(`âœ“ ${devices.length} devices`);

  // ---- Materials ----
  const materialSeed = [
    { code: "VT-001", name: "VÃ²ng bi SKF 6320", unit: "CÃ¡i", quantity: 24, minStock: 10, location: "Kho A1", supplier: "SKF Vietnam", unitPrice: 2_500_000 },
    { code: "VT-002", name: "Dáº§u bÃ´i trÆ¡n ISO VG 46", unit: "LÃ­t", quantity: 180, minStock: 50, location: "Kho hÃ³a cháº¥t", supplier: "Shell", unitPrice: 85_000 },
    { code: "VT-003", name: "GioÄƒng lÃ m kÃ­n FGD", unit: "Bá»™", quantity: 4, minStock: 8, location: "Kho B2", supplier: "Doosan Parts", unitPrice: 1_200_000 },
    { code: "VT-004", name: "Äiá»‡n cá»±c ESP", unit: "Táº¥m", quantity: 0, minStock: 6, location: "Kho A3", supplier: "Mitsubishi", unitPrice: 4_800_000 },
    { code: "VT-005", name: "Cáº£m biáº¿n nhiá»‡t PT100", unit: "CÃ¡i", quantity: 15, minStock: 5, location: "Kho I&C", supplier: "Endress+Hauser", unitPrice: 950_000 },
    { code: "VT-006", name: "Van bi DN100", unit: "CÃ¡i", quantity: 7, minStock: 4, location: "Kho B1", supplier: "KSB Vietnam", unitPrice: 3_100_000 },
    { code: "VT-007", name: "DÃ¢y cÃ¡p Ä‘iá»‡n lá»±c 6.3kV", unit: "MÃ©t", quantity: 320, minStock: 100, location: "Kho Ä‘iá»‡n", supplier: "Cadivi", unitPrice: 220_000 },
    { code: "VT-008", name: "Bá»™ lá»c dáº§u tuabin", unit: "CÃ¡i", quantity: 9, minStock: 6, location: "Kho A2", supplier: "Flowserve", unitPrice: 1_650_000 },
    { code: "VT-009", name: "Váº­t liá»‡u chá»‹u lá»­a lÃ² hÆ¡i", unit: "Bao", quantity: 45, minStock: 20, location: "Kho váº­t tÆ°", supplier: "Harbin", unitPrice: 380_000 },
    { code: "VT-010", name: "Bá»™ truyá»n Ä‘á»™ng van", unit: "Bá»™", quantity: 3, minStock: 3, location: "Kho B3", supplier: "Siemens", unitPrice: 7_200_000 },
  ];
  const materials = [];
  for (const m of materialSeed) {
    materials.push(await prisma.material.create({ data: m }));
  }
  console.log(`âœ“ ${materials.length} materials`);

  // ---- Repair logs (20, spanning last 3 months) ----
  const repairTemplates = [
    { title: "Thay vÃ²ng bi bÆ¡m tuáº§n hoÃ n", symptom: "Tiáº¿ng á»“n báº¥t thÆ°á»ng, Ä‘á»™ rung cao", cause: "VÃ²ng bi mÃ²n sau 8000h", action: "Thay vÃ²ng bi SKF má»›i, cÃ¢n chá»‰nh Ä‘á»“ng tÃ¢m", result: "Äá»™ rung vá» má»©c cho phÃ©p", priority: Priority.HIGH, status: RepairStatus.CLOSED, downtime: 240 },
    { title: "Vá»‡ sinh Ä‘iá»‡n cá»±c ESP", symptom: "Hiá»‡u suáº¥t lá»c bá»¥i giáº£m", cause: "TÃ­ch tá»¥ bá»¥i trÃªn Ä‘iá»‡n cá»±c", action: "Vá»‡ sinh Ä‘iá»‡n cá»±c, kiá»ƒm tra bÃºa gÃµ", result: "Hiá»‡u suáº¥t phá»¥c há»“i 99.2%", priority: Priority.MEDIUM, status: RepairStatus.CLOSED, downtime: 480 },
    { title: "Sá»­a rÃ² rá»‰ van FGD", symptom: "RÃ² rá»‰ dung dá»‹ch táº¡i máº·t bÃ­ch", cause: "GioÄƒng lÃ m kÃ­n lÃ£o hÃ³a", action: "Thay gioÄƒng, siáº¿t láº¡i bu lÃ´ng", result: null, priority: Priority.HIGH, status: RepairStatus.IN_PROGRESS, downtime: null },
    { title: "Hiá»‡u chuáº©n cáº£m biáº¿n Ã¡p suáº¥t", symptom: "Sai sá»‘ Ä‘á»c 3%", cause: "TrÃ´i Ä‘iá»ƒm zero", action: "Hiá»‡u chuáº©n láº¡i theo chuáº©n", result: "Sai sá»‘ < 0.5%", priority: Priority.LOW, status: RepairStatus.CLOSED, downtime: 60 },
    { title: "Kháº¯c phá»¥c sá»± cá»‘ quáº¡t FD", symptom: "QuÃ¡ táº£i Ä‘á»™ng cÆ¡ quáº¡t", cause: "Káº¹t cÃ¡nh quáº¡t do dá»‹ váº­t", action: "Dá»«ng, loáº¡i bá» dá»‹ váº­t, kiá»ƒm tra cÃ¢n báº±ng", result: "Váº­n hÃ nh bÃ¬nh thÆ°á»ng", priority: Priority.CRITICAL, status: RepairStatus.RESOLVED, downtime: 180 },
    { title: "Báº£o dÆ°á»¡ng Ä‘á»‹nh ká»³ tuabin", symptom: "Báº£o dÆ°á»¡ng theo káº¿ hoáº¡ch", cause: "Äá»‹nh ká»³ 4000h", action: "Kiá»ƒm tra báº¡c, thay dáº§u, Ä‘o Ä‘á»™ rung", result: "Äáº¡t yÃªu cáº§u", priority: Priority.MEDIUM, status: RepairStatus.CLOSED, downtime: 720 },
    { title: "Thay bá»™ lá»c dáº§u bÃ´i trÆ¡n", symptom: "Ãp suáº¥t dáº§u sau lá»c giáº£m", cause: "Lá»c táº¯c", action: "Thay bá»™ lá»c má»›i", result: "Ãp suáº¥t á»•n Ä‘á»‹nh", priority: Priority.MEDIUM, status: RepairStatus.CLOSED, downtime: 90 },
    { title: "Sá»­a lá»—i tá»§ DCS", symptom: "Máº¥t tÃ­n hiá»‡u má»™t sá»‘ kÃªnh AI", cause: "Card I/O lá»—i", action: "Thay card I/O, cáº¥u hÃ¬nh láº¡i", result: "KhÃ´i phá»¥c tÃ­n hiá»‡u", priority: Priority.HIGH, status: RepairStatus.CLOSED, downtime: 120 },
  ];

  let r = 0;
  for (let i = 0; i < 20; i++) {
    const tpl = repairTemplates[i % repairTemplates.length];
    const device = devices[i % devices.length];
    const startedAt = daysAgo(90 - i * 4, 9);
    const isClosed = tpl.status === RepairStatus.CLOSED || tpl.status === RepairStatus.RESOLVED;
    await prisma.repairLog.create({
      data: {
        deviceSeq: device.seq,
        title: `${tpl.title} (${device.seq})`,
        description: `${tpl.symptom}. Thá»±c hiá»‡n: ${tpl.action}.`,
        symptom: tpl.symptom,
        cause: tpl.cause,
        action: tpl.action,
        result: tpl.result,
        startedAt,
        completedAt: isClosed ? new Date(startedAt.getTime() + (tpl.downtime ?? 120) * 60000) : null,
        status: tpl.status,
        priority: tpl.priority,
        cost: (i + 1) * 1_500_000,
        downtime: tpl.downtime,
        createdById: users[2 + (i % 3)].id,
        approvedById: isClosed ? users[1].id : null,
        attachments: [],
      },
    });
    r++;
  }
  console.log(`âœ“ ${r} repair logs`);

  // ---- Equipment materials usage ----
  await prisma.equipmentMaterial.createMany({
    data: [
      { deviceSeq: devices[4].seq, materialId: materials[0].id, quantity: 2, note: "Thay vÃ²ng bi bÆ¡m" },
      { deviceSeq: devices[5].seq, materialId: materials[0].id, quantity: 2, note: "Thay vÃ²ng bi bÆ¡m 1B" },
      { deviceSeq: devices[3].seq, materialId: materials[2].id, quantity: 1, note: "Thay gioÄƒng FGD" },
      { deviceSeq: devices[12].seq, materialId: materials[1].id, quantity: 40, note: "Thay dáº§u tuabin" },
      { deviceSeq: devices[0].seq, materialId: materials[3].id, quantity: 2, note: "Thay Ä‘iá»‡n cá»±c ESP" },
    ],
  });
  console.log("âœ“ equipment material usage");

  // ---- Audit log sample ----
  await prisma.auditLog.createMany({
    data: [
      { userId: users[0].id, action: "CREATE_EQUIPMENT_NODE", entity: "EquipmentNode", entityId: devices[0].id, detail: "ThÃªm thiáº¿t bá»‹ ESP-S1-001" },
      { userId: users[1].id, action: "APPROVE_REPAIR", entity: "RepairLog", detail: "Duyá»‡t phiáº¿u sá»­a chá»¯a" },
      { userId: users[2].id, action: "CREATE_REPAIR", entity: "RepairLog", detail: "Táº¡o phiáº¿u sá»­a chá»¯a FGD" },
    ],
  });

  // ---- Monthly attendance (approved check-ins) for the demo accounts ----
  // Drives the "working days" stat + activity chart. checkInAt date is what
  // matters; we attach to today's shift as a valid FK.
  const now = new Date();
  const today = now.getDate();
  const attendanceUsers = [users[0], users[1], users[2]]; // admin, supervisor, technician
  for (const u of attendanceUsers) {
    const rows = [];
    for (let d = 1; d <= Math.max(1, today); d++) {
      // Work pattern: skip ~every 5th day as a day off.
      if (d % 5 === 0) continue;
      const at = new Date(now.getFullYear(), now.getMonth(), d, 6, 5, 0);
      rows.push({
        userId: u.id,
        shiftId: shiftToday.id,
        checkInAt: at,
        checkOutAt: new Date(now.getFullYear(), now.getMonth(), d, 14, 0, 0),
        status: d % 7 === 0 ? "LATE" : "PRESENT",
        approvedBy: users[1].id, // confirmed by TrÆ°á»Ÿng ca
      });
    }
    if (rows.length) await prisma.checkIn.createMany({ data: rows });
  }
  console.log("âœ“ monthly attendance");

  // ---- Operation events (drills) entered by TrÆ°á»Ÿng ca for this month ----
  function dayThisMonth(d: number, h = 8) {
    return new Date(now.getFullYear(), now.getMonth(), d, h, 0, 0);
  }
  await prisma.operationEvent.createMany({
    data: [
      { type: "DRILL_INCIDENT", title: "Diá»…n táº­p sá»± cá»‘ máº¥t Ä‘iá»‡n tá»± dÃ¹ng", date: dayThisMonth(12, 9), note: "ToÃ n ca tham gia táº¡i phÃ²ng Ä‘iá»u khiá»ƒn trung tÃ¢m.", createdById: users[1].id },
      { type: "DRILL_FIRE", title: "Diá»…n táº­p PCCC khu vá»±c kho dáº§u", date: dayThisMonth(20, 14), note: "Phá»‘i há»£p vá»›i Ä‘á»™i PCCC cÆ¡ sá»Ÿ.", createdById: users[1].id },
      { type: "DRILL_INCIDENT", title: "Diá»…n táº­p xá»­ lÃ½ sá»± cá»‘ bÆ¡m cáº¥p", date: dayThisMonth(26, 9), note: "Tá»• mÃ¡y 1.", createdById: users[1].id },
      { type: "OTHER", title: "Huáº¥n luyá»‡n an toÃ n Ä‘á»‹nh ká»³", date: dayThisMonth(8, 8), note: "An toÃ n vá»‡ sinh lao Ä‘á»™ng.", createdById: users[1].id },
    ],
  });
  console.log("âœ“ operation events");

  console.log("âœ… Seed complete. Login with admin@powerplant.vn / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

