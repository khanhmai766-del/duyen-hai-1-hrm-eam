import type { Prisma } from "@prisma/client";

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
  const match = text(value).match(/^(\d+)\/(\d{4})$/);
  if (!match) throw new Error(`Số yêu cầu không đúng định dạng STT/năm: ${text(value)}`);
  return { sequence: match[1], year: Number(match[2]) };
}

function yearFromSheetDate(value: unknown) {
  const match = text(value).match(/^\d{1,2}[/-]\d{1,2}[/-](\d{4})$/);
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
  const newLines = (payload.reminderHistory ?? [])
    .map((item) => `Nhắc lại lần ${item.reminderNumber} ngày ${dateVi(item.remindedAt)}`)
    .filter(Boolean);
  const count = Number(payload.reminderCount) || payload.reminderHistory?.length || 0;
  const history = [...new Set([...legacyLines, ...newLines])].join("\n");
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

  if (event.eventType === "CREATE") {
    if (originals.length === 1) {
      // Retry sau khi Google đã ghi nhưng ACK bị mất: chuyển thành update idempotent.
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

export type DefectSheetBatchWritePlan = {
  eventIds: string[];
  eventCount: number;
  requestNumbers: string[];
  writes: DefectSheetWritePlan["writes"];
};

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
    const plan = buildDefectSheetWritePlan(event, after);
    applyWrites(after, plan.writes);
    plans.push(plan);
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
