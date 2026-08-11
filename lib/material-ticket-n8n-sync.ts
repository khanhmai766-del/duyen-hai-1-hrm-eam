import { createHash, timingSafeEqual } from "crypto";

export const MATERIAL_TICKET_SYNC_DEFAULT_LIMIT = 100;
export const MATERIAL_TICKET_SYNC_MAX_LIMIT = 200;

type MaterialTicketSyncCursor = {
  updatedAt: string;
  id: string;
  boundary: string;
};

type MaterialTicketSyncItem = {
  id: string;
  erpCode: string | null;
  erpName: string | null;
  deviceNameManual: string | null;
  quantity: number;
  material: {
    code: string;
    name: string;
    unit: string;
  };
  device: {
    name: string;
  } | null;
};

export type MaterialTicketForN8nSync = {
  id: string;
  sequenceMonth: string;
  sequenceNumber: number;
  status: string;
  assignedPosition: string;
  materialCategory: string | null;
  proposalNumber: string | null;
  proposalNote: string | null;
  pctNumber: string | null;
  bbntDoNumber: string | null;
  deliveryNoteNumber: string | null;
  completionNote: string | null;
  bbktNumber: string | null;
  recoveryRequired: boolean | null;
  recoveryQuantity: number | null;
  recoveryReturnedAt: Date | null;
  recoveryDocNo: number | null;
  recoveryDocNoYear: number | null;
  createdByName: string;
  proposedByName: string | null;
  proposedByPosition: string | null;
  proposedAt: Date | null;
  vhvReceivedQuantity: number | null;
  vhvReceivedByName: string | null;
  vhvReceivedAt: Date | null;
  receivedQuantity: number | null;
  receivedMethod: string | null;
  receivedByName: string | null;
  receivedAt: Date | null;
  usedQuantity: number | null;
  remainingQuantity: number | null;
  materialUserName: string | null;
  usedByName: string | null;
  usedAt: Date | null;
  completedByName: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: MaterialTicketSyncItem[];
};

function tokenMatches(expected: string, received: string) {
  const expectedHash = createHash("sha256").update(expected).digest();
  const receivedHash = createHash("sha256").update(received).digest();
  return timingSafeEqual(expectedHash, receivedHash);
}

export function verifyN8nMaterialTicketToken(authorization: string | null) {
  const expected = process.env.N8N_MATERIAL_SYNC_TOKEN?.trim() ?? "";
  const received = authorization?.replace(/^Bearer\s+/i, "").trim() ?? "";
  return Boolean(expected && received && tokenMatches(expected, received));
}

export function parseMaterialTicketSyncLimit(value: string | null) {
  if (!value) return MATERIAL_TICKET_SYNC_DEFAULT_LIMIT;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MATERIAL_TICKET_SYNC_MAX_LIMIT) {
    throw new Error(`limit phải là số nguyên từ 1 đến ${MATERIAL_TICKET_SYNC_MAX_LIMIT}`);
  }
  return limit;
}

export function parseMaterialTicketUpdatedAfter(value: string | null) {
  if (!value) return new Date(0);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("updatedAfter không hợp lệ");
  return date;
}

export function encodeMaterialTicketSyncCursor(ticket: { id: string; updatedAt: Date }, boundary: Date) {
  const payload: MaterialTicketSyncCursor = {
    updatedAt: ticket.updatedAt.toISOString(),
    id: ticket.id,
    boundary: boundary.toISOString(),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeMaterialTicketSyncCursor(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<MaterialTicketSyncCursor>;
    const id = String(parsed.id ?? "").trim();
    const updatedAt = new Date(String(parsed.updatedAt ?? ""));
    const boundary = new Date(String(parsed.boundary ?? ""));
    if (!id || !Number.isFinite(updatedAt.getTime()) || !Number.isFinite(boundary.getTime())) {
      throw new Error("invalid cursor");
    }
    return { id, updatedAt, boundary };
  } catch {
    throw new Error("cursor không hợp lệ");
  }
}

const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

function formatDate(value: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: VIETNAM_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function formatDateTime(value: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: VIETNAM_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(value).replace(",", "");
}

function joinText(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" · ") || null;
}

function joinUniqueText(parts: Array<string | null | undefined>) {
  const unique = Array.from(new Set(parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part))));
  return unique.join(" · ") || null;
}

