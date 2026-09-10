import { Prisma, type PrismaClient } from "@prisma/client";
import {
  chemicalTicketRowsForN8nV2,
  materialTicketRowsForN8nV2,
  type MaterialTicketForN8nSync,
} from "@/lib/material-ticket-n8n-sync";
import { positionLabelOf } from "@/lib/position-catalog";
import { toNumber, toNumberRequired } from "@/lib/chemical-inventory/serialize";
import { UNIT_LABELS, type BaseUnit } from "@/lib/chemical-inventory/constants";

export const BACKUP_SCOPES = ["materials", "chemicals", "receipts"] as const;
export type BackupScope = (typeof BACKUP_SCOPES)[number];
// Trả một ảnh chụp đầy đủ để phân biệt mất dữ liệu với chưa lấy hết trang.
// Vượt giới hạn phải báo lỗi, tuyệt đối không trả ảnh chụp bị cắt cụt.
export const BACKUP_MAX_RECORDS = 10_000;
export const BACKUP_CONTRACT = "material-backup-v1";

export type BackupRow = {
  syncKey: string;
  entityId: string;
  sourceUpdatedAt: string;
  values: Array<string | number | null>;
};

export function backupTicketRows(ticket: MaterialTicketForN8nSync, scope: "materials" | "chemicals"): BackupRow[] {
  const mapped = scope === "materials"
    ? materialTicketRowsForN8nV2(ticket)
    : chemicalTicketRowsForN8nV2(ticket);
  // Bố cục file dự phòng ngày 09/09/2026: bỏ các cột trống của V2,
  // riêng hóa chất bỏ thêm Hiện có, Số ĐXVT và Mã ERP.
  const columns = scope === "materials"
    ? "A B C D E F G H I J K L M O P Q R T U V W X Y AA AC AD AF AG AI AJ AK"
    : "A B C D G H I K L M O P Q R S T";
  return mapped.map((entry) => {
    const source = entry.row as Record<string, string | number | null>;
    return {
      syncKey: entry.syncKey,
      entityId: ticket.id,
      sourceUpdatedAt: entry.sourceUpdatedAt,
      values: columns.split(" ").map((column) => source[column] ?? null),
    };
  });
}

const RECEIPT_SELECT = {
  id: true, receivedAt: true, vehicleNumber: true, vehicleRef: true,
  plantWeight: true, contractorWeight: true, acceptedWeight: true,
  receivingPosition: true, receivingPositionRaw: true, updatedAt: true,
  item: { select: { name: true, baseUnit: true } },
} as const satisfies Prisma.ChemicalReceiptSelect;

type Receipt = Prisma.ChemicalReceiptGetPayload<{ select: typeof RECEIPT_SELECT }>;

export function backupReceiptRow(receipt: Receipt): BackupRow {
  const date = receipt.receivedAt.toISOString().slice(0, 10).split("-").reverse().join("/");
  const updatedAt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(receipt.updatedAt).replace(",", "");
  const unit = UNIT_LABELS[receipt.item.baseUnit as BaseUnit] ?? receipt.item.baseUnit;
  return {
    syncKey: `receipt:${receipt.id}`,
    entityId: receipt.id,
    sourceUpdatedAt: receipt.updatedAt.toISOString(),
    values: [
      date, `${receipt.item.name} (${unit})`, receipt.vehicleNumber ?? receipt.vehicleRef,
      toNumber(receipt.plantWeight), toNumber(receipt.contractorWeight), toNumberRequired(receipt.acceptedWeight),
      receipt.receivingPositionRaw || positionLabelOf(receipt.receivingPosition) || null,
      `receipt:${receipt.id}`, updatedAt, "Đã ghi nhận",
    ],
  };
}

function assertComplete(count: number) {
  if (count > BACKUP_MAX_RECORDS) {
    throw new Error(`Dữ liệu dự phòng vượt ${BACKUP_MAX_RECORDS} bản ghi; dừng đồng bộ để tránh đánh dấu thiếu sai`);
  }
}

