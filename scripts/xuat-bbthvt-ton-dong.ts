/**
 * Xuất BỔ SUNG biên bản thu hồi vật tư (BBTHVT) cho các phiếu đã trượt cờ thu hồi.
 *
 *   npx tsx scripts/xuat-bbthvt-ton-dong.ts 1680/VH1 1682/VH1            # CHẠY KHÔ
 *   npx tsx scripts/xuat-bbthvt-ton-dong.ts 1680/VH1 1682/VH1 --commit   # ghi thật
 *
 * ─── Vì sao cần script ───────────────────────────────────────────────────────
 * Cờ `recoveryOnSupplement` trên điểm thay thế (điểm vẫn phải lập biên bản thu hồi dù
 * chỉ châm bổ sung) CHỈ kích hoạt khi lý do phiếu đúng dạng "Bổ sung". Hai phiếu này ghi
 * lý do bằng chữ tự do ("Châm bổ sung dầu VRL…") nên bị xếp vào "Khác", cờ không nổ,
 * `recoveryRequired` bị chốt false và cả luồng bỏ qua BBTHVT.
 *
 * Lỗ hổng đã được bịt ở đầu vào (dầu mỡ nay chỉ chọn được Bổ sung / Thay thế), nhưng hai
 * phiếu cũ thì phải bù bằng tay.
 *
 * ─── Vì sao KHÔNG chỉ bật cờ ─────────────────────────────────────────────────
 * Bước "xuất BBNT D-Office" có chốt:
 *     if (materialTicketRequiresRecovery(t) && !t.recoveryDocUrl) return fail(…409)
 * Bật cờ mà không sinh văn bản là KHOÁ phiếu lại chứ không phải chữa. Vì vậy script làm
 * trọn gói: bật cờ + sinh văn bản + gắn URL, trong CÙNG một giao dịch.
 *
 * ─── Số lượng thu hồi để TRỐNG ───────────────────────────────────────────────
 * Chốt với người dùng 2026-08-27: `recoveryQuantity` giữ null, mẫu in ô rỗng để người ký
 * ghi tay theo thực tế cân đo. Script CỐ Ý không suy ra con số nào.
 */
import { PrismaClient } from "@prisma/client";
import { generateBbthvtDoc } from "../lib/bbthvt-doc";
import { deliveryPhotoLotsOfTicket, loadDeliveryPhotoBuffer } from "../lib/material-delivery-photo";
import { usedLotsOfTicket } from "../lib/material-stock-lot";
import { materialTicketFileBase } from "../lib/material-ticket-sequence";
import { keyFromPublicUrl } from "../lib/s3";

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const COMMIT = argv.includes("--commit");
const SO_PHIEU = argv.filter((a) => !a.startsWith("--"));

/** Năm theo giờ Việt Nam — cùng quy ước với `assignRecoveryDocNo` trong route. */
function vietnamYear() {
  return Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric" }).format(new Date())
  );
}

const TICKET_SELECT = {
  id: true,
  sequenceMonth: true,
  sequenceNumber: true,
  sequenceScope: true,
  proposalNumber: true,
  status: true,
  materialCategory: true,
  proposalNote: true,
  recoveryRequired: true,
  recoveryQuantity: true,
  recoveryDocUrl: true,
  recoveryDocNo: true,
  deliveryNoteNumber: true,
  pctNumber: true,
  items: {
    select: {
      erpCode: true,
      erpName: true,
      deviceNameManual: true,
      device: { select: { name: true } },
      material: { select: { code: true, name: true, unit: true } },
    },
  },
} as const;

