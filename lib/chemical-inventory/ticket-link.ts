import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { positionCodeOf } from "@/lib/position-catalog";
import { INVENTORY_POSITION_CODES } from "./constants";
import { createReceipt } from "./receipts";
import { normalizeVehicleNumber, parseDateOnly, parseQuantity } from "./validation";
import { periodKeyOf } from "./normalize";
import { formatPeriod } from "./readings";

/**
 * Cầu nối giữa PHIẾU VẬT TƯ và SỔ TỒN KHO HÓA CHẤT.
 *
 * Nguyên tắc "một chỗ lưu, hai chỗ nhìn": ngày nhập, biển số và hai số cân của từng
 * chuyến xe CHỈ tồn tại trong `ChemicalReceipt`. Phiếu vật tư giữ mảng
 * `chemicalReceiptIds` trỏ sang, không giữ bản sao — nên sửa ở màn nào cũng thấy ở
 * màn kia, và không có gì để lệch.
 *
 * KHÔNG đụng tồn kho phân xưởng và KHÔNG trừ ERP: hóa chất do nhà thầu giao thẳng,
 * không qua kho DH1 (giữ nguyên quyết định của commit 83aa5b5).
 */

type Tx = Prisma.TransactionClient;

export type TruckInput = {
  receivedAt: string;
  vehicleNumber?: string | null;
  plantWeight?: unknown;
  contractorWeight?: unknown;
  note?: string | null;
};

export type TruckLinkResult = {
  receiptIds: string[];
  created: number;
  linked: number;
  totalAccepted: number;
  messages: string[];
};

/**
 * Tìm mặt hàng trong sổ hóa chất ứng với phiếu.
 *
 * Ưu tiên MÃ VẬT TƯ ERP (lấy từ tab hợp đồng khi import) vì đó là định danh chắc
 * chắn; không có thì mới dò theo tên. Không đoán được thì bắt người dùng chọn tay
 * chứ không gán bừa — gán nhầm là số liệu chạy sang sai hóa chất.
 */
export async function resolveChemicalItem(
  tx: Tx,
  ticket: { items: Array<{ erpCode: string | null; erpName: string | null; material: { code: string; name: string } }> },
  explicitItemId?: string | null
) {
  if (explicitItemId) {
    const picked = await tx.chemicalInventoryItem.findUnique({ where: { id: explicitItemId } });
    if (!picked) throw fail("Mặt hàng hóa chất không tồn tại", 404);
    return picked;
  }

  const items = await tx.chemicalInventoryItem.findMany({ where: { itemType: "CHEMICAL", isActive: true } });
  const codes = ticket.items.flatMap((it) => [it.erpCode, it.material.code].filter(Boolean) as string[]);

  const byCode = items.find((item) => item.materialCode && codes.includes(item.materialCode));
  if (byCode) return byCode;

  const haystack = normalizeText(
    ticket.items.map((it) => `${it.erpName ?? ""} ${it.material.name}`).join(" ")
  );
  // Dò theo mẩu tên đặc trưng: "NH3", "NaOH", "HCl"… Nhãn trong sổ là
  // "Dung dịch NaOH 32%" nên so nguyên tên sẽ trượt.
  const byName = items.find((item) => {
    const key = normalizeText(item.name.replace(/^dung dịch\s*/i, "")).split(/\s+/)[0];
    return key.length >= 2 && haystack.includes(key);
  });
  if (byName) return byName;

  throw fail(
    "Không xác định được hóa chất tương ứng trong sổ tồn kho — hãy chọn tay mặt hàng trước khi ghi chuyến xe",
    409
  );
}

/**
 * Ghi danh sách chuyến xe của một phiếu vào sổ hóa chất.
 *
 * Mỗi dòng đi qua `createReceipt` nên được hưởng nguyên cơ chế chống trùng hai cửa:
 * chuyến nào đã được nhật ký ngày ghi trước thì GẮN vào bản ghi đó thay vì tạo dòng
 * thứ hai. Toàn bộ chạy trong transaction của lời gọi bên ngoài.
 */
