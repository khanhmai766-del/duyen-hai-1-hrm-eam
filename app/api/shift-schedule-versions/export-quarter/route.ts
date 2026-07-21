import ExcelJS from "exceljs";
import { ShiftType } from "@prisma/client";
import { fail, handle, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { compareShiftPositionNames } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SHIFT_ROWS: Array<[ShiftType, string]> = [
  [ShiftType.MORNING, "CA SÁNG"],
  [ShiftType.AFTERNOON, "CA CHIỀU"],
  [ShiftType.NIGHT, "CA ĐÊM"],
];
const NOTE = "Lịch đi HC áp dụng cho CBCNV theo sự sắp xếp của Lãnh đạo Phân xưởng. Các điều chỉnh đặc biệt thực hiện theo lịch đã được công bố.";

function monthRange(from: string, count: number) {
  const match = /^(\d{4})-(\d{2})$/.exec(from);
  if (!match || count < 1 || count > 3) return null;
  const year = Number(match[1]), month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  });
}
function safeSheetName(value: string, used: Set<string>) {
  const base = value.replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 31) || "Lịch ca";
  let name = base, index = 2;
  while (used.has(name)) name = `${base.slice(0, 27)} ${index++}`;
  used.add(name);
  return name;
}

function staffingBadge(type: string) {
  if (type === "TRAINING") return "TS";
  if (type === "ADMINISTRATIVE") return "HC";
  return "";
}

