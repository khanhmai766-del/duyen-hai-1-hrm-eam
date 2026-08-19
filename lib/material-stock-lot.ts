/**
 * TỒN KHO THEO LÔ (số phiếu giao hàng).
 *
 * "Hiện có" của một vật tư = TỔNG các lô còn lại. Mỗi lần lãnh về là một lô mang số phiếu
 * giao hàng; mỗi lần sử dụng trừ LÔ CŨ TRƯỚC (FIFO) và ghi lại đã lấy bao nhiêu từ lô nào,
 * để biên bản nghiệm thu dẫn đúng số phiếu của phần vật tư thực dùng.
 *
 * BA ĐIỀU RÀNG BUỘC CÁCH VIẾT Ở ĐÂY, đừng sửa nếu chưa đọc:
 *
 *  1. KHOÁ LÀ `Material.code`, KHÔNG phải materialId. Một mã vật tư có tới ba dòng Material
 *     (S1/S2/COMMON) nhưng dùng CHUNG một kho — các câu lệnh cộng/trừ tồn sẵn có cũng ghi
 *     đồng loạt theo mã. Khoá theo id sẽ chẻ một kho có thật thành ba.
 *
 *  2. `Material.quantity` VẪN LÀ NGUỒN ĐỌC của mọi màn hình. Sau mỗi lần đụng lô phải gọi
 *     `syncMaterialQuantity` để cột đó bằng đúng tổng các lô, nếu không hai con số sẽ trôi
 *     khỏi nhau mà không ai thấy.
 *
 *  3. Mọi hàm ghi đều nhận `tx` và phải chạy TRONG giao dịch cùng với việc cập nhật phiếu:
 *     trừ lô xong mà cập nhật phiếu hỏng là kho mất hàng không dấu vết.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type StockLot = {
  id: string;
  deliveryNote: string | null;
  erpCode: string | null;
  receivedAt: Date | null;
  quantityIn: number;
  quantityLeft: number;
  ticketId: string | null;
};

/** Một lần sử dụng lấy bao nhiêu từ lô nào. */
export type LotAllocation = { lotId: string; quantity: number };

/** Nhãn hiển thị của lô — lô chưa rõ phiếu là tồn có sẵn từ trước khi bật theo dõi lô. */
export const OPENING_LOT_LABEL = "Tồn đầu kỳ";

export function lotLabel(lot: { deliveryNote: string | null }) {
  return lot.deliveryNote?.trim() || OPENING_LOT_LABEL;
}

/**
 * Các mã ERP cùng chia một kho với vật tư này — giữ đúng điều kiện của những câu lệnh
 * cộng/trừ tồn đã có từ trước để hai bên không lệch phạm vi.
 */
export function sharedCodesOf(material: { code: string; erpCodes?: string[] | null }) {
  return material.erpCodes?.length ? material.erpCodes : [material.code];
}

/**
 * Thứ tự FIFO: tồn đầu kỳ (chưa rõ ngày) trước, rồi tới ngày lãnh cũ nhất.
 * Sắp ở JS chứ không ở DB vì mỗi vật tư chỉ có vài lô, mà thứ tự "null đứng đầu" viết bằng
 * Prisma orderBy dễ sai âm thầm hơn là đọc ra rồi sắp.
 */
function fifoSort<T extends { id: string; receivedAt: Date | null }>(lots: T[]): T[] {
  return [...lots].sort((a, b) => {
    if (!a.receivedAt && !b.receivedAt) return a.id.localeCompare(b.id);
    if (!a.receivedAt) return -1;
    if (!b.receivedAt) return 1;
    return a.receivedAt.getTime() - b.receivedAt.getTime();
  });
}

const LOT_SELECT = {
  id: true,
  deliveryNote: true,
  erpCode: true,
  receivedAt: true,
  quantityIn: true,
  quantityLeft: true,
  ticketId: true,
} as const;

