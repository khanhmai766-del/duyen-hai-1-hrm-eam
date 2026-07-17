import XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const workbookPath = "/Users/minh/Downloads/DANH SACH LICH DI CA PXVH1 THANG 7 .2026 OK GỬI.xlsx";
const apply = process.argv.includes("--apply");
const effectiveDate = new Date("2026-07-01T00:00:00.000Z");
const previousDate = new Date("2026-06-30T00:00:00.000Z");

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function cleanPosition(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
function positionInfo(raw) {
  const text = cleanPosition(raw);
  const stationCode = /\(\s*S1\s*\)|\s1$/i.test(text) ? "S1" : /\(\s*S2\s*\)|\s2$/i.test(text) ? "S2" : null;
  const isOffice = /\bdi hc\b/.test(normalize(text));
  let name = text
    .replace(/\s*\(\s*S[12]\s*\)\s*/gi, " ")
    .replace(/\s+[12]$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^TK lò máy$/i.test(name)) name = "Trưởng kíp lò máy";
  return { positionName: name, stationCode, isOffice };
}
function parseCell(value, fallbackCrew) {
  const text = String(value ?? "").replace(/\r/g, "").trim();
  if (!text) return [];
  const matches = [...text.matchAll(/([^\n]+?)\s*\(\s*([A-E])\s*\)(?:\s*TS)?/gi)];
  if (matches.length) return matches.map((match) => ({
    name: match[1].replace(/^[-–—\s]+|[-–—\s]+$/g, "").trim(),
    crewCode: match[2].toUpperCase(),
  }));
  return [{ name: text.replace(/\s*-\s*TS.*$/i, "").trim(), crewCode: fallbackCrew }];
}

function rotationCode(positionName, scheduleLabel) {
  const position = normalize(positionName);
  if (position === "ts thiet bi do luong dieu khien") return null;
  if (position === "tro thu") return "45K_SINGLE_DAY";
  if (position === "vhv thiet bi do luong dieu khien") return "45K_DOUBLE_DAY";
  if (["truong kip lo may", "truc chinh dien"].includes(position)) return "4K_SINGLE_DAY";
  if (/^4\s*kip$/.test(normalize(scheduleLabel))) return "4K_SINGLE_DAY";
  return "5K_STANDARD";
}

function stationFor(record) {
  const rowStations = {
    "lo pho": { 9: "S1", 10: "S2" },
    esp: { 28: "S1", 29: "S2" },
    fgd: { 30: "S1", 31: "S2" },
  };
  const inferred = rowStations[normalize(record.positionName)]?.[record.sourceRow];
  if (inferred) return inferred;
  return record.stationCode;
}

function phaseAtEffectiveDate(record) {
  const code = rotationCode(record.positionName, record.scheduleLabel);
  if (!code) return null;
  if (code === "5K_STANDARD") return { A: 0, B: 1, C: 2, D: 3, E: 4 }[record.crewCode];
  if (code === "4K_SINGLE_DAY") {
    // Sheet 4 kíp dùng A/B/C/E; kíp D ở danh sách TK lò máy thay vị trí E trên lịch.
    return { A: 1, B: 2, C: 3, D: 0, E: 0 }[record.crewCode];
  }
  if (code === "45K_SINGLE_DAY") {
    const byStation = {
      S1: { A: 0, B: 8, C: 7, D: 1, E: 2 },
      S2: { A: 2, B: 5, C: 4, D: 3, E: 7 },
    };
    return byStation[stationFor(record)]?.[record.crewCode] ?? null;
  }
  if (code === "45K_DOUBLE_DAY") {
    const byStation = {
      S1: { A: 2, B: 0, C: 7, D: 5, E: 6 },
      S2: { A: 1, B: 8, C: 6, D: 4, E: 2 },
    };
    return byStation[stationFor(record)]?.[record.crewCode] ?? null;
  }
  return null;
}

function subtractDays(value, days) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

const workbook = XLSX.readFile(workbookPath, { raw: false });
const rows = XLSX.utils.sheet_to_json(workbook.Sheets["DANH SACH THANG 7"], {
  header: 1, defval: null, raw: false,
});
const records = [];
for (let rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
  const info = positionInfo(rows[rowIndex]?.[1]);
  const scheduleLabel = cleanPosition(rows[rowIndex]?.[7]);
  if (!info.positionName || info.isOffice || normalize(scheduleLabel) === "hc") continue;
  for (let crewIndex = 0; crewIndex < 5; crewIndex += 1) {
    const fallbackCrew = String.fromCharCode(65 + crewIndex);
    for (const person of parseCell(rows[rowIndex]?.[crewIndex + 2], fallbackCrew)) {
      if (!person.name || normalize(person.name) === "lap bang") continue;
      records.push({
        ...person,
        ...info,
        scheduleLabel,
        sourceRow: rowIndex + 1,
      });
    }
  }
}

const users = await prisma.user.findMany({ select: { id: true, name: true, employeeId: true, position: true } });
const usersByName = new Map();
for (const user of users) {
  const key = normalize(user.name);
  const list = usersByName.get(key) ?? [];
  list.push(user);
  usersByName.set(key, list);
}
const nameAliases = new Map([["cao tat phat", "cao tan phat"]]);
const matched = [], unmatched = [], ambiguous = [];
for (const record of records) {
  const personKey = nameAliases.get(normalize(record.name)) ?? normalize(record.name);
  const candidates = usersByName.get(personKey) ?? [];
  if (candidates.length === 1) matched.push({ ...record, user: candidates[0] });
  else if (candidates.length === 0) unmatched.push(record);
  else {
    const byPosition = candidates.filter((user) => normalize(user.position) === normalize(record.positionName));
    if (byPosition.length === 1) matched.push({ ...record, user: byPosition[0] });
    else ambiguous.push({ ...record, candidates });
  }
}

console.log(JSON.stringify({
  extracted: records.length,
  matched: matched.length,
  unmatched: unmatched.map((item) => ({ row: item.sourceRow, name: item.name, position: item.positionName, crewCode: item.crewCode })),
  ambiguous: ambiguous.map((item) => ({ row: item.sourceRow, name: item.name, employeeIds: item.candidates.map((user) => user.employeeId) })),
  positions: [...new Set(matched.map((item) => item.positionName))].sort(),
  configuration: [...new Set(matched.map((item) => `${item.positionName}: ${rotationCode(item.positionName, item.scheduleLabel) ?? "không áp dụng"}`))].sort(),
}, null, 2));

if (apply) {
  if (unmatched.length || ambiguous.length) throw new Error("Dừng nhập vì còn tên chưa ghép được hoặc bị trùng");
  const actor = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    await tx.shiftStaffingAssignment.deleteMany({ where: { startDate: effectiveDate, changeReason: "Gán theo danh sách lịch tháng 7/2026" } });
    await tx.staffingChangeEvent.deleteMany({ where: { effectiveDate, reason: "Gán theo danh sách lịch tháng 7/2026" } });
    const positionCache = new Map();
    const templateCache = new Map((await tx.rotationTemplate.findMany()).map((item) => [item.code, item]));
    for (const record of matched) {
      const key = normalize(record.positionName);
      let position = positionCache.get(key);
      if (!position) {
        const existing = await tx.shiftPositionConfig.findFirst({ where: { name: { equals: record.positionName, mode: "insensitive" } } });
        position = existing ?? await tx.shiftPositionConfig.create({
          data: {
            name: record.positionName,
            requiredPerShift: null,
            requiredMorningStaff: 1,
            requiredAfternoonStaff: 1,
            requiredNightStaff: 1,
            positionType: record.stationCode ? "S1_S2" : "SINGLE",
            isActive: true,
            createdById: actor.id,
            updatedById: actor.id,
          },
        });
        if (stationFor(record) && position.positionType !== "S1_S2") {
          position = await tx.shiftPositionConfig.update({ where: { id: position.id }, data: { positionType: "S1_S2", updatedById: actor.id } });
        }
        positionCache.set(key, position);
      }
      await tx.shiftStaffingAssignment.updateMany({
        where: {
          userId: record.user.id,
          assignmentType: "OFFICIAL",
          startDate: { lt: effectiveDate },
          OR: [{ endDate: null }, { endDate: { gte: effectiveDate } }],
        },
        data: { endDate: previousDate, status: "ENDED", changeReason: "Cập nhật theo danh sách lịch tháng 7/2026", updatedById: actor.id },
      });
      await tx.shiftStaffingAssignment.deleteMany({
        where: { userId: record.user.id, assignmentType: "OFFICIAL", startDate: { gte: effectiveDate } },
      });
      const phaseIndex = phaseAtEffectiveDate(record);
      await tx.shiftStaffingAssignment.create({
        data: {
          userId: record.user.id,
          positionId: position.id,
          crewCode: record.crewCode,
          phaseIndex,
          cycleStartDate: phaseIndex === null ? null : subtractDays(effectiveDate, phaseIndex),
          stationCode: stationFor(record),
          assignmentType: "OFFICIAL",
          startDate: effectiveDate,
          endDate: null,
          status: "ACTIVE",
          changeReason: "Gán theo danh sách lịch tháng 7/2026",
          note: `Nguồn Excel, dòng ${record.sourceRow}`,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await tx.staffingChangeEvent.deleteMany({
        where: {
          employeeId: record.user.employeeId,
          effectiveDate,
          reason: "Gán theo danh sách lịch tháng 7/2026",
        },
      });
      await tx.staffingChangeEvent.create({
        data: {
          employeeId: record.user.employeeId,
          changeType: "ASSIGN_POSITION",
          sourcePositionId: null,
          targetPositionId: position.id,
          effectiveDate,
          reason: "Gán theo danh sách lịch tháng 7/2026",
          createdById: actor.id,
        },
      });
    }


    const grouped = new Map();
    for (const record of matched) {
      const key = normalize(record.positionName);
      const list = grouped.get(key) ?? [];
      list.push(record);
      grouped.set(key, list);
    }
    for (const [key, people] of grouped) {
      const position = positionCache.get(key);
      const counts = ["A", "B", "C", "D", "E"].map((crew) => people.filter((item) => item.crewCode === crew).length);
      const frequencies = new Map();
      for (const count of counts) frequencies.set(count, (frequencies.get(count) ?? 0) + 1);
      const required = Math.max(1, [...frequencies.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]);
      const hasStations = people.some((item) => stationFor(item));
      await tx.shiftPositionConfig.update({
        where: { id: position.id },
        data: {
          positionType: hasStations ? "S1_S2" : "SINGLE",
          requiredPerShift: required,
          requiredMorningStaff: required,
          requiredAfternoonStaff: required,
          requiredNightStaff: required,
          updatedById: actor.id,
        },
      });

      const code = rotationCode(people[0].positionName, people[0].scheduleLabel);
      if (!code) continue;
      const template = templateCache.get(code);
      if (!template) throw new Error(`Không tìm thấy mẫu xoay ${code}`);
      await tx.positionRotationAssignment.deleteMany({
        where: { positionConfigId: position.id, effectiveFrom: { gte: effectiveDate } },
      });
      await tx.positionRotationAssignment.updateMany({
        where: {
          positionConfigId: position.id,
          effectiveFrom: { lt: effectiveDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
        },
        data: { effectiveTo: previousDate, isActive: false, updatedById: actor.id },
      });
      await tx.positionRotationAssignment.create({
        data: {
          positionConfigId: position.id,
          rotationTemplateId: template.id,
          effectiveFrom: effectiveDate,
          effectiveTo: null,
          reason: "Cấu hình theo lịch tháng 7/2026",
          isActive: true,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
    }
  });
  console.log(`Đã gán và cấu hình ${matched.length} nhân sự theo lịch từ 01/07/2026.`);
}

await prisma.$disconnect();
