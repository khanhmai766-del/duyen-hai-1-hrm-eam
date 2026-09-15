/** Mẫu liên kết PCT từ ảnh người dùng; chỉ thêm vào PostgreSQL local:5433. */
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { normalizeText } from "../lib/nav";

loadEnvConfig(process.cwd());
const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port === "5433", "Chỉ được tạo mẫu trên PostgreSQL local:5433");
const db = new PrismaClient();
const samples = [
  ["ELECTRICAL", "3918", "S1", "Xử lý trans đo lưu lượng gió công suất nhánh A Mill 1E lò S1 DH1 nghi ngờ đo sai, thường xuyên bị bad không vận hành máy nghiền auto được. 10HFE55CF 301/302", "Transmitter đo lưu lượng gió công suất phía không dẫn động máy nghiền 1E lò S1 DH1"],
  ["ELECTRICAL", "3916", "COMMON", "Bảo dưỡng định kỳ camera Xử lý nước khử khoáng DH1", "Camera khu vực xử lý nước khử khoáng DH1"],
  ["ELECTRICAL", "3915", "COMMON", "Bảo dưỡng định kỳ camera", "Khu vực camera trạm NH3"],
  ["ELECTRICAL", "3914", "S2", "Xử lý cánh tĩnh IDF2A ESP S2-DH1 bị báo lỗi Fault KKS: 20HNA10AA101 (phải reset nguồn mới hết lỗi)", "Van điều chỉnh cánh tĩnh IDF2A ESP S2-DH1"],
  ["MECHANICAL", "4218", "COMMON", "Xử lý độ rung quạt sục khí số 2", "Quạt sục khí số 2 FGD DH1"],
  ["MECHANICAL", "4217", "S2", "Thông tắt bi máy nghiền 2A-DH1", "Mill 2A"],
  ["MECHANICAL", "4215", "COMMON", "Xử lý độ rung quạt sục khí số 2", "Quạt sục khí số 2 DH1"],
  ["MECHANICAL", "4214", "S2", "Xử lý lủng đường nước làm mát mạch kín đầu vào bộ làm mát không khí cuộn dây động cơ chính mill 2A", "Mill 2A - DH1"],
] as const;
const note = "DEMO LOCAL: số PCT và nội dung theo ảnh người dùng; SYC, ngày, nhân sự, cương vị và phân loại tổ máy là dữ liệu thử. Không tạo hoặc cập nhật phiếu trên NKVH.";
assert.ok(process.argv.slice(2).every(arg => arg === "--lower-numbers"), "Chỉ hỗ trợ tùy chọn --lower-numbers");
const lowerNumbers = process.argv.includes("--lower-numbers");

async function main() {
  const user = await db.user.findFirst({ where: { role: "ADMIN" }, select: { id: true, name: true } });
  assert.ok(user, "Cần tài khoản ADMIN có sẵn để ghi nhận người tạo mẫu");
  const now = new Date();
  const workDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const results = await db.$transaction(async tx => {
    const rows: { number: string; kind: string; permitId: string; defectId: string; created: boolean }[] = [];
    for (const [kind, originalNumber, unit, content, location] of samples) {
      const number = lowerNumbers ? String(Number(originalNumber) - 350) : originalNumber;
      const sampleNote = lowerNumbers
        ? `DEMO LOCAL: số ${number} giả lập, thấp hơn số ${originalNumber} trong ảnh 350 số; chưa xác nhận tồn tại trên NKVH. ${note}`
        : note;
      const permitId = `demo-nkvh-pct-${kind.toLowerCase()}-${number}-2026`;
      const defectId = `${permitId}-syc`;
      const existing = await tx.workPermit.findUnique({ where: { id: permitId } });
      if (existing) {
        assert.ok(existing.defectId === defectId && existing.number === number && existing.kind === kind && existing.year === 2026 && existing.format === "ELECTRONIC", `Mẫu ${number} đã thay đổi; không tự ghi đè`);
        assert.ok(await tx.defect.findUnique({ where: { id: defectId } }), `SYC mẫu ${number} không còn tồn tại`);
        rows.push({ number, kind, permitId, defectId, created: false });
        continue;
      }
      assert.equal(await tx.workPermit.count({ where: { kind, year: 2026, number, status: { not: "CANCELLED" } } }), 0, `Số ${number} đã có phiếu khác; không ghi đè`);
      const electrical = kind === "ELECTRICAL";
      const position = electrical ? "Trưởng kíp điện" : "Lò trưởng";
      const requestNumber = `DEMO-PCT-${number}/2026`;
      await tx.defect.create({ data: {
        id: defectId, sourceKey: defectId, sourceType: "MANUAL", websiteCreated: false,
        unit, device: location, sourceDeviceRaw: location, system: position,
        positionCode: electrical ? "ELECTRICAL_SHIFT_LEAD" : "BOILER_LEAD",
        requestType: electrical ? "Điện" : "Cơ", requestNumber,
        content: `[DEMO PCT ${number}] ${content}`, status: "CO_PCT", detectedAt: now,
        severity: "2", condition: "B", fireSafetyImpact: "Không", environmentSafetyImpact: "Không",
        note: sampleNote, createdById: user.id,
      } });
      await tx.workPermit.create({ data: {
        id: permitId, kind, year: 2026, number, format: "ELECTRONIC", teamType: "INTERNAL",
        status: "ISSUED", unit, position, content, location, workDate, issuedAt: now,
        issuerName: "Người cấp mẫu DEMO", commanderName: "CHTT mẫu DEMO", workerCount: 1,
        teamName: electrical ? "Phân xưởng Sửa chữa Điện tự động" : "Phân xưởng Sửa chữa Cơ nhiệt",
        note: sampleNote, defectId, repairRequestNumber: requestNumber,
        searchText: normalizeText(`${number} 2026 ${content} ${location} ${requestNumber} DEMO`),
        createdById: user.id, createdByName: user.name,
        history: { create: { actorId: user.id, actorName: user.name, action: "Tạo mẫu thử liên kết local", after: { number, year: 2026, kind, defectId, note: sampleNote } } },
      } });
      rows.push({ number, kind, permitId, defectId, created: true });
    }
    return rows;
  });
  console.table(results);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