function crewTypeLabel(code: string) {
  if (code.startsWith("45K")) return "4,5 kíp";
  if (code.startsWith("55K")) return "5,5 kíp";
  if (code.startsWith("4K")) return "4 kíp";
  if (code.startsWith("5K")) return "5 kíp";
  if (code.startsWith("6K")) return "6 kíp";
  return code;
}

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "shift-schedule-export", ["read", "manage", "full"], "Không đủ quyền xuất lịch");
    const params = new URL(req.url).searchParams;
    const from = params.get("from") ?? "", count = Number(params.get("count") ?? 3);
    const requestedVersionId = params.get("versionId");
    const selectedPositionId = params.get("positionId");
    const exportMode = params.get("mode") === "POSITION" ? "POSITION" : "ROTATION";
    const matrixOnly = params.get("matrixOnly") === "1";
    const months = monthRange(from, count);
    if (!months) return fail("Khoảng xuất phải từ 1 đến tối đa 3 tháng");

    const versions = [];
    for (let monthIndex = 0; monthIndex < months.length; monthIndex += 1) {
      const target = months[monthIndex];
      const version = await prisma.shiftScheduleVersion.findFirst({
        where: monthIndex === 0 && requestedVersionId
          ? { id: requestedVersionId, unit: "Vận hành 1", year: target.year, month: target.month }
          : { unit: "Vận hành 1", year: target.year, month: target.month, ...(matrixOnly ? {} : { status: "PUBLISHED" }) },
        include: { entries: { include: { positionConfig: { select: { id: true, name: true, positionType: true, trainingRowName: true } } } } },
        orderBy: { versionNumber: "desc" },
      });
      if (!version) return fail(`Tháng ${target.month}/${target.year} chưa có lịch để xuất`, 409);
      versions.push(version);
    }

    const firstDay = new Date(Date.UTC(months[0].year, months[0].month - 1, 1));
    const lastTarget = months[months.length - 1];
    const lastDay = new Date(Date.UTC(lastTarget.year, lastTarget.month, 0));
    const positionIds = Array.from(new Set(versions.flatMap((version) => version.entries.map((entry) => entry.positionConfigId))));
    const [rotations, staffing] = await Promise.all([
      prisma.positionRotationAssignment.findMany({
        where: { positionConfigId: { in: positionIds }, effectiveFrom: { lte: lastDay }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: firstDay } }] },
        include: { positionConfig: { select: { id: true, name: true } }, rotationTemplate: { select: { id: true, code: true, name: true } } },
        orderBy: { effectiveFrom: "desc" },
      }),
      prisma.shiftStaffingAssignment.findMany({
        where: { positionId: { in: positionIds }, startDate: { lte: lastDay }, OR: [{ endDate: null }, { endDate: { gte: firstDay } }] },
        include: { user: { select: { employeeId: true, name: true } } },
      }),
    ]);

    const positionById = new Map(versions.flatMap((version) => version.entries.map((entry) => [entry.positionConfigId, entry.positionConfig] as const)));
    const groups = new Map<string, { code: string; name: string; positions: Map<string, string> }>();
    for (const positionId of positionIds) {
      const rotation = rotations.find((item) => item.positionConfigId === positionId);
      if (!rotation) continue;
      const group = groups.get(rotation.rotationTemplate.id) ?? { code: rotation.rotationTemplate.code, name: rotation.rotationTemplate.name, positions: new Map() };
      group.positions.set(rotation.positionConfig.id, rotation.positionConfig.name);
      groups.set(rotation.rotationTemplate.id, group);
    }
    if (!groups.size) return fail("Không tìm thấy mẫu xoay ca để xuất", 409);
    if (matrixOnly && selectedPositionId) {
      const selectedPosition = positionById.get(selectedPositionId);
      const selectedRotation = rotations.find((item) => item.positionConfigId === selectedPositionId);
      if (!selectedPosition || !selectedRotation)
        return fail("Không tìm thấy cương vị hoặc mẫu xoay ca đã chọn", 409);
      if (exportMode === "POSITION") {
        groups.clear();
        groups.set(`POSITION:${selectedPositionId}`, {
          code: `CV_${selectedPosition.name}`,
          name: selectedPosition.name,
          positions: new Map([[selectedPositionId, selectedPosition.name]]),
        });
      } else {
        for (const key of Array.from(groups.keys()))
          if (key !== selectedRotation.rotationTemplate.id) groups.delete(key);
      }
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = user.name ?? "PXVH1";
    workbook.created = new Date();
    const usedNames = new Set<string>();
    const thin = { style: "thin" as const, color: { argb: "FF000000" } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };

    const rosterSnapshots = months.map((target) => {
      const snapshot = new Date(Date.UTC(target.year, target.month - 1, 1));
      const rows: Array<{ positionId: string; label: string; station: "S1" | "S2" | null; crews: Record<string, string[]>; type: string }> = [];
      const sortedPositions = Array.from(positionById.values()).sort((a, b) =>
        compareShiftPositionNames(a.name, b.name),
      );
      for (const position of sortedPositions) {
        const stations: Array<"S1" | "S2" | null> = position.positionType === "S1_S2" ? ["S1", "S2"] : [null];
        const rotation = rotations.find((item) => item.positionConfigId === position.id && item.effectiveFrom <= snapshot && (!item.effectiveTo || item.effectiveTo >= snapshot));
        for (const station of stations) {
          const crews: Record<string, string[]> = { A: [], B: [], C: [], D: [], E: [] };
          for (const assignment of staffing.filter((item) => {
            if (item.positionId !== position.id || item.isTrainingRow || item.startDate > snapshot || (item.endDate && item.endDate < snapshot)) return false;
            if (!station) return true;
            if (item.stationCode === "FLEX") return item.rosterStation === station;
            return (item.rosterStation ?? item.stationCode) === station;
          })) {
            if (!assignment.crewCode || !crews[assignment.crewCode]) continue;
            const badge = staffingBadge(assignment.assignmentType);
            const displayName = `${assignment.user.name}${badge ? ` [${badge}]` : ""} (${assignment.crewCode})`;
            if (!crews[assignment.crewCode].includes(displayName)) crews[assignment.crewCode].push(displayName);
          }
          Object.values(crews).forEach((names) => names.sort((a, b) => a.localeCompare(b, "vi")));
          rows.push({
            positionId: position.id,
            label: station ? `${position.name} (${station})` : position.name,
            station,
            crews,
            type: rotation ? crewTypeLabel(rotation.rotationTemplate.code) : "",
          });
        }
        const trainingAssignments = staffing.filter((item) => item.positionId === position.id && item.isTrainingRow && item.startDate <= snapshot && (!item.endDate || item.endDate >= snapshot));
        if (trainingAssignments.length) {
          const crews: Record<string, string[]> = { A: [], B: [], C: [], D: [], E: [] };
          for (const assignment of trainingAssignments) {
            if (!assignment.crewCode || !crews[assignment.crewCode]) continue;
            const badge = staffingBadge(assignment.assignmentType) || "TS";
            const displayName = `${assignment.user.name} [${badge}] (${assignment.crewCode})`;
            if (!crews[assignment.crewCode].includes(displayName)) crews[assignment.crewCode].push(displayName);
          }
          Object.values(crews).forEach((names) => names.sort((a, b) => a.localeCompare(b, "vi")));
          rows.push({
            positionId: `${position.id}:training`,
            label: position.trainingRowName?.trim() || `Đào tạo - ${position.name}`,
            station: null,
            crews,
            type: rotation ? crewTypeLabel(rotation.rotationTemplate.code) : "",
          });
        }
      }
      const signature = JSON.stringify(rows.map((row) => [row.positionId, row.station, row.crews, row.type]));
      return { target, rows, signature };
    });

    const rosterGroups: Array<{ from: typeof months[number]; to: typeof months[number]; rows: typeof rosterSnapshots[number]["rows"]; signature: string }> = [];
    for (const snapshot of rosterSnapshots) {
      const previous = rosterGroups[rosterGroups.length - 1];
      if (previous?.signature === snapshot.signature) previous.to = snapshot.target;
      else rosterGroups.push({ from: snapshot.target, to: snapshot.target, rows: snapshot.rows, signature: snapshot.signature });
    }

    if (!matrixOnly) for (const roster of rosterGroups) {
      const sameMonth = roster.from.year === roster.to.year && roster.from.month === roster.to.month;
      const periodLabel = sameMonth
        ? `THÁNG ${String(roster.from.month).padStart(2, "0")} NĂM ${roster.from.year}`
        : `TỪ THÁNG ${String(roster.from.month).padStart(2, "0")}/${roster.from.year} ĐẾN THÁNG ${String(roster.to.month).padStart(2, "0")}/${roster.to.year}`;
      const sheet = workbook.addWorksheet(safeSheetName(`DANH SACH T${String(roster.from.month).padStart(2, "0")}-${roster.from.year}`, usedNames), {
        pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.25, header: 0.1, footer: 0.1 } },
        views: [{ state: "frozen", xSplit: 2, ySplit: 3 }],
      });
      [6, 34, 25, 25, 25, 25, 25, 13].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
      sheet.mergeCells("A1:C1"); sheet.getCell("A1").value = "CÔNG TY NHIỆT ĐIỆN DUYÊN HẢI\nPHÂN XƯỞNG VẬN HÀNH 1";
      sheet.mergeCells("D1:H1"); sheet.getCell("D1").value = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc";
      sheet.mergeCells("A2:H2"); sheet.getCell("A2").value = `DANH SÁCH TRỰC CA PHÂN XƯỞNG VẬN HÀNH 1 ${periodLabel}`;
      sheet.getRow(1).height = 36; sheet.getRow(2).height = 40;
      for (const address of ["A1", "D1", "A2"]) {
        sheet.getCell(address).font = { name: "Times New Roman", bold: true, size: address === "A2" ? 15 : 11 };
        sheet.getCell(address).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      }
      ["STT", "CHỨC DANH", "TỔ VẬN HÀNH A", "TỔ VẬN HÀNH B", "TỔ VẬN HÀNH C", "TỔ VẬN HÀNH D", "TỔ VẬN HÀNH E", "LOẠI KÍP"].forEach((value, index) => {
        const cell = sheet.getCell(3, index + 1); cell.value = value; cell.font = { name: "Times New Roman", bold: true, size: 11 };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cell.border = border;
      });
      sheet.getRow(3).height = 34;
      roster.rows.forEach((item, index) => {
        const row = index + 4;
        const values = [index + 1, item.label, ...["A", "B", "C", "D", "E"].map((crew) => item.crews[crew].join("\n")), item.type];
        values.forEach((value, columnIndex) => {
          const cell = sheet.getCell(row, columnIndex + 1); cell.value = value; cell.border = border;
          cell.font = { name: "Times New Roman", size: 10.5 };
          cell.alignment = { horizontal: columnIndex === 1 ? "left" : "center", vertical: "middle", wrapText: true };
        });
        sheet.getRow(row).height = Math.max(25, 15 * Math.max(1, ...Object.values(item.crews).map((names) => names.length)));
      });
      const signatureRow = roster.rows.length + 6;
      sheet.mergeCells(signatureRow, 1, signatureRow, 3); sheet.getCell(signatureRow, 1).value = "PHÂN XƯỞNG VẬN HÀNH 1";
      sheet.mergeCells(signatureRow, 6, signatureRow, 8); sheet.getCell(signatureRow, 6).value = "NGƯỜI LẬP BẢNG";
      for (const address of [sheet.getCell(signatureRow, 1), sheet.getCell(signatureRow, 6)]) {
        address.font = { name: "Times New Roman", bold: true, size: 11 }; address.alignment = { horizontal: "center" };
      }
      sheet.pageSetup.printArea = `A1:H${signatureRow + 2}`;
    }

    for (const group of groups.values()) {
      const sheet = workbook.addWorksheet(safeSheetName(group.code, usedNames), {
        pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.2, header: 0.1, footer: 0.1 } },
        views: [{ state: "frozen", xSplit: 1, ySplit: 4 }],
      });
      sheet.getColumn(1).width = 16;
      for (let column = 2; column <= 32; column += 1) sheet.getColumn(column).width = 4.2;
      sheet.mergeCells("A1:J1"); sheet.getCell("A1").value = "CÔNG TY NHIỆT ĐIỆN DUYÊN HẢI\nPHÂN XƯỞNG VẬN HÀNH 1";
      sheet.mergeCells("T1:AF1"); sheet.getCell("T1").value = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc";
      sheet.mergeCells("A2:AF2");
      sheet.getCell("A2").value = `LỊCH ĐI CA VẬN HÀNH — ${group.code} — ${group.name.toUpperCase()}\nÁP DỤNG CHO: ${Array.from(group.positions.values()).join("; ").toUpperCase()}\nNHÀ MÁY NHIỆT ĐIỆN DUYÊN HẢI 1 — PXVH 1`;
      sheet.getRow(1).height = 34; sheet.getRow(2).height = 58;
      for (const address of ["A1", "T1", "A2"]) {
        sheet.getCell(address).font = { name: "Times New Roman", bold: true, size: address === "A2" ? 15 : 11 };
        sheet.getCell(address).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      }

      versions.forEach((version, monthIndex) => {
        const startRow = 3 + monthIndex * 8;
        const days = new Date(Date.UTC(version.year, version.month, 0)).getUTCDate();
        const changeDate = new Date(version.generatedFromDate);
        const contextStart = new Date(changeDate);
        contextStart.setUTCDate(contextStart.getUTCDate() - 2);
        const representativeId = Array.from(group.positions.keys()).find((id) => version.entries.some((entry) => entry.positionConfigId === id));
        const representativeEntries = representativeId ? version.entries.filter((entry) => entry.positionConfigId === representativeId) : [];
        sheet.mergeCells(startRow, 1, startRow, 32);
        const monthCell = sheet.getCell(startRow, 1);
        monthCell.value = `THÁNG ${String(version.month).padStart(2, "0")}/${version.year}`;
        monthCell.font = { name: "Times New Roman", bold: true, size: 16 };
        monthCell.alignment = { horizontal: "center", vertical: "middle" };
        monthCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
        sheet.getRow(startRow).height = 25;
        sheet.getCell(startRow + 1, 1).value = "NGÀY";
        for (let day = 1; day <= 31; day += 1) {
          const cell = sheet.getCell(startRow + 1, day + 1);
          cell.value = day <= days ? day : null;
          if (day <= days) {
            const weekday = new Date(Date.UTC(version.year, version.month - 1, day)).getUTCDay();
            if (weekday === 0 || weekday === 6) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9CB9C" } };
          }
        }
        SHIFT_ROWS.forEach(([shiftType, label], shiftIndex) => {
          const row = startRow + 2 + shiftIndex;
          sheet.getCell(row, 1).value = label;
          for (let day = 1; day <= days; day += 1) {
            const codes = Array.from(new Set(representativeEntries.filter((entry) => entry.date.getUTCDate() === day && entry.shiftType === shiftType).map((entry) => {
              const assignment = staffing.find((item) => item.positionId === entry.positionConfigId && item.user.employeeId === entry.employeeId && item.startDate <= entry.date && (!item.endDate || item.endDate >= entry.date));
              return assignment?.crewCode;
            }).filter((code): code is string => !!code)));
            sheet.getCell(row, day + 1).value = codes[0] ?? null;
          }
        });
        sheet.getCell(startRow + 5, 1).value = "HC";
        sheet.getCell(startRow + 6, 1).value = "HC";
        sheet.getCell(startRow + 7, 1).value = "GHI CHÚ";
        sheet.mergeCells(startRow + 7, 2, startRow + 7, 32);
        sheet.getCell(startRow + 7, 2).value = `${NOTE}\nMàu xám: lịch cũ trước vùng đối chiếu · Hai ngày liền trước giữ nguyên màu · Màu vàng nhạt: lịch từ ngày thay đổi.`;
        sheet.getCell(startRow + 7, 2).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        sheet.getRow(startRow + 7).height = 34;
        for (let row = startRow + 1; row <= startRow + 7; row += 1) {
          for (let column = 1; column <= 32; column += 1) {
            const cell = sheet.getCell(row, column);
            cell.border = border;
            cell.font = { name: "Times New Roman", bold: true, size: column === 1 ? 11 : 12 };
            if (!(row === startRow + 7 && column > 1)) cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          }
          if (row !== startRow + 7) sheet.getRow(row).height = 24;
        }
        for (let day = 1; day <= days; day += 1) {
          const dayDate = new Date(Date.UTC(version.year, version.month - 1, day));
          const isHistory = dayDate < contextStart;
          const isChanged = dayDate >= changeDate;
          const isWeekend = dayDate.getUTCDay() === 0 || dayDate.getUTCDay() === 6;
          for (let row = startRow + 1; row <= startRow + 6; row += 1) {
            const cell = sheet.getCell(row, day + 1);
            if (isHistory) {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
              cell.font = { ...cell.font, color: { argb: "FF8A8A8A" } };
            } else if (isChanged) {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row === startRow + 1 ? "FFFFD966" : "FFFFF2CC" } };
            }
            if (isWeekend) {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row === startRow + 1 ? "FFF9CB9C" : "FFFFFFFF" } };
              cell.font = { ...cell.font, color: { argb: "FF000000" } };
            }
            if (dayDate.getTime() === changeDate.getTime()) {
              cell.border = { ...cell.border, left: { style: "medium", color: { argb: "FF2563EB" } } };
            }
          }
        }
      });
      sheet.pageSetup.printArea = `A1:AF${2 + versions.length * 8}`;
      sheet.autoFilter = undefined;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const end = months[months.length - 1];
    const filename = `Lich-di-ca-PXVH1-${from}-den-${end.year}-${String(end.month).padStart(2, "0")}.xlsx`;
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
