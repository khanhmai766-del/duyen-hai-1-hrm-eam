import type { Prisma } from "@prisma/client";
import { reminderSummaryOf } from "@/lib/defect-reminder";
import { normalizeText } from "@/lib/nav";

const START_ROW = 6;
const COLUMN_COUNT = 15; // A:O

export type DefectSheetOutboxEvent = {
  id: string;
  eventType: string;
  payload: Prisma.JsonValue;
};

type Payload = {
  requestNumber: string;
  unit: string;
  device: string;
  position: string;
  content: string;
  detectedAt: string;
  shiftLeader: string;
  reminderCount: number;
  reminderHistory?: Array<{ reminderNumber: number; remindedAt: string; shiftLeader?: string }>;
  reminderNumber?: number;
  remindedAt?: string;
  reminderShiftLeader?: string;
  legacyReminderRaw?: string;
  writeScope?: string;
  cancellation?: boolean;
  replacesCancelledDefectId?: string;
  previousRequestNumber?: string;
  repeatedRepair: string;
  fireSafetyImpact: string;
  environmentSafetyImpact: string;
  severity: string;
  condition: string;
  status: string;
  note: string;
};

export type DefectSheetWritePlan = {
  eventId: string;
  eventType: string;
  requestNumber: string;
  copyFormat?: { sourceRow: number; targetRow: number };
  writes: Array<{ range: string; values: string[][] }>;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function shortShiftLeaderName(value: unknown) {
  return text(value).split(/\s+/).filter(Boolean).slice(-2).join(" ");
}

function dateVi(value: unknown) {
  const date = new Date(text(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function parseRequestNumber(value: unknown) {
  // Các tab Môi Trường dùng STT QT01, QT02…; Cơ/Điện/Hóa vẫn dùng STT số.
  const match = text(value).match(/^([a-z]+\d+|\d+)\/(\d{4})$/i);
  if (!match) throw new Error(`Số yêu cầu không đúng định dạng STT/năm hoặc QTxx/năm: ${text(value)}`);
  return { sequence: match[1], year: Number(match[2]) };
}

function yearFromSheetDate(value: unknown) {
  // Một số hàng Sheet cũ từng bị nối nội dung nhắc lại ngay sau ngày phát hiện,
  // ví dụ "22/07/2026 nhắc lại lần 2 ngày 26/07/2026". Ngày đầu ô vẫn là
  // ngày nhận diện của hàng gốc; chấp nhận phần chữ phía sau để UPDATE không báo
  // nhầm "không tìm thấy hàng", nhưng không tự sửa/ghi đè ô dữ liệu nguồn này.
  const match = text(value).match(/^\d{1,2}[/-]\d{1,2}[/-](\d{4})(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    CHUA_XU_LY: "Chưa xử lý",
    CO_PCT: "Đang xử lý",
    CHO_VAT_TU: "Chờ vật tư",
    CHO_NGUNG_MAY: "Chờ ngừng máy",
    DA_XU_LY: "Đã xử lý xong",
  };
  return labels[status] ?? "Chưa xử lý";
}

function normalizeRow(row: unknown): string[] {
  const values = Array.isArray(row) ? row.slice(0, COLUMN_COUNT).map(text) : [];
  while (values.length < COLUMN_COUNT) values.push("");
  return values;
}

function normalizedIdentityCell(value: unknown) {
  return text(value).replace(/\s+/g, " ").toLocaleLowerCase("vi");
}

function sameCreateIdentity(left: string[], right: string[]) {
  // B:F là phần nhận diện ổn định của một phiếu: tổ máy, thiết bị, cương vị,
  // nội dung và ngày phát hiện. Các cột phía sau có thể được Vận hành sửa sau
  // khi website đã ghi nhưng trước khi ACK, nên không dùng để nhận diện retry.
  return [1, 2, 3, 4, 5].every(
    (index) => normalizedIdentityCell(left[index]) === normalizedIdentityCell(right[index])
  );
}

function baseRow(payload: Payload, sheetSequence: string) {
  return [
    sheetSequence,
    text(payload.unit),
    text(payload.device),
    text(payload.position),
    text(payload.content),
    dateVi(payload.detectedAt),
    shortShiftLeaderName(payload.shiftLeader),
    "",
    text(payload.repeatedRepair),
    text(payload.fireSafetyImpact),
    text(payload.environmentSafetyImpact),
    text(payload.severity),
    text(payload.condition),
    statusLabel(text(payload.status)),
    text(payload.note),
  ];
}

function reminderPrefix(requestNumber: string) {
  return `Nhắc lại pyc ${requestNumber} ra ngày `;
}

function fullReminderHistory(payload: Payload) {
  const legacyLines = text(payload.legacyReminderRaw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^số lần nhắc lại\s*:/i.test(line));
  const dateKeyOf = (value: string) => {
    const match = value.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (!match) return null;
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  };
  const newEntries = (payload.reminderHistory ?? []).flatMap((item) => {
    const displayDate = dateVi(item.remindedAt);
    const key = dateKeyOf(displayDate);
    return key ? [{ key, displayDate }] : [];
  });
  const newDateKeys = new Set(newEntries.map((item) => item.key));
  const otherLegacyLines: string[] = [];
  const legacyEntries: Array<{ key: string; displayDate: string }> = [];
  for (const line of legacyLines) {
    const key = dateKeyOf(line);
    // Sheet cũ chỉ ghi đầy đủ "Nhắc lại lần 1" ở dòng đầu; những dòng sau có
    // dạng rút gọn "Lần 2", "Lần 3". Cả hai phải được đưa vào cùng một lịch sử
    // để đánh lại số thứ tự, đồng thời loại bản ghi web đã đồng bộ vòng về có
    // cùng ngày với một mốc cũ.
    const isNumberedReminder = /^(?:nhac lai\s*)?lan\s*(?:thu\s*)?\d+\b/.test(normalizeText(line));
    if (isNumberedReminder && key) {
      // Dòng này có thể chính là log web đã đồng bộ vòng về; log web là nguồn
      // chính xác hơn nên không giữ thêm bản legacy trùng ngày.
      if (!newDateKeys.has(key)) legacyEntries.push({ key, displayDate: line.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/)![0] });
    } else {
      otherLegacyLines.push(line);
    }
  }
  const numberedLines = [...legacyEntries, ...newEntries]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((item, index) => `Nhắc lại lần ${index + 1} ngày ${item.displayDate}`);
  const count = Math.max(
    Number(payload.reminderCount) || 0,
    reminderSummaryOf(payload.legacyReminderRaw).count,
    numberedLines.length
  );
  const history = [...new Set([...otherLegacyLines, ...numberedLines])].join("\n");
  return history ? `Số lần nhắc lại: ${count}\n${history}` : "";
}

export function buildDefectSheetWritePlan(
  event: DefectSheetOutboxEvent,
  inputRows: unknown[]
): DefectSheetWritePlan {
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    throw new Error("Payload outbox không hợp lệ");
  }
  const payload = event.payload as unknown as Payload;
  const requestNumber = text(payload.requestNumber);
  if (!requestNumber) throw new Error("Sự kiện không có số yêu cầu");
  const { sequence, year } = parseRequestNumber(requestNumber);

  const rows = inputRows.map(normalizeRow);
  let originals = rows
    .map((row, index) => ({ row, sheetRow: START_ROW + index }))
    .filter(({ row }) => {
      if (row[4].startsWith(reminderPrefix(requestNumber))) return false;
      if (row[0] === requestNumber) return true;
      return row[0] === sequence && yearFromSheetDate(row[5]) === year;
    });
  let recoveredCopiedReminderRow: number | null = null;
  if (originals.length > 1) {
    // Một lần REMIND có thể đã copy PASTE_NORMAL thành công rồi mất kết nối trước
    // bước ghi values. Khi đó Sheet có đúng hai hàng A:O giống hệt nhau: hàng
    // thấp hơn là gốc, hàng cao hơn là bản copy dở dang. Chỉ phục hồi trường hợp
    // xác định được tuyệt đối này; mọi dạng trùng khác vẫn phải dừng.
    const sorted = [...originals].sort((a, b) => a.sheetRow - b.sheetRow);
    const isRecoverableReminderCopy =
      event.eventType === "REMIND"
      && sorted.length === 2
      && JSON.stringify(sorted[0].row) === JSON.stringify(sorted[1].row);
    if (!isRecoverableReminderCopy) {
      throw new Error(`Sheet có ${originals.length} hàng gốc cùng số ${requestNumber}`);
    }
    originals = [sorted[0]];
    recoveredCopiedReminderRow = sorted[1].sheetRow;
  }

  const writes: DefectSheetWritePlan["writes"] = [];
  const current = baseRow(payload, sequence);

  if (payload.cancellation === true) {
    // Hủy trên website = trả hàng Sheet về trạng thái chờ để STT có thể cấp lại:
    // giữ nguyên cột A của hàng gốc, chỉ làm trống dữ liệu nghiệp vụ B:O. Không
    // xóa nguyên hàng vì sẽ làm dịch chuyển công thức/định dạng và các hàng dưới.
    //
    // UPDATE có thể đã gộp vào một CREATE chưa chạy (eventType vẫn là CREATE),
    // nên phải xử lý cờ cancellation TRƯỚC nhánh CREATE/UPDATE thông thường.
    if (originals.length === 0) {
      // Dòng chưa từng được ghi hoặc đã bị xóa thủ công: trạng thái đích đã đạt,
      // trả kế hoạch rỗng để n8n ACK, không retry vô hạn.
      return { eventId: event.id, eventType: event.eventType, requestNumber, writes };
    }

    const original = originals[0];
    writes.push({
      range: `B${original.sheetRow}:O${original.sheetRow}`,
      values: [Array.from({ length: COLUMN_COUNT - 1 }, () => "")],
    });

    // Dữ liệu cũ có thể có các hàng nhắc lại riêng. Những hàng này không phải
    // hàng giữ STT nên làm trống A:O; nếu chỉ xóa B:O sẽ để lại STT trùng và lần
    // cấp số kế tiếp bị báo xung đột.
    const prefix = reminderPrefix(requestNumber);
    for (const row of rows.map((value, index) => ({ value, sheetRow: START_ROW + index }))) {
      if (!row.value[4].startsWith(prefix)) continue;
      writes.push({
        range: `A${row.sheetRow}:O${row.sheetRow}`,
        values: [Array.from({ length: COLUMN_COUNT }, () => "")],
      });
    }
    return { eventId: event.id, eventType: event.eventType, requestNumber, writes };
  }

  const previousRequestNumber = text(payload.previousRequestNumber);
  if (previousRequestNumber && previousRequestNumber !== requestNumber) {
    const previousParsed = parseRequestNumber(previousRequestNumber);
    const previousOriginals = rows
      .map((row, index) => ({ row, sheetRow: START_ROW + index }))
      .filter(({ row }) => {
        if (row[4].startsWith(reminderPrefix(previousRequestNumber))) return false;
        if (row[0] === previousRequestNumber) return true;
        return row[0] === previousParsed.sequence && yearFromSheetDate(row[5]) === previousParsed.year;
      });
    if (previousOriginals.length > 1) {
      throw new Error(`Sheet có ${previousOriginals.length} hàng gốc cùng số ${previousRequestNumber}`);
    }
    if (originals.length === 1) {
      const targetIsPlaceholder = originals[0].row.slice(1).every((cell) => !cell);
      if (!targetIsPlaceholder && !sameCreateIdentity(originals[0].row, current)) {
        throw new DefectSheetRequestNumberConflictError(requestNumber);
      }
    }
    const preparedTargets = rows
      .map((row, index) => ({ row, sheetRow: START_ROW + index }))
      .filter(({ row }) => row[0] === sequence && row.slice(1).every((cell) => !cell));
    if (preparedTargets.length > 1) {
      throw new Error(`Sheet có ${preparedTargets.length} dòng chờ cùng STT ${sequence}`);
    }

    // Chuyển nội dung sang đúng dòng giữ STT mới. Không chèn/xóa hàng để tránh
    // dịch công thức: dòng STT cũ trở lại trạng thái chờ (giữ A, xóa B:O).
    const targetRow = originals[0]?.sheetRow ?? preparedTargets[0]?.sheetRow ?? START_ROW + rows.length;
    writes.push({ range: `A${targetRow}:O${targetRow}`, values: [current] });
    const previous = previousOriginals[0];
    if (previous && previous.sheetRow !== targetRow) {
      writes.push({
        range: `B${previous.sheetRow}:O${previous.sheetRow}`,
        values: [Array.from({ length: COLUMN_COUNT - 1 }, () => "")],
      });
    }
    return { eventId: event.id, eventType: event.eventType, requestNumber, writes };
  }

  if (event.eventType === "CREATE") {
    if (originals.length === 1) {
      // Dòng chỉ giữ STT ở A và trống B:O có thể đến từ phiếu hủy hoặc STT cũ
      // vừa được giải phóng sau thao tác đổi số. Snapshot Sheet là lớp xác nhận
      // cuối cùng trước khi ghi nên có thể dùng an toàn cho cả hai nguồn.
      if (originals[0].row.slice(1).every((cell) => !cell)) {
        writes.push({ range: `A${originals[0].sheetRow}:O${originals[0].sheetRow}`, values: [current] });
        return { eventId: event.id, eventType: event.eventType, requestNumber, writes };
      }
      if (text(payload.replacesCancelledDefectId)) {
        const reusablePlaceholder = originals[0].row.slice(1).every((cell) => !cell);
        const completedCancelledRow =
          normalizedIdentityCell(originals[0].row[13]) === normalizedIdentityCell(statusLabel("DA_XU_LY"));
        if (!reusablePlaceholder && !completedCancelledRow) {
          // Số đã hủy chỉ được ghi đè khi hàng cũ thật sự hoàn tất. Nếu trạng
          // thái trên Sheet đã thay đổi hoặc hàng chưa được xóa sạch, coi đây
          // là xung đột số. Hàng đã hủy và ACK đúng chuẩn chỉ còn STT ở cột A,
          // B:O trống hoàn toàn nên được phép nhận phiếu mới ngay tại dòng cũ.
          throw new DefectSheetRequestNumberConflictError(requestNumber);
        }
        writes.push({ range: `A${originals[0].sheetRow}:O${originals[0].sheetRow}`, values: [current] });
        return { eventId: event.id, eventType: event.eventType, requestNumber, writes };
      }
      // Chỉ được xem là retry nếu đúng dữ liệu nhận diện của phiếu website.
      // Cùng số nhưng nội dung khác là phiếu nhập tay trên Sheet: dừng để API
      // cấp lại số, tuyệt đối không ghi đè.
      if (!sameCreateIdentity(originals[0].row, current)) {
        throw new DefectSheetRequestNumberConflictError(requestNumber);
      }
      writes.push({ range: `A${originals[0].sheetRow}:O${originals[0].sheetRow}`, values: [current] });
      return { eventId: event.id, eventType: event.eventType, requestNumber, writes };
    }
    // Sheet vận hành thường kéo sẵn STT cho các dòng chờ. Chỉ được dùng đúng
    // dòng mang STT vừa cấp và còn trống B:O; tuyệt đối không lấy một dòng trống
    // bất kỳ ở phần tiêu đề hoặc nằm giữa lịch sử.
    const preparedRows = rows
      .map((row, index) => ({ row, sheetRow: START_ROW + index }))
      .filter(({ row }) => row[0] === sequence && row.slice(1).every((cell) => !cell));
    if (preparedRows.length > 1) {
      throw new Error(`Sheet có ${preparedRows.length} dòng chờ cùng STT ${sequence}`);
    }
    const targetRow = preparedRows[0]?.sheetRow ?? START_ROW + rows.length;
    writes.push({ range: `A${targetRow}:O${targetRow}`, values: [current] });
    return { eventId: event.id, eventType: event.eventType, requestNumber, writes };
  }

  if (originals.length !== 1) {
    throw new Error(`Không tìm thấy đúng một hàng gốc cho số ${requestNumber}`);
  }
  const original = originals[0];

  if (event.eventType === "UPDATE") {
    if (payload.writeScope === "SOURCE_CORRECTION_ONLY") {
      writes.push({ range: `E${original.sheetRow}`, values: [[current[4]]] });
      writes.push({ range: `I${original.sheetRow}`, values: [[current[8]]] });
      return { eventId: event.id, eventType: event.eventType, requestNumber, writes };
    }
    if (payload.writeScope === "SHEET_ORIGIN_WITH_CORRECTION") {
      writes.push({ range: `E${original.sheetRow}`, values: [[current[4]]] });
      writes.push({ range: `I${original.sheetRow}`, values: [[current[8]]] });
      writes.push({ range: `J${original.sheetRow}:O${original.sheetRow}`, values: [[...current.slice(9, 15)]] });
      return { eventId: event.id, eventType: event.eventType, requestNumber, writes };
    }
    if (payload.writeScope === "NOTE_ONLY") {
      writes.push({ range: `O${original.sheetRow}`, values: [[current[14]]] });
      return { eventId: event.id, eventType: event.eventType, requestNumber, writes };
    }
    if (payload.writeScope === "SHEET_ORIGIN_LIMITED") {
      writes.push({ range: `J${original.sheetRow}:O${original.sheetRow}`, values: [[...current.slice(9, 15)]] });
      // Các hàng nhắc lại kiểu cũ vẫn nằm riêng trên Sheet. Chỉ đồng bộ hai
      // trường Vận hành đang được website sở hữu; không ghi đè cột M hoặc dữ
      // liệu sửa chữa của những hàng lịch sử này.
      const prefix = reminderPrefix(requestNumber);
      for (const row of rows.map((value, index) => ({ value, sheetRow: START_ROW + index }))) {
        if (!row.value[4].startsWith(prefix)) continue;
        writes.push({ range: `J${row.sheetRow}:O${row.sheetRow}`, values: [[...current.slice(9, 15)]] });
      }
      return { eventId: event.id, eventType: event.eventType, requestNumber, writes };
    }
    // Nhắc lại chỉ nằm ở cột H của hàng gốc. Giữ nguyên lịch sử hiện có khi
    // người dùng sửa các thông tin khác của phiếu.
    current[7] = original.row[7];
    writes.push({ range: `A${original.sheetRow}:O${original.sheetRow}`, values: [current] });
    const prefix = reminderPrefix(requestNumber);
    for (const row of rows.map((value, index) => ({ value, sheetRow: START_ROW + index }))) {
      if (!row.value[4].startsWith(prefix)) continue;
      writes.push({ range: `J${row.sheetRow}:N${row.sheetRow}`, values: [[...current.slice(9, 14)]] });
    }
    return { eventId: event.id, eventType: event.eventType, requestNumber, writes };
  }

  if (event.eventType !== "REMIND") throw new Error(`Loại sự kiện không hỗ trợ: ${event.eventType}`);
  const reminderNumber = Number(payload.reminderNumber);
  const remindedAt = dateVi(payload.remindedAt);
  if (!Number.isInteger(reminderNumber) || reminderNumber < 1 || !remindedAt) {
    throw new Error("Sự kiện nhắc lại thiếu số lần hoặc ngày nhắc");
  }
  const reminderHistory = payload.reminderHistory ?? [];
  if (!reminderHistory.some((item) => item.reminderNumber === reminderNumber)) {
    throw new Error(`Lịch sử nhắc lại của phiếu ${requestNumber} chưa đủ lần ${reminderNumber}`);
  }

  const history = fullReminderHistory(payload);
  if (payload.writeScope === "SHEET_ORIGIN_LIMITED") {
    writes.push({ range: `H${original.sheetRow}`, values: [[history]] });
    return { eventId: event.id, eventType: event.eventType, requestNumber, writes };
  }
  // Nghiệp vụ mới chỉ cập nhật hàng gốc, không tạo/copy hàng nhắc riêng.
  writes.push({ range: `D${original.sheetRow}`, values: [[current[3]]] });
  writes.push({ range: `G${original.sheetRow}`, values: [[current[6]]] });
  writes.push({ range: `H${original.sheetRow}`, values: [[history]] });
  return { eventId: event.id, eventType: event.eventType, requestNumber, writes };
}

export class DefectSheetRequestNumberConflictError extends Error {
  constructor(public readonly requestNumber: string) {
    super(`Số yêu cầu ${requestNumber} đã có phiếu khác trên Sheet`);
    this.name = "DefectSheetRequestNumberConflictError";
  }
}

/** Các số đã có dữ liệu nghiệp vụ. Dòng chỉ điền STT và để trống B:O là dòng
 * giữ chỗ, không phải xung đột và vẫn được phép nhận phiếu website. */
export function usedDefectRequestNumbersFromSheet(inputRows: unknown[]) {
  const used = new Set<string>();
  for (const row of inputRows.map(normalizeRow)) {
    if (!row[0] || !row.slice(1).some(Boolean)) continue;
    const fullNumber = row[0].match(/^([a-z]+\d+|\d+)\/(\d{4})$/i);
    if (fullNumber) {
      used.add(`${fullNumber[1].toUpperCase()}/${fullNumber[2]}`);
      continue;
    }
    const year = yearFromSheetDate(row[5]);
    if (year) used.add(`${row[0].toUpperCase()}/${year}`);
  }
  return used;
}

export type DefectSheetBatchWritePlan = {
  eventIds: string[];
  eventCount: number;
  requestNumbers: string[];
  writes: DefectSheetWritePlan["writes"];
};

export class DefectSheetBatchEventError extends Error {
  constructor(
    public readonly eventId: string,
    public readonly eventError: unknown
  ) {
    super(eventError instanceof Error ? eventError.message : "Không thể lập kế hoạch cho sự kiện");
    this.name = "DefectSheetBatchEventError";
  }
}

function columnIndex(value: string) {
  const code = value.toUpperCase().charCodeAt(0) - 65;
  if (code < 0 || code >= COLUMN_COUNT) throw new Error(`Cột ngoài phạm vi A:O: ${value}`);
  return code;
}

function columnName(index: number) {
  return String.fromCharCode(65 + index);
}

function applyWrites(rows: string[][], writes: DefectSheetWritePlan["writes"]) {
  for (const write of writes) {
    const match = write.range.match(/^([A-O])(\d+)(?::([A-O])(\d+))?$/i);
    if (!match) throw new Error(`Vùng ghi không được hỗ trợ trong lô: ${write.range}`);
    const startColumn = columnIndex(match[1]);
    const startRow = Number(match[2]);
    const endColumn = columnIndex(match[3] ?? match[1]);
    const endRow = Number(match[4] ?? match[2]);
    if (startRow !== endRow || startRow < START_ROW || write.values.length !== 1) {
      throw new Error(`Lô chỉ hỗ trợ ghi một hàng trong A:O: ${write.range}`);
    }
    const values = write.values[0].map(text);
    if (values.length !== endColumn - startColumn + 1) {
      throw new Error(`Số ô không khớp vùng ${write.range}`);
    }
    const rowIndex = startRow - START_ROW;
    while (rows.length <= rowIndex) rows.push(normalizeRow([]));
    for (let offset = 0; offset < values.length; offset += 1) {
      rows[rowIndex][startColumn + offset] = values[offset];
    }
  }
}

/**
 * Lập kế hoạch tuần tự cho nhiều event cùng một Sheet trên một snapshot duy nhất.
 * Mỗi kế hoạch được áp vào bản sao trong bộ nhớ trước khi xử lý event kế tiếp, nhờ
 * vậy nhiều CREATE trong cùng lô luôn nhận các dòng khác nhau. Kết quả cuối được
 * nén thành các dải ô không chồng lấn để Google chỉ cần một values:batchUpdate.
 */
export function buildDefectSheetBatchWritePlan(
  events: DefectSheetOutboxEvent[],
  inputRows: unknown[]
): DefectSheetBatchWritePlan {
  if (!events.length) throw new Error("Lô đồng bộ không có sự kiện");
  const before = inputRows.map(normalizeRow);
  const after = before.map((row) => [...row]);
  const plans: DefectSheetWritePlan[] = [];

  for (const event of events) {
    try {
      const plan = buildDefectSheetWritePlan(event, after);
      applyWrites(after, plan.writes);
      plans.push(plan);
    } catch (error) {
      throw new DefectSheetBatchEventError(event.id, error);
    }
  }

  const writes: DefectSheetWritePlan["writes"] = [];
  const rowCount = Math.max(before.length, after.length);
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const previous = before[rowIndex] ?? normalizeRow([]);
    const current = after[rowIndex] ?? normalizeRow([]);
    let column = 0;
    while (column < COLUMN_COUNT) {
      if (previous[column] === current[column]) {
        column += 1;
        continue;
      }
      const start = column;
      while (column + 1 < COLUMN_COUNT && previous[column + 1] !== current[column + 1]) {
        column += 1;
      }
      const end = column;
      const sheetRow = START_ROW + rowIndex;
      writes.push({
        range: start === end
          ? `${columnName(start)}${sheetRow}`
          : `${columnName(start)}${sheetRow}:${columnName(end)}${sheetRow}`,
        values: [[...current.slice(start, end + 1)]],
      });
      column += 1;
    }
  }

  return {
    eventIds: events.map((event) => event.id),
    eventCount: events.length,
    requestNumbers: plans.map((plan) => plan.requestNumber),
    writes,
  };
}