export async function linkTicketTrucks(
  tx: Tx,
  ticket: {
    id: string;
    assignedPosition: string | null;
    chemicalReceiptIds: string[];
    items: Array<{ erpCode: string | null; erpName: string | null; material: { code: string; name: string } }>;
  },
  trucks: TruckInput[],
  options: { userId: string; chemicalItemId?: string | null }
): Promise<TruckLinkResult> {
  if (!Array.isArray(trucks) || trucks.length === 0) {
    throw fail("Chưa nhập chuyến xe nào", 400);
  }
  if (trucks.length > 50) throw fail("Một phiếu không ghi quá 50 chuyến xe", 400);

  const item = await resolveChemicalItem(tx, ticket, options.chemicalItemId);

  /**
   * Cương vị nhận của các chuyến xe.
   *
   * `ticket.assignedPosition` là NHÃN tự do ("Trưởng kíp Lò - Máy"), còn
   * `ChemicalReceipt.receivingPosition` phải là MÃ cương vị — ghi thẳng nhãn vào thì
   * ô chọn trên giao diện không khớp được và hiện "Chưa xác định".
   *
   * Ngoài ra sổ tồn kho chỉ theo dõi BẢY cương vị (cột E..K của bảng tháng). Phiếu
   * giao cho cương vị ngoài bảy cái đó — ví dụ Trưởng kíp — thì hàng vẫn về đúng trạm
   * của hóa chất, nên lùi về cương vị mặc định của mặt hàng.
   */
  const assignedCode = positionCodeOf(ticket.assignedPosition);
  const receivingPosition =
    assignedCode && (INVENTORY_POSITION_CODES as readonly string[]).includes(assignedCode)
      ? assignedCode
      : item.defaultPosition;

  // Gỡ các chuyến cũ của phiếu trước khi ghi lại, để sửa phiếu không đẻ thêm dòng.
  // Chỉ gỡ dòng do CHÍNH phiếu này tạo; dòng vốn có từ nhật ký ngày thì chỉ tháo
  // liên kết, tuyệt đối không xóa số liệu người khác đã ghi tận nơi.
  if (ticket.chemicalReceiptIds.length > 0) {
    const previous = await tx.chemicalReceipt.findMany({ where: { id: { in: ticket.chemicalReceiptIds } } });
    for (const row of previous) {
      if (row.source === "MATERIAL_TICKET") await tx.chemicalReceipt.delete({ where: { id: row.id } });
      else await tx.chemicalReceipt.update({ where: { id: row.id }, data: { materialTicketId: null } });
    }
  }

  const receiptIds: string[] = [];
  const messages: string[] = [];
  let created = 0;
  let linked = 0;
  let totalAccepted = 0;
  const seen = new Set<string>();

  for (const [index, truck] of trucks.entries()) {
    const label = `Chuyến xe ${index + 1}`;

    const receivedAt = parseDateOnly(truck.receivedAt, `${label}: ngày nhập`);
    if (!receivedAt.ok) throw fail(receivedAt.error, 400);

    const plant = parseQuantity(truck.plantWeight, `${label}: khối lượng cân nhà máy`, { allowNull: true });
    if (!plant.ok) throw fail(plant.error, 400);

    const contractor = parseQuantity(truck.contractorWeight, `${label}: khối lượng cân nhà thầu`, { allowNull: true });
    if (!contractor.ok) throw fail(contractor.error, 400);

    // Ở bước lãnh, VHV chỉ cầm MỘT tờ phiếu cân xe của nhà máy — lấy đúng dòng
    // "Trọng lượng hàng" (đã trừ bì). Không có số cân thứ hai để đối chứng, nên cố
    // ý KHÔNG đòi ghi chú như màn nhật ký/phiếu nhập (nơi sổ Excel có đủ hai số).
    if (plant.value === null) {
      throw fail(`${label}: chưa nhập khối lượng hàng theo phiếu cân`, 400);
    }
    if (plant.value <= 0) {
      throw fail(`${label}: khối lượng hàng phải lớn hơn 0`, 400);
    }

    const note = String(truck.note ?? "").trim() || null;

    const vehicleNumber = normalizeVehicleNumber(truck.vehicleNumber);

    // Trùng ngay trong chính bảng vừa nhập: chặn ở đây cho thông báo dễ hiểu, thay vì
    // để khóa duy nhất của DB ném ra lỗi ràng buộc khó đọc.
    const key = `${receivedAt.value.toISOString()}|${vehicleNumber ?? `dong${index}`}`;
    if (seen.has(key)) {
      throw fail(`${label}: trùng ngày và biển số với một dòng phía trên`, 400);
    }
    seen.add(key);

    const result = await createReceipt(
      tx,
      {
        itemId: item.id,
        receivedAt: receivedAt.value,
        vehicleNumber,
        plantWeight: plant.value,
        contractorWeight: contractor.value,
        receivingPosition,
        note,
      },
      { source: "MATERIAL_TICKET", userId: options.userId, materialTicketId: ticket.id }
    );

    receiptIds.push(result.id);
    if (result.status === "linked") {
      linked += 1;
      messages.push(`${label}: ${result.message}`);
    } else {
      created += 1;
    }

    const stored = await tx.chemicalReceipt.findUniqueOrThrow({
      where: { id: result.id },
      select: { acceptedWeight: true },
    });
    totalAccepted += stored.acceptedWeight.toNumber();
  }

  await tx.materialTicket.update({ where: { id: ticket.id }, data: { chemicalReceiptIds: receiptIds } });

  return { receiptIds, created, linked, totalAccepted: Math.round(totalAccepted * 10_000) / 10_000, messages };
}

/** Gỡ toàn bộ liên kết khi phiếu bị hủy hoặc xóa. */
export async function unlinkTicketTrucks(tx: Tx, ticketId: string, receiptIds: string[]) {
  if (receiptIds.length === 0) return 0;
  const rows = await tx.chemicalReceipt.findMany({ where: { id: { in: receiptIds } } });
  let removed = 0;
  for (const row of rows) {
    // Dòng do phiếu tạo thì xóa hẳn; dòng vốn có từ nhật ký ngày thì chỉ tháo liên kết.
    if (row.source === "MATERIAL_TICKET") {
      await tx.chemicalReceipt.delete({ where: { id: row.id } });
      removed += 1;
    } else {
      await tx.chemicalReceipt.update({ where: { id: row.id }, data: { materialTicketId: null } });
    }
  }
  await tx.materialTicket.update({ where: { id: ticketId }, data: { chemicalReceiptIds: [] } }).catch(() => null);
  return removed;
}

/** Kỳ của một ngày, dùng để báo lỗi rõ khi kỳ đã khóa sổ. */
export function periodLabelOfDate(date: Date) {
  return formatPeriod(periodKeyOf(date));
}