/** Các lô CÒN HÀNG của một mã vật tư, theo thứ tự sẽ bị trừ. */
export async function availableLots(db: Db, materialCode: string): Promise<StockLot[]> {
  const lots = await db.materialStockLot.findMany({
    where: { materialCode, quantityLeft: { gt: 0 } },
    select: LOT_SELECT,
  });
  return fifoSort(lots);
}

/** Toàn bộ lô của nhiều mã (kể cả đã hết) — dùng cho bảng theo dõi. */
export async function lotsByCodes(db: Db, materialCodes: string[]): Promise<Map<string, StockLot[]>> {
  if (!materialCodes.length) return new Map();
  const lots = await db.materialStockLot.findMany({
    where: { materialCode: { in: materialCodes } },
    select: { ...LOT_SELECT, materialCode: true },
  });
  const out = new Map<string, StockLot[]>();
  for (const lot of lots) {
    const list = out.get(lot.materialCode) ?? [];
    list.push(lot);
    out.set(lot.materialCode, list);
  }
  for (const [code, list] of out) out.set(code, fifoSort(list));
  return out;
}

/**
 * Đặt LẠI tổng "Hiện có" của mọi dòng Material dùng chung kho = tổng các lô còn lại.
 * Trả về con số vừa ghi để nơi gọi ghi nhật ký.
 */
export async function syncMaterialQuantity(tx: Prisma.TransactionClient, materialCode: string, sharedCodes: string[]) {
  const sum = await tx.materialStockLot.aggregate({
    where: { materialCode },
    _sum: { quantityLeft: true },
  });
  const total = Math.max(0, sum._sum.quantityLeft ?? 0);
  await tx.$executeRaw`
    UPDATE "Material"
    SET "quantity" = ${total}
    WHERE "code" = ANY(${sharedCodes}::text[]) OR "erpCodes" && ${sharedCodes}::text[]
  `;
  return total;
}

/**
 * Ghi nhận vật tư lãnh về. MỘT PHIẾU MỘT LÔ: gọi lại cho cùng phiếu thì cộng dồn vào lô cũ
 * chứ không đẻ lô mới — luồng Ứng lãnh trước một phần rồi mới xác nhận phần còn lại, và
 * người dùng còn sửa số lãnh ở bước "Xem lại".
 *
 * `quantity` âm = trả bớt (khi sửa số lãnh xuống); không cho lô âm.
 */
export async function receiveIntoLot(
  tx: Prisma.TransactionClient,
  params: {
    materialCode: string;
    quantity: number;
    ticketId: string;
    deliveryNote?: string | null;
    erpCode?: string | null;
    receivedAt?: Date | null;
  }
) {
  const { materialCode, ticketId, quantity } = params;
  const deliveryNote = params.deliveryNote?.trim() || null;
  const existing = await tx.materialStockLot.findFirst({
    where: { materialCode, ticketId },
    select: { id: true, quantityIn: true, quantityLeft: true },
  });

  if (!existing) {
    if (quantity <= 0) return null;
    return tx.materialStockLot.create({
      data: {
        materialCode,
        ticketId,
        deliveryNote,
        erpCode: params.erpCode?.trim() || null,
        receivedAt: params.receivedAt ?? new Date(),
        quantityIn: quantity,
        quantityLeft: quantity,
      },
      select: LOT_SELECT,
    });
  }

  // Sửa số lãnh xuống thấp hơn phần ĐÃ DÙNG của chính lô này là không hợp lệ: phần đã dùng
  // đã nằm trên biên bản rồi, không rút lại được bằng một lần sửa số.
  const nextLeft = existing.quantityLeft + quantity;
  if (nextLeft < 0) {
    throw new Error("Không thể giảm số lãnh xuống dưới phần đã sử dụng của phiếu giao hàng này");
  }
  return tx.materialStockLot.update({
    where: { id: existing.id },
    data: {
      quantityIn: Math.max(0, existing.quantityIn + quantity),
      quantityLeft: nextLeft,
      ...(deliveryNote !== null ? { deliveryNote } : {}),
      ...(params.erpCode?.trim() ? { erpCode: params.erpCode.trim() } : {}),
      ...(params.receivedAt ? { receivedAt: params.receivedAt } : {}),
    },
    select: LOT_SELECT,
  });
}

