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
  console.log("🌱 Seeding PowerPlant EAM database...");

  // ---- Clean (order matters for FKs) ----
  await prisma.operationEvent.deleteMany();
  await prisma.defect.deleteMany();
  await prisma.materialReplacementLog.deleteMany();
  await prisma.materialReplacement.deleteMany();
  await prisma.deviceMaterial.deleteMany();
  await prisma.repairLog.deleteMany();
  await prisma.checkIn.deleteMany();
  await prisma.shiftHandover.deleteMany();
  await prisma.shiftAssignment.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.device.deleteMany();
  await prisma.material.deleteMany();
  await prisma.user.deleteMany();

  const pw = await bcrypt.hash("password123", 10);

  // ---- Users ----
  const usersData = [
    { name: "Nguyễn Văn Hùng", employeeId: "NV001", email: "admin@powerplant.vn", phone: "0901234567", role: Role.ADMIN, position: "Quản đốc phân xưởng", department: "Vận hành" },
    { name: "Trần Thị Mai", employeeId: "NV002", email: "supervisor@powerplant.vn", phone: "0902345678", role: Role.SUPERVISOR, position: "Trưởng ca", department: "Vận hành 1" },
    { name: "Lê Minh Tuấn", employeeId: "NV003", email: "tech@powerplant.vn", phone: "0903456789", role: Role.TECHNICIAN, position: "Kỹ thuật viên I&C", department: "Kỹ thuật" },
    { name: "Phạm Thu Hà", employeeId: "NV004", email: "viewer@powerplant.vn", phone: "0904567890", role: Role.VIEWER, position: "Nhân viên văn phòng", department: "Hành chính" },
    { name: "Hoàng Đức Anh", employeeId: "NV005", email: "lotruong.s1@powerplant.vn", phone: "0905111222", role: Role.TECHNICIAN, position: "Lò trưởng S1", department: "Vận hành 1" },
    { name: "Vũ Quốc Bảo", employeeId: "NV006", email: "maytruong.s1@powerplant.vn", phone: "0905222333", role: Role.TECHNICIAN, position: "Máy trưởng S1", department: "Vận hành 1" },
    { name: "Đặng Văn Cường", employeeId: "NV007", email: "tktruong@powerplant.vn", phone: "0905333444", role: Role.SUPERVISOR, position: "Trưởng kíp Lò - Máy", department: "Vận hành 1" },
    { name: "Bùi Thị Dung", employeeId: "NV008", email: "dien.kip@powerplant.vn", phone: "0905444555", role: Role.TECHNICIAN, position: "Trưởng kíp điện", department: "Điện" },
    { name: "Ngô Văn Em", employeeId: "NV009", email: "ic1@powerplant.vn", phone: "0905555666", role: Role.TECHNICIAN, position: "I&C", department: "Kỹ thuật" },
    { name: "Dương Thị Hoa", employeeId: "NV010", email: "vh2@powerplant.vn", phone: "0905666777", role: Role.TECHNICIAN, position: "Vận hành viên", department: "Vận hành 2" },
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
  console.log(`✓ ${users.length} users`);

  // ---- Shifts ----
  const shiftToday = await prisma.shift.create({
    data: { date: daysAgo(0), shiftType: ShiftType.AFTERNOON, unit: "Vận hành 1" },
  });
  const shiftTomorrow = await prisma.shift.create({
    data: { date: daysAgo(-1), shiftType: ShiftType.MORNING, unit: "Vận hành 2" },
  });
  console.log("✓ 2 shifts");

  // ---- Shift assignments (org chart hierarchy) for today's shift ----
  const tc = await prisma.shiftAssignment.create({
    data: { shiftId: shiftToday.id, userId: users[1].id, positionLabel: "Trưởng ca", parentId: null, isApproved: true },
  });
  const tkip = await prisma.shiftAssignment.create({
    data: { shiftId: shiftToday.id, userId: users[6].id, positionLabel: "Trưởng kíp Lò - Máy DH1", parentId: tc.id, isApproved: true },
  });
  await prisma.shiftAssignment.createMany({
    data: [
      { shiftId: shiftToday.id, userId: users[5].id, positionLabel: "Máy trưởng S1", parentId: tkip.id, isApproved: true },
      { shiftId: shiftToday.id, userId: users[4].id, positionLabel: "Lò trưởng S1", parentId: tkip.id, isApproved: true },
      { shiftId: shiftToday.id, userId: users[8].id, positionLabel: "I&C", parentId: tkip.id, isApproved: false },
      { shiftId: shiftToday.id, userId: users[9].id, positionLabel: "Vận hành viên Lò", parentId: tkip.id, isApproved: true },
    ],
  });
  const tdien = await prisma.shiftAssignment.create({
    data: { shiftId: shiftToday.id, userId: users[7].id, positionLabel: "Trưởng kíp điện", parentId: tc.id, isApproved: true },
  });
  await prisma.shiftAssignment.create({
    data: { shiftId: shiftToday.id, userId: users[2].id, positionLabel: "Kỹ thuật viên điện", parentId: tdien.id, isApproved: false },
  });
  console.log("✓ shift assignments (org chart)");

  // ---- Check-ins for today's shift ----
  await prisma.checkIn.createMany({
    data: [
      { userId: users[1].id, shiftId: shiftToday.id, checkInAt: atToday(13, 55), status: "PRESENT", approvedBy: users[0].id },
      { userId: users[6].id, shiftId: shiftToday.id, checkInAt: atToday(13, 58), status: "PRESENT", approvedBy: users[1].id },
      { userId: users[5].id, shiftId: shiftToday.id, checkInAt: atToday(14, 12), status: "LATE", note: "Kẹt xe" },
      { userId: users[4].id, shiftId: shiftToday.id, checkInAt: atToday(13, 50), status: "PRESENT", approvedBy: users[1].id },
      { userId: users[8].id, shiftId: shiftToday.id, checkInAt: null, status: "ABSENT", note: "Nghỉ phép" },
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
      notes: "Tổ máy 1 vận hành ổn định, tải 300MW.",
      issues: "Bơm cấp 1B có tiếng ồn nhẹ, cần theo dõi. Van FGD-S1 đang chờ phụ tùng.",
    },
  });
  console.log("✓ check-ins + handover");

  // ---- Devices ----
  const deviceSeed: Array<{ code: string; name: string; system: string; managingPosition: string }> = [
    { code: "ESP-S1-001", name: "Bộ lọc bụi tĩnh điện S1", system: "ESP", managingPosition: "Lò trưởng S1" },
    { code: "ESP-S1-002", name: "Bộ lọc bụi tĩnh điện S2", system: "ESP", managingPosition: "Lò trưởng S1" },
    { code: "ESP-S2-003", name: "Búa gõ điện cực ESP", system: "ESP", managingPosition: "Lò trưởng S1" },
    { code: "FGD-S1-001", name: "Hệ thống khử lưu huỳnh S1", system: "FGD", managingPosition: "Máy trưởng S1" },
    { code: "FGD-S1-002", name: "Bơm tuần hoàn FGD 1A", system: "FGD", managingPosition: "Máy trưởng S1" },
    { code: "FGD-S2-003", name: "Bơm tuần hoàn FGD 1B", system: "FGD", managingPosition: "Máy trưởng S1" },
    { code: "IC-S1-001", name: "Tủ điều khiển DCS lò 1", system: "I&C", managingPosition: "I&C" },
    { code: "IC-S1-002", name: "Cảm biến nhiệt độ hơi quá nhiệt", system: "I&C", managingPosition: "I&C" },
    { code: "IC-S2-003", name: "Bộ truyền tín hiệu áp suất", system: "I&C", managingPosition: "I&C" },
    { code: "BLR-S1-001", name: "Lò hơi tổ máy 1", system: "Lò hơi", managingPosition: "Lò trưởng S1" },
    { code: "BLR-S1-002", name: "Quạt gió chính FD 1A", system: "Lò hơi", managingPosition: "Trưởng kíp Lò - Máy" },
    { code: "BLR-S2-003", name: "Bộ hâm nước economizer", system: "Lò hơi", managingPosition: "Trưởng kíp Lò - Máy" },
    { code: "TBN-S1-001", name: "Tuabin hơi tổ máy 1", system: "Tuabin", managingPosition: "Máy trưởng S1" },
    { code: "TBN-S1-002", name: "Máy phát điện tổ máy 1", system: "Máy phát", managingPosition: "Trưởng kíp điện" },
    { code: "TBN-S2-003", name: "Bơm dầu bôi trơn tuabin", system: "Tuabin", managingPosition: "Máy trưởng S1" },
  ];

  const devices = [];
  for (const d of deviceSeed) {
    const device = await prisma.device.create({ data: d });
    await prisma.device.update({
      where: { id: device.id },
      data: { qrCodeData: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/devices/${device.id}` },
    });
    devices.push(device);
  }
  console.log(`✓ ${devices.length} devices`);

  // ---- Materials ----
  const materialSeed = [
    { code: "VT-001", name: "Vòng bi SKF 6320", unit: "Cái", quantity: 24, minStock: 10, location: "Kho A1", supplier: "SKF Vietnam", unitPrice: 2_500_000 },
    { code: "VT-002", name: "Dầu bôi trơn ISO VG 46", unit: "Lít", quantity: 180, minStock: 50, location: "Kho hóa chất", supplier: "Shell", unitPrice: 85_000 },
    { code: "VT-003", name: "Gioăng làm kín FGD", unit: "Bộ", quantity: 4, minStock: 8, location: "Kho B2", supplier: "Doosan Parts", unitPrice: 1_200_000 },
    { code: "VT-004", name: "Điện cực ESP", unit: "Tấm", quantity: 0, minStock: 6, location: "Kho A3", supplier: "Mitsubishi", unitPrice: 4_800_000 },
    { code: "VT-005", name: "Cảm biến nhiệt PT100", unit: "Cái", quantity: 15, minStock: 5, location: "Kho I&C", supplier: "Endress+Hauser", unitPrice: 950_000 },
    { code: "VT-006", name: "Van bi DN100", unit: "Cái", quantity: 7, minStock: 4, location: "Kho B1", supplier: "KSB Vietnam", unitPrice: 3_100_000 },
    { code: "VT-007", name: "Dây cáp điện lực 6.3kV", unit: "Mét", quantity: 320, minStock: 100, location: "Kho điện", supplier: "Cadivi", unitPrice: 220_000 },
    { code: "VT-008", name: "Bộ lọc dầu tuabin", unit: "Cái", quantity: 9, minStock: 6, location: "Kho A2", supplier: "Flowserve", unitPrice: 1_650_000 },
    { code: "VT-009", name: "Vật liệu chịu lửa lò hơi", unit: "Bao", quantity: 45, minStock: 20, location: "Kho vật tư", supplier: "Harbin", unitPrice: 380_000 },
    { code: "VT-010", name: "Bộ truyền động van", unit: "Bộ", quantity: 3, minStock: 3, location: "Kho B3", supplier: "Siemens", unitPrice: 7_200_000 },
  ];
  const materials = [];
  for (const m of materialSeed) {
    materials.push(await prisma.material.create({ data: m }));
  }
  console.log(`✓ ${materials.length} materials`);

  // ---- Repair logs (20, spanning last 3 months) ----
  const repairTemplates = [
    { title: "Thay vòng bi bơm tuần hoàn", symptom: "Tiếng ồn bất thường, độ rung cao", cause: "Vòng bi mòn sau 8000h", action: "Thay vòng bi SKF mới, cân chỉnh đồng tâm", result: "Độ rung về mức cho phép", priority: Priority.HIGH, status: RepairStatus.CLOSED, downtime: 240 },
    { title: "Vệ sinh điện cực ESP", symptom: "Hiệu suất lọc bụi giảm", cause: "Tích tụ bụi trên điện cực", action: "Vệ sinh điện cực, kiểm tra búa gõ", result: "Hiệu suất phục hồi 99.2%", priority: Priority.MEDIUM, status: RepairStatus.CLOSED, downtime: 480 },
    { title: "Sửa rò rỉ van FGD", symptom: "Rò rỉ dung dịch tại mặt bích", cause: "Gioăng làm kín lão hóa", action: "Thay gioăng, siết lại bu lông", result: null, priority: Priority.HIGH, status: RepairStatus.IN_PROGRESS, downtime: null },
    { title: "Hiệu chuẩn cảm biến áp suất", symptom: "Sai số đọc 3%", cause: "Trôi điểm zero", action: "Hiệu chuẩn lại theo chuẩn", result: "Sai số < 0.5%", priority: Priority.LOW, status: RepairStatus.CLOSED, downtime: 60 },
    { title: "Khắc phục sự cố quạt FD", symptom: "Quá tải động cơ quạt", cause: "Kẹt cánh quạt do dị vật", action: "Dừng, loại bỏ dị vật, kiểm tra cân bằng", result: "Vận hành bình thường", priority: Priority.CRITICAL, status: RepairStatus.RESOLVED, downtime: 180 },
    { title: "Bảo dưỡng định kỳ tuabin", symptom: "Bảo dưỡng theo kế hoạch", cause: "Định kỳ 4000h", action: "Kiểm tra bạc, thay dầu, đo độ rung", result: "Đạt yêu cầu", priority: Priority.MEDIUM, status: RepairStatus.CLOSED, downtime: 720 },
    { title: "Thay bộ lọc dầu bôi trơn", symptom: "Áp suất dầu sau lọc giảm", cause: "Lọc tắc", action: "Thay bộ lọc mới", result: "Áp suất ổn định", priority: Priority.MEDIUM, status: RepairStatus.CLOSED, downtime: 90 },
    { title: "Sửa lỗi tủ DCS", symptom: "Mất tín hiệu một số kênh AI", cause: "Card I/O lỗi", action: "Thay card I/O, cấu hình lại", result: "Khôi phục tín hiệu", priority: Priority.HIGH, status: RepairStatus.CLOSED, downtime: 120 },
  ];

  let r = 0;
  for (let i = 0; i < 20; i++) {
    const tpl = repairTemplates[i % repairTemplates.length];
    const device = devices[i % devices.length];
    const startedAt = daysAgo(90 - i * 4, 9);
    const isClosed = tpl.status === RepairStatus.CLOSED || tpl.status === RepairStatus.RESOLVED;
    await prisma.repairLog.create({
      data: {
        deviceId: device.id,
        title: `${tpl.title} (${device.code})`,
        description: `${tpl.symptom}. Thực hiện: ${tpl.action}.`,
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
  console.log(`✓ ${r} repair logs`);

  // ---- Device materials usage ----
  await prisma.deviceMaterial.createMany({
    data: [
      { deviceId: devices[4].id, materialId: materials[0].id, quantity: 2, note: "Thay vòng bi bơm" },
      { deviceId: devices[5].id, materialId: materials[0].id, quantity: 2, note: "Thay vòng bi bơm 1B" },
      { deviceId: devices[3].id, materialId: materials[2].id, quantity: 1, note: "Thay gioăng FGD" },
      { deviceId: devices[12].id, materialId: materials[1].id, quantity: 40, note: "Thay dầu tuabin" },
      { deviceId: devices[0].id, materialId: materials[3].id, quantity: 2, note: "Thay điện cực ESP" },
    ],
  });
  console.log("✓ device material usage");

  // ---- Audit log sample ----
  await prisma.auditLog.createMany({
    data: [
      { userId: users[0].id, action: "CREATE_DEVICE", entity: "Device", entityId: devices[0].id, detail: "Thêm thiết bị ESP-S1-001" },
      { userId: users[1].id, action: "APPROVE_REPAIR", entity: "RepairLog", detail: "Duyệt phiếu sửa chữa" },
      { userId: users[2].id, action: "CREATE_REPAIR", entity: "RepairLog", detail: "Tạo phiếu sửa chữa FGD" },
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
        approvedBy: users[1].id, // confirmed by Trưởng ca
      });
    }
    if (rows.length) await prisma.checkIn.createMany({ data: rows });
  }
  console.log("✓ monthly attendance");

  // ---- Operation events (drills) entered by Trưởng ca for this month ----
  function dayThisMonth(d: number, h = 8) {
    return new Date(now.getFullYear(), now.getMonth(), d, h, 0, 0);
  }
  await prisma.operationEvent.createMany({
    data: [
      { type: "DRILL_INCIDENT", title: "Diễn tập sự cố mất điện tự dùng", date: dayThisMonth(12, 9), note: "Toàn ca tham gia tại phòng điều khiển trung tâm.", createdById: users[1].id },
      { type: "DRILL_FIRE", title: "Diễn tập PCCC khu vực kho dầu", date: dayThisMonth(20, 14), note: "Phối hợp với đội PCCC cơ sở.", createdById: users[1].id },
      { type: "DRILL_INCIDENT", title: "Diễn tập xử lý sự cố bơm cấp", date: dayThisMonth(26, 9), note: "Tổ máy 1.", createdById: users[1].id },
      { type: "OTHER", title: "Huấn luyện an toàn định kỳ", date: dayThisMonth(8, 8), note: "An toàn vệ sinh lao động.", createdById: users[1].id },
    ],
  });
  console.log("✓ operation events");

  console.log("✅ Seed complete. Login with admin@powerplant.vn / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
