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

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function joinText(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" · ") || null;
}

function recoverySummary(ticket: MaterialTicketForN8nSync) {
  if (!ticket.recoveryRequired && !ticket.recoveryQuantity && !ticket.recoveryReturnedAt) return null;
  return joinText([
    ticket.recoveryReturnedAt ? `Ngày trả: ${ticket.recoveryReturnedAt.toISOString()}` : null,
    ticket.recoveryQuantity != null ? `Số lượng trả: ${ticket.recoveryQuantity}` : null,
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
    const purpose = item.deviceNameManual ?? item.device?.name ?? null;

    return {
      syncKey,
      sourceUpdatedAt: ticket.updatedAt.toISOString(),
      workflowStatus: ticket.status,
      row: {
        A: ticket.sequenceNumber,
        B: ticket.materialCategory,
        C: ticket.remainingQuantity,
        D: ticket.proposalNumber,
        E: iso(proposedAt),
        F: proposedByPosition,
        G: proposedByName,
        H: item.erpCode ?? item.material.code,
        I: item.erpName ?? item.material.name,
        J: item.quantity,
        K: purpose,
        L: ticket.proposalNote,
        M: iso(receivedAt),
        N: receivedQuantity,
        O: receivedByName,
        P: joinText([ticket.receivedMethod, ticket.deliveryNoteNumber]),
        Q: null,
        R: materialUserName,
        S: iso(ticket.usedAt),
        T: ticket.completionNote ?? purpose,
        U: ticket.pctNumber,
        V: ticket.usedQuantity,
        W: ticket.remainingQuantity,
        X: null,
        Y: recoverySummary(ticket),
        Z: null,
        AA: joinText([iso(ticket.completedAt), ticket.completedByName]),
        AB: ticket.completionNote,
        AC: null,
        AD: ticket.bbntDoNumber ?? null,
        AE: recoveryDocumentNumber(ticket),
        AF: null,
        AG: syncKey,
        AH: ticket.updatedAt.toISOString(),
        AI: ticket.status,
      },
    };
  });
}