/** Trả lại toàn bộ phần một phiếu đã trừ (dùng khi sửa số dùng hoặc phân bổ lại). */
export async function releaseUsage(tx: Prisma.TransactionClient, ticketId: string) {
  const usages = await tx.materialLotUsage.findMany({ where: { ticketId }, select: { lotId: true, quantity: true } });
  for (const usage of usages) {
    await tx.materialStockLot.update({
      where: { id: usage.lotId },
      data: { quantityLeft: { increment: usage.quantity } },
    });
  }
  if (usages.length) await tx.materialLotUsage.deleteMany({ where: { ticketId } });
  return usages.length;
}

/** Chia `quantity` vào danh sách lô theo thứ tự đưa vào; thiếu hàng thì trả về phần thiếu. */
export function planAllocation(lots: StockLot[], quantity: number): { allocation: LotAllocation[]; shortfall: number } {
  let left = Math.max(0, Math.trunc(quantity));
  const allocation: LotAllocation[] = [];
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(lot.quantityLeft, left);
    if (take > 0) {
      allocation.push({ lotId: lot.id, quantity: take });
      left -= take;
    }
  }
  return { allocation, shortfall: left };
}

/**
 * Trừ kho cho một phiếu. Gọi lại nhiều lần cho cùng phiếu là AN TOÀN: phần đã trừ trước đó
 * được trả về lô rồi chia lại từ đầu, nên sửa số dùng hay đổi phân bổ đều không cộng dồn sai.
 *
 * `allocation` do người dùng chọn ở bước nghiệm thu; bỏ trống thì tự chia FIFO.
 */
export async function consumeStock(
  tx: Prisma.TransactionClient,
  params: { materialCode: string; ticketId: string; quantity: number; allocation?: LotAllocation[] }
): Promise<LotAllocation[]> {
  const { materialCode, ticketId, quantity } = params;
  await releaseUsage(tx, ticketId);
  if (quantity <= 0) return [];

  const lots = await availableLots(tx, materialCode);
  let plan: LotAllocation[];

  if (params.allocation?.length) {
    const byId = new Map(lots.map((lot) => [lot.id, lot]));
    let total = 0;
    for (const item of params.allocation) {
      const lot = byId.get(item.lotId);
      if (!lot) throw new Error("Lô vật tư không còn tồn tại hoặc đã hết hàng");
      if (item.quantity <= 0) continue;
      if (item.quantity > lot.quantityLeft) {
        throw new Error(`Phiếu giao hàng ${lotLabel(lot)} chỉ còn ${lot.quantityLeft}, không đủ ${item.quantity}`);
      }
      total += item.quantity;
    }
    if (total !== quantity) throw new Error(`Tổng phân bổ theo phiếu giao hàng (${total}) phải bằng số lượng sử dụng (${quantity})`);
    plan = params.allocation.filter((item) => item.quantity > 0);
  } else {
    const { allocation, shortfall } = planAllocation(lots, quantity);
    if (shortfall > 0) {
      // Nói RÕ mã vật tư và tồn thật theo lô: sự cố hay gặp là màn hình báo còn hàng
      // (đọc `Material.quantity`) trong khi kho lô đã rỗng, mà thông báo cũ chỉ có mỗi
      // con số thiếu nên không ai đoán được lệch ở đâu.
      const con = lots.reduce((sum, lot) => sum + lot.quantityLeft, 0);
      throw new Error(
        `Số lượng hiện có không đủ, còn thiếu ${shortfall}` +
          ` (mã ${materialCode}: cần ${quantity}, tồn theo lô ${con}).` +
          ` Nếu màn hình vẫn báo còn hàng thì số tồn chưa được gắn với lô nào —` +
          ` chạy scripts/backfill-opening-stock-lots.mjs để dựng lô tồn đầu kỳ.`
      );
    }
    plan = allocation;
  }

  for (const item of plan) {
    await tx.materialStockLot.update({
      where: { id: item.lotId },
      data: { quantityLeft: { decrement: item.quantity } },
    });
    await tx.materialLotUsage.create({ data: { lotId: item.lotId, ticketId, quantity: item.quantity } });
  }
  return plan;
}