export async function readBackupSnapshot(db: PrismaClient, scope: BackupScope) {
  return db.$transaction(async (tx) => {
    const snapshotAt = new Date().toISOString();
    let rows: BackupRow[];
    let entityIds: string[];
    if (scope === "receipts") {
      const receipts = await tx.chemicalReceipt.findMany({
        select: RECEIPT_SELECT,
        orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
        take: BACKUP_MAX_RECORDS + 1,
      });
      assertComplete(receipts.length);
      rows = receipts.map(backupReceiptRow);
      entityIds = receipts.map((receipt) => receipt.id);
    } else {
      // Giữ cả ID phiếu ngoài phạm vi để không nhầm đổi loại phiếu với xóa phiếu.
      const identities = await tx.materialTicket.findMany({ select: { id: true }, take: BACKUP_MAX_RECORDS + 1 });
      assertComplete(identities.length);
      entityIds = identities.map((ticket) => ticket.id);
      const tickets = await tx.materialTicket.findMany({
        where: { sequenceScope: scope === "materials" ? "MATERIAL" : "CHEMICAL" },
        include: {
          items: {
            include: {
              material: { select: { code: true, name: true, unit: true, category: true } },
              device: { select: { name: true } },
            },
            orderBy: { id: "asc" },
          },
        },
        orderBy: [{ sequenceMonth: "asc" }, { sequenceNumber: "asc" }, { id: "asc" }],
        take: BACKUP_MAX_RECORDS + 1,
      });
      assertComplete(tickets.length);
      rows = tickets.flatMap((ticket) => backupTicketRows(ticket, scope));
    }
    assertComplete(rows.length);
    return {
      rows,
      meta: {
        contract: BACKUP_CONTRACT, scope, complete: true,
        snapshotAt, rowCount: rows.length, entityIds,
      },
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
}

export async function readBackupChanges(db: PrismaClient, scope: BackupScope, updatedAfter: Date | null, reconcile: boolean) {
  if (updatedAfter && (!Number.isFinite(updatedAfter.getTime()) || updatedAfter.getTime() > Date.now())) {
    throw new Error("Mốc đồng bộ không hợp lệ");
  }
  // Giữ khoảng giao nhau để thay đổi gần ranh giới được đọc lại an toàn.
  const since = updatedAfter ? new Date(Math.max(0, updatedAfter.getTime() - 60_000)) : new Date(0);
  return db.$transaction(async (tx) => {
    const boundary = new Date();
    const timeFilter = { gt: since, lte: boundary };
    const checkInventory = !updatedAfter || reconcile;
    let rows: BackupRow[];
    let changedEntityIds: string[];
    let inventory: { entityIds: string[]; syncKeys: string[] } | null = null;
    if (scope === "receipts") {
      const receipts = await tx.chemicalReceipt.findMany({
        where: { updatedAt: timeFilter }, select: RECEIPT_SELECT,
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: BACKUP_MAX_RECORDS + 1,
      });
      assertComplete(receipts.length);
      rows = receipts.map(backupReceiptRow);
      changedEntityIds = receipts.map((row) => row.id);
      if (checkInventory) {
        const ids = await tx.chemicalReceipt.findMany({ select: { id: true }, take: BACKUP_MAX_RECORDS + 1 });
        assertComplete(ids.length);
        inventory = { entityIds: ids.map((row) => row.id), syncKeys: ids.map((row) => `receipt:${row.id}`) };
      }
    } else {
      // Đọc cả phiếu vừa đổi phạm vi để đánh dấu dòng cũ ở tab trước đó.
      const tickets = await tx.materialTicket.findMany({
        where: { updatedAt: timeFilter },
        include: { items: { include: {
          material: { select: { code: true, name: true, unit: true, category: true } },
          device: { select: { name: true } },
        }, orderBy: { id: "asc" } } },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: BACKUP_MAX_RECORDS + 1,
      });
      assertComplete(tickets.length);
      const sequenceScope = scope === "materials" ? "MATERIAL" : "CHEMICAL";
      rows = tickets.filter((ticket) => ticket.sequenceScope === sequenceScope)
        .sort((a, b) => a.sequenceMonth.localeCompare(b.sequenceMonth) || a.sequenceNumber - b.sequenceNumber)
        .flatMap((ticket) => backupTicketRows(ticket, scope));
      changedEntityIds = tickets.map((ticket) => ticket.id);
      if (checkInventory) {
        const ticketsWithKeys = await tx.materialTicket.findMany({
          select: { id: true, sequenceScope: true, type: true, items: {
            select: { id: true, material: { select: { category: true } } },
          } }, take: BACKUP_MAX_RECORDS + 1,
        });
        assertComplete(ticketsWithKeys.length);
        inventory = {
          entityIds: ticketsWithKeys.map((ticket) => ticket.id),
          syncKeys: ticketsWithKeys.filter((ticket) => ticket.sequenceScope === sequenceScope).flatMap((ticket) =>
            ticket.items.filter((item) => scope === "chemicals"
              || !["VAT_TU_KHAC", "VAT_TU_KHAC_UNG"].includes(ticket.type)
              || ["Chai Khí", "Chai khí"].includes(item.material.category ?? ""))
              .map((item) => `${ticket.id}:${item.id}`)),
        };
        assertComplete(inventory.syncKeys.length);
      }
    }
    const deletions = updatedAfter ? await tx.auditLog.findMany({
      where: { createdAt: timeFilter, entity: scope === "receipts" ? "ChemicalReceipt" : "MaterialTicket",
        action: scope === "receipts" ? "DELETE_CHEMICAL_RECEIPT" : "MT_DELETE", entityId: { not: null } },
      select: { entityId: true }, take: BACKUP_MAX_RECORDS + 1,
    }) : [];
    assertComplete(deletions.length);
    const tombstones = updatedAfter && scope !== "receipts" ? await tx.materialTicketSyncDeletion.findMany({
      where: { deletedAt: timeFilter }, select: { ticketId: true }, take: BACKUP_MAX_RECORDS + 1,
    }) : [];
    assertComplete(tombstones.length);
    const deletedIds = [...new Set([...deletions.map((row) => row.entityId!), ...tombstones.map((row) => row.ticketId)])];
    const restored = deletedIds.length ? scope === "receipts"
      ? await tx.chemicalReceipt.findMany({ where: { id: { in: deletedIds } }, select: { id: true } })
      : await tx.materialTicket.findMany({ where: { id: { in: deletedIds } }, select: { id: true } })
      : [];
    const restoredIds = new Set(restored.map((row) => row.id));
    assertComplete(rows.length);
    return { rows, meta: {
      contract: "material-backup-v2", scope, complete: true, snapshotAt: boundary.toISOString(),
      watermark: boundary.toISOString(), rowCount: rows.length, changedEntityIds,
      deletedEntityIds: deletedIds.filter((id) => !restoredIds.has(id)), inventory,
    } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
}
