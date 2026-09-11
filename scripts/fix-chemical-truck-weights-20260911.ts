/**
 * Sửa hai chuyến xe hóa chất bị ghi sai do lỗi đọc số "10.860" thành 10,86 (xem lib/vn-number.ts).
 *
 *   cd /var/www/dh1-app && set -a && . ./.env && set +a && npx tsx scripts/fix-chemical-truck-weights-20260911.ts [--commit]
 *
 * Đi qua ĐÚNG hàm `updateReceipt` của sổ Tồn kho hóa chất chứ không UPDATE thẳng bảng: hàm đó
 * tự tính lại cờ cảnh báo của chuyến xe (cả hai đang mang TRUCK_WEIGHT_OUTLIER) và đồng bộ lại
 * "Vật tư lãnh" trên phiếu vật tư. Mọi trường khác giữ nguyên như đang lưu.
 *
 * Số đúng do người dùng xác nhận theo phiếu cân ngày 11/09/2026.
 */
import { PrismaClient } from "@prisma/client";
import { updateReceipt } from "../lib/chemical-inventory/receipts";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

const FIXES = [
  { id: "cmtwh5g0v00m4ssd9l2rt3556", label: "HC-4 tháng 09 · xe 50E41360", from: 10.86, to: 10860 },
  { id: "cmt9ogb6d006akax7zfgvvbf4", label: "HC-6 tháng 08 · xe 60H20332", from: 16.18, to: 16180 },
];

async function main() {
  const system = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (!system) throw new Error("Không tìm thấy tài khoản quản trị để ghi người sửa");

  for (const fix of FIXES) {
    const r = await prisma.chemicalReceipt.findUnique({ where: { id: fix.id } });
    if (!r) {
      console.log(`${fix.label}: KHÔNG TÌM THẤY — bỏ qua`);
      continue;
    }
    const current = Number(r.plantWeight ?? r.acceptedWeight);
    console.log(`${fix.label}: đang ${current} kg → ${fix.to} kg`);
    if (current !== fix.from) {
      console.log(`  bỏ qua — số đang lưu không còn là ${fix.from}, có thể đã được sửa tay`);
      continue;
    }
    if (!COMMIT) continue;
    await prisma.$transaction((tx) =>
      updateReceipt(
        tx,
        fix.id,
        {
          itemId: r.itemId,
          receivedAt: r.receivedAt,
          vehicleNumber: r.vehicleNumber,
          plantWeight: fix.to,
          contractorWeight: r.contractorWeight ? Number(r.contractorWeight) : null,
          note: r.note,
          receivingPosition: r.receivingPosition,
        },
        system.id
      )
    );
    console.log("  ✔ đã sửa");
  }
  if (!COMMIT) console.log("Chạy khô — chưa ghi gì. Thêm --commit để sửa thật.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