/** Các lô một phiếu đã dùng — để in số phiếu giao hàng lên biên bản. */
export async function usedLotsOfTicket(db: Db, ticketId: string) {
  const usages = await db.materialLotUsage.findMany({
    where: { ticketId },
    select: { quantity: true, lot: { select: LOT_SELECT } },
  });
  return fifoSort(usages.map((u) => u.lot)).map((lot) => ({
    ...lot,
    used: usages.find((u) => u.lot.id === lot.id)?.quantity ?? 0,
  }));
}

/** Chuỗi in lên biên bản: "YY2.1 (5 Lít), YY2.2 (2 Lít)". */
export function deliveryNoteSummary(used: Array<{ deliveryNote: string | null; used: number }>, unit?: string | null) {
  if (!used.length) return "";
  return used
    .map((item) => `${item.deliveryNote?.trim() || OPENING_LOT_LABEL} (${item.used}${unit ? ` ${unit}` : ""})`)
    .join(", ");
}

/**
 * HOÀN KHO KHI XOÁ PHIẾU — gỡ sạch dấu vết của một phiếu khỏi sổ lô.
 *
 * Hai việc, đúng thứ tự:
 *  1. Trả lại phần chính phiếu đó đã dùng.
 *  2. Gỡ lô mà phiếu đó mang vào.
 *
 * Vướng ở bước 2: lô đó có thể ĐÃ BỊ PHIẾU KHÁC DÙNG MẤT một phần. Không thể gỡ phần đã đi
 * mất, nên phải CHUYỂN các lần dùng của phiếu khác sang lô còn hàng (theo FIFO) rồi mới gỡ
 * lô. Không đủ lô khác để chuyển thì gỡ tới đâu hay tới đó — thà tồn nhỉnh hơn thực tế còn
 * hơn chặn không cho xoá phiếu hoặc đẩy kho xuống âm.
 */
export async function reverseTicketStock(
  tx: Prisma.TransactionClient,
  params: { materialCode: string; ticketId: string }
) {
  const { materialCode, ticketId } = params;
  await releaseUsage(tx, ticketId);

  const lot = await tx.materialStockLot.findFirst({
    where: { materialCode, ticketId },
    select: { id: true, quantityIn: true, quantityLeft: true },
  });
  if (!lot) return { removed: 0, moved: 0 };

  let moved = 0;
  const others = await tx.materialLotUsage.findMany({ where: { lotId: lot.id }, select: { id: true, ticketId: true, quantity: true } });
  for (const usage of others) {
    const targets = (await availableLots(tx, materialCode)).filter((item) => item.id !== lot.id);
    const { allocation, shortfall } = planAllocation(targets, usage.quantity);
    if (shortfall > 0) continue; // không đủ chỗ chuyển — giữ nguyên lần dùng này
    await tx.materialLotUsage.delete({ where: { id: usage.id } });
    for (const item of allocation) {
      await tx.materialStockLot.update({ where: { id: item.lotId }, data: { quantityLeft: { decrement: item.quantity } } });
      await tx.materialLotUsage.create({ data: { lotId: item.lotId, ticketId: usage.ticketId, quantity: item.quantity } });
    }
    await tx.materialStockLot.update({ where: { id: lot.id }, data: { quantityLeft: { increment: usage.quantity } } });
    moved += usage.quantity;
  }

  const fresh = await tx.materialStockLot.findUnique({ where: { id: lot.id }, select: { quantityLeft: true } });
  const removed = fresh?.quantityLeft ?? 0;
  // Còn lần dùng của phiếu khác bám vào thì không xoá lô (sẽ mất dấu vết của họ), chỉ vét sạch.
  const stillUsed = await tx.materialLotUsage.count({ where: { lotId: lot.id } });
  if (stillUsed > 0) {
    await tx.materialStockLot.update({ where: { id: lot.id }, data: { quantityLeft: 0, note: "Phiếu gốc đã xoá" } });
  } else {
    await tx.materialStockLot.delete({ where: { id: lot.id } });
  }
  return { removed, moved };
}

