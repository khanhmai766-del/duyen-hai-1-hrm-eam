/**
 * Backfill bảng nối MaterialTicketReplacement cho các phiếu vật tư đã tạo trước Giai đoạn 1.
 *
 * Suy ngược điểm thay thế từ cặp (materialId, deviceSeq): `deviceSeq` lấy từ mảng
 * `MaterialTicketItem.replacementPointKeys` — mảng này chứa chuỗi `deviceSeq`, hoặc
 * `manual:<id>` với điểm nhập tay (dạng manual thì có luôn id, không phải suy).
 *
 * NGUYÊN TẮC: khớp đúng MỘT điểm thì nối, khớp nhiều hoặc không khớp thì BỎ QUA và báo cáo.
 * Tuyệt đối không đoán — nối sai một phiếu vào sai kỳ sẽ làm hỏng cả lịch sử thay thế lẫn số
 * liệu dự toán năm về sau, mà không ai phát hiện ra.
 *
 * Mặc định chạy KHÔ (chỉ in thống kê). Thêm --commit để ghi thật:
 *   cd /var/www/dh1-app && set -a && . ./.env && set +a && npx tsx scripts/backfill-ticket-replacement-links.ts
 *   ... thêm --commit khi đã xem thống kê và thấy hợp lý
 */
import { PrismaClient } from "@prisma/client";
import { plannedQuantityOfPoint } from "../lib/material-ticket-replacement-link";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

type Bucket = { ticketRef: string; key: string; reason: string };

async function main() {
  const items = await prisma.materialTicketItem.findMany({
    where: { replacementPointKeys: { isEmpty: false } },
    select: {
      ticketId: true,
      materialId: true,
      replacementPointKeys: true,
      ticket: { select: { sequenceMonth: true, sequenceNumber: true, sequenceScope: true } },
    },
  });
  console.log(`Dòng vật tư có gắn thiết bị thay thế: ${items.length}`);

  // Các phiếu đã có liên kết (do chạy lại script, hoặc phiếu tạo sau Giai đoạn 1) thì bỏ qua.
  const linked = new Set(
    (await prisma.materialTicketReplacement.findMany({ select: { ticketId: true, replacementId: true } }))
      .map((row) => `${row.ticketId}::${row.replacementId}`)
  );

  const toCreate: Array<{ ticketId: string; replacementId: string; plannedQuantity: number | null }> = [];
  const ambiguous: Bucket[] = [];
  const missing: Bucket[] = [];
  let already = 0;

  for (const item of items) {
    const ref = `${item.ticket.sequenceScope}-${item.ticket.sequenceMonth}-${item.ticket.sequenceNumber}`;
    for (const key of item.replacementPointKeys) {
      // Điểm nhập tay mang sẵn id trong khoá, không phải suy ngược gì.
      if (key.startsWith("manual:")) {
        const id = key.slice("manual:".length);
        const point = await prisma.materialReplacement.findUnique({
          where: { id },
          select: { id: true, quantity: true, deviceCount: true },
        });
        if (!point) { missing.push({ ticketRef: ref, key, reason: "điểm nhập tay đã bị xoá" }); continue; }
        if (linked.has(`${item.ticketId}::${point.id}`)) { already += 1; continue; }
        toCreate.push({ ticketId: item.ticketId, replacementId: point.id, plannedQuantity: plannedQuantityOfPoint(point) });
        continue;
      }

      const points = await prisma.materialReplacement.findMany({
        where: { materialId: item.materialId, deviceSeq: key },
        select: { id: true, quantity: true, deviceCount: true, isActive: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });

      if (points.length === 0) { missing.push({ ticketRef: ref, key, reason: "không còn điểm nào khớp (vật tư × thiết bị)" }); continue; }
      if (points.length > 1) {
        // Điểm bị gỡ rồi khai lại nhiều lần → nhiều bản ghi cùng (vật tư, thiết bị).
        // Không có cách nào biết phiếu cũ thuộc kỳ nào, nên bỏ qua.
        ambiguous.push({ ticketRef: ref, key, reason: `${points.length} điểm cùng khớp` });
        continue;
      }
      const point = points[0];
      if (linked.has(`${item.ticketId}::${point.id}`)) { already += 1; continue; }
      toCreate.push({ ticketId: item.ticketId, replacementId: point.id, plannedQuantity: plannedQuantityOfPoint(point) });
    }
  }

  console.log(`\n  nối được          : ${toCreate.length}`);
  console.log(`  đã có liên kết    : ${already}`);
  console.log(`  bỏ qua — mập mờ   : ${ambiguous.length}`);
  console.log(`  bỏ qua — không thấy: ${missing.length}`);

  const show = (title: string, rows: Bucket[]) => {
    if (rows.length === 0) return;
    console.log(`\n${title} (${rows.length}, in tối đa 20):`);
    for (const row of rows.slice(0, 20)) console.log(`  ${row.ticketRef} · ${row.key} — ${row.reason}`);
  };
  show("MẬP MỜ — cần xử lý tay", ambiguous);
  show("KHÔNG TÌM THẤY ĐIỂM", missing);

  if (!COMMIT) {
    console.log("\n(chạy khô — thêm --commit để ghi thật)");
    return;
  }
  const result = await prisma.materialTicketReplacement.createMany({ data: toCreate, skipDuplicates: true });
  console.log(`\nĐã ghi ${result.count} liên kết.`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