function quantityWithUnit(value: number | null, unit: string) {
  if (value == null) return null;
  return `${value.toLocaleString("vi-VN")} ${unit.trim()}`.trim();
}

function recoverySummary(ticket: MaterialTicketForN8nSync, unit: string) {
  if (!ticket.recoveryRequired && !ticket.recoveryQuantity && !ticket.recoveryReturnedAt) return null;
  return joinText([
    ticket.recoveryReturnedAt ? `Ngày trả: ${formatDate(ticket.recoveryReturnedAt)}` : null,
    ticket.materialUserName || ticket.usedByName
      ? `Người trả: ${ticket.materialUserName ?? ticket.usedByName}`
      : null,
    ticket.recoveryQuantity != null ? `Số lượng trả: ${quantityWithUnit(ticket.recoveryQuantity, unit)}` : null,
  ]);
}

function recoveryDocumentNumber(ticket: MaterialTicketForN8nSync) {
  if (ticket.recoveryDocNo == null) return null;
  return ticket.recoveryDocNoYear
    ? `${ticket.recoveryDocNo}/${ticket.recoveryDocNoYear}`
    : String(ticket.recoveryDocNo);
}

/**
 * Dữ liệu được trả theo ký tự cột để n8n map thủ công vào VT_DONGBO!A2:AJ.
 * AJ (SYNCED_AT) do n8n tự ghi tại thời điểm Google Sheets xác nhận thành công.
 */
export function materialTicketRowsForN8n(ticket: MaterialTicketForN8nSync) {
  return ticket.items.map((item) => {
    const syncKey = `${ticket.id}:${item.id}`;
    const receivedAt = ticket.receivedAt ?? ticket.vhvReceivedAt;
    const receivedQuantity = ticket.receivedQuantity ?? ticket.vhvReceivedQuantity;
    const receivedByName = ticket.receivedByName ?? ticket.vhvReceivedByName;
    const proposedAt = ticket.proposedAt ?? ticket.createdAt;
    const proposedByName = ticket.proposedByName ?? ticket.createdByName;
    const proposedByPosition = ticket.proposedByPosition ?? ticket.assignedPosition;
    const materialUserName = ticket.materialUserName ?? ticket.usedByName;
    const unit = item.material.unit;

    return {
      syncKey,
      sourceUpdatedAt: ticket.updatedAt.toISOString(),
      workflowStatus: ticket.status,
      row: {
        A: ticket.sequenceNumber,
        B: ticket.materialCategory,
        C: quantityWithUnit(ticket.remainingQuantity, unit),
        D: ticket.proposalNumber,
        E: formatDate(proposedAt),
        F: proposedByPosition,
        G: proposedByName,
        // Mã ERP chỉ có sau khi Thống kê thực sự chọn mã vật tư.
        H: item.erpCode,
        // Luôn giữ tên nhóm người đề xuất đã chọn trong Danh mục Vận hành 1.
        I: item.material.name,
        J: quantityWithUnit(item.quantity, unit),
        K: ticket.proposalNote,
        // Website hiện chưa có trường ghi chú người đề xuất tách riêng.
        L: null,
        M: formatDate(receivedAt),
        N: quantityWithUnit(receivedQuantity, unit),
        O: receivedByName,
        P: joinUniqueText([ticket.receivedMethod, ticket.deliveryNoteNumber]),
        Q: null,
        R: materialUserName,
        S: formatDate(ticket.usedAt),
        // Chỉ điền khi bước nghiệm thu đã có nội dung xác nhận hoàn thành.
        T: ticket.completionNote,
        U: ticket.pctNumber,
        V: quantityWithUnit(ticket.usedQuantity, unit),
        W: quantityWithUnit(ticket.remainingQuantity, unit),
        X: null,
        Y: recoverySummary(ticket, unit),
        Z: null,
        AA: joinText([formatDate(ticket.completedAt), ticket.completedByName]),
        AB: ticket.completionNote,
        AC: null,
        AD: ticket.bbntDoNumber ?? null,
        AE: recoveryDocumentNumber(ticket),
        AF: null,
        AG: syncKey,
        AH: formatDateTime(ticket.updatedAt),
        AI: ticket.status,
      },
    };
  });
}