/**
 * ĐẶT tổng tồn của một mã về đúng `target` bằng cách sinh/bớt lô, dùng cho ô số tồn gõ
 * tay ở Danh mục vật tư.
 *
 * Trước đây form đó ghi thẳng `Material.quantity` mà không đụng tới lô, nên hai bảng lệch
 * nhau vĩnh viễn: màn hình phiếu báo còn hàng còn bước sử dụng thì chết vì kho lô rỗng.
 * Sự cố Dầu Shell Omala S2 GX320 (hiện có 418, lô 0) là đúng vết đó.
 *
 * Tăng thì dồn vào MỘT lô điều chỉnh duy nhất cho mỗi mã, không đẻ lô mới mỗi lần sửa.
 * Giảm thì trừ LÔ ĐIỀU CHỈNH TRƯỚC, hết mới lấn sang các lô thật theo thứ tự ngược FIFO
 * (mới nhất trước). Lô có phiếu giao hàng và lô tồn đầu kỳ là thứ đối chiếu được với
 * chứng từ, còn lô điều chỉnh thì không — nên sửa số lên rồi sửa xuống phải triệt tiêu
 * lẫn nhau chứ không được ăn mất chứng từ.
 *
 * Trả về số lượng đã thay đổi (dương = thêm, âm = bớt, 0 = vốn đã khớp).
 */
export const ADJUSTMENT_NOTE = 'Điều chỉnh tồn thủ công';

export async function adjustStockToQuantity(
  tx: Prisma.TransactionClient,
  materialCode: string,
  target: number
): Promise<number> {
  const muc = Math.max(0, Math.trunc(target));
  const lots = await tx.materialStockLot.findMany({
    where: { materialCode },
    select: { id: true, quantityIn: true, quantityLeft: true, receivedAt: true, note: true },
  });
  const dangCo = lots.reduce((sum, lot) => sum + lot.quantityLeft, 0);
  const delta = muc - dangCo;
  if (delta === 0) return 0;

  if (delta > 0) {
    const loDieuChinh = lots.find((lot) => lot.note === ADJUSTMENT_NOTE);
    if (loDieuChinh) {
      await tx.materialStockLot.update({
        where: { id: loDieuChinh.id },
        data: { quantityIn: { increment: delta }, quantityLeft: { increment: delta } },
      });
    } else {
      await tx.materialStockLot.create({
        data: {
          materialCode,
          // receivedAt null = xếp ĐẦU hàng đợi FIFO, dùng hết trước các lô có phiếu.
          receivedAt: null,
          quantityIn: delta,
          quantityLeft: delta,
          note: ADJUSTMENT_NOTE,
        },
      });
    }
    return delta;
  }

  let canTru = -delta;
  // Lô điều chỉnh đứng đầu hàng bị trừ; phần còn lại đảo danh sách đã sắp FIFO thay vì
  // tự viết lại phép so sánh.
  const thuTuTru = [
    ...lots.filter((lot) => lot.note === ADJUSTMENT_NOTE),
    ...[...fifoSort(lots.filter((lot) => lot.note !== ADJUSTMENT_NOTE))].reverse(),
  ];
  for (const lot of thuTuTru) {
    if (canTru <= 0) break;
    const bot = Math.min(lot.quantityLeft, canTru);
    if (bot <= 0) continue;
    await tx.materialStockLot.update({
      where: { id: lot.id },
      data: { quantityLeft: { decrement: bot } },
    });
    canTru -= bot;
  }
  return delta;
}