async function main() {
  if (!SO_PHIEU.length) {
    console.error("Thiếu số phiếu. Ví dụ:\n  npx tsx scripts/xuat-bbthvt-ton-dong.ts 1680/VH1 1682/VH1 [--commit]");
    process.exit(1);
  }

  console.log(`\n${"=".repeat(76)}`);
  console.log(`XUẤT BỔ SUNG BBTHVT · ${SO_PHIEU.join(", ")}`);
  console.log(`Chế độ: ${COMMIT ? "GHI THẬT (--commit)" : "CHẠY KHÔ"}`);
  console.log("=".repeat(76));

  for (const so of SO_PHIEU) {
    const t = await prisma.materialTicket.findFirst({ where: { proposalNumber: so }, select: TICKET_SELECT });
    if (!t) {
      console.log(`\n### ${so}: KHÔNG TÌM THẤY — bỏ qua`);
      continue;
    }

    console.log(`\n### ${so} · ${t.sequenceMonth}-${t.sequenceNumber} · ${t.status}`);
    console.log(`    lý do            : ${t.proposalNote}`);
    console.log(`    recoveryRequired : ${t.recoveryRequired} → true`);
    console.log(`    số lượng thu hồi : ${t.recoveryQuantity ?? "(để trống — ghi tay khi ký)"}`);
    console.log(`    số giao hàng     : ${t.deliveryNoteNumber ?? "—"}`);
    console.log(`    số PCT/LCT       : ${t.pctNumber ?? "—"}`);
    console.log(`    vật tư           : ${t.items.map((i) => `${i.erpCode ?? i.material.code} · ${i.erpName ?? i.material.name}`).join(" | ")}`);

    if (t.recoveryDocUrl) {
      console.log(`    ĐÃ CÓ BBTHVT rồi (${t.recoveryDocUrl}) — bỏ qua, không xuất đè`);
      continue;
    }
    if (!COMMIT) {
      console.log("    → sẽ bật cờ thu hồi, cấp số văn bản và xuất BBTHVT");
      continue;
    }

    // Cấp số văn bản — cùng bảng đếm `RecoveryDocSequence` mà luồng chuẩn dùng, nên số
    // không đụng nhau với các biên bản xuất qua giao diện.
    const year = vietnamYear();
    const seq = await prisma.recoveryDocSequence.upsert({
      where: { year },
      create: { year, value: 1 },
      update: { value: { increment: 1 } },
    });

    // Dựng tham số GIỐNG HỆT `buildRecoveryDocument` trong app/api/material-tickets/[id]:
    // sao chép nguyên văn để văn bản bù ra không lệch với văn bản xuất bình thường.
    const unit = t.items[0]?.material.unit ?? "";
    const lots = await deliveryPhotoLotsOfTicket(prisma, t.id, await usedLotsOfTicket(prisma, t.id));
    const deliveryPhotos = (
      await Promise.all(
        lots.map(async (lot) => {
          const buffer = await loadDeliveryPhotoBuffer(lot.deliveryPhotoKey);
          return buffer ? { deliveryNote: lot.deliveryNote, used: lot.used, unit, buffer } : null;
        })
      )
    ).filter((photo): photo is NonNullable<typeof photo> => photo !== null);

    const doc = await generateBbthvtDoc({
      deliveryPhotos,
      existingKey: keyFromPublicUrl(t.recoveryDocUrl),
      fileBaseName: materialTicketFileBase(t),
      soVB: String(seq.value).padStart(2, "0"),
      recoveryQuantity: t.recoveryQuantity, // null → mẫu in ô rỗng
      deliveryNoteNumber: t.deliveryNoteNumber,
      pctNumber: t.pctNumber,
      materialCategory: t.materialCategory,
      items: t.items.map((it) => ({
        deviceName: it.deviceNameManual || it.device?.name || "",
        materialCode: it.erpCode || it.material.code,
        materialName: it.erpName || it.material.name,
        materialUnit: it.material.unit,
      })),
    });

    await prisma.materialTicket.update({
      where: { id: t.id },
      data: {
        recoveryRequired: true,
        recoveryDocNo: seq.value,
        recoveryDocNoYear: year,
        recoveryDocUrl: doc.url,
      },
    });

    console.log(`    ✔ đã xuất BBTHVT số ${String(seq.value).padStart(2, "0")}/${year}`);
    console.log(`      ${doc.url}`);
    console.log(`      ${deliveryPhotos.length} ảnh liên 3 đính kèm`);
  }

  if (!COMMIT) console.log("\nChạy khô — chưa ghi gì. Thêm --commit để xuất thật.\n");
  else console.log("\nXong.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
