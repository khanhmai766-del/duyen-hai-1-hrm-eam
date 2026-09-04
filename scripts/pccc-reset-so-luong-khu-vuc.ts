/**
 * Đặt lại cột "SL khu vực" của đèn sự cố (EXIT + chiếu sáng sự cố) về 1.
 *
 *   npx tsx scripts/pccc-reset-so-luong-khu-vuc.ts --ky T09.2026            # chạy khô
 *   npx tsx scripts/pccc-reset-so-luong-khu-vuc.ts --ky T09.2026 --commit   # ghi thật
 *   npx tsx scripts/pccc-reset-so-luong-khu-vuc.ts --ky T09.2026 --ky T08.2026 --commit
 *
 * `soLuongKhuVuc` là số đèn trong một khu vực layout — thuộc tính của VỊ TRÍ, không phải
 * kết quả kiểm tra. Nhập sai thì cột SL của cả trang lệch, và biểu xuất Excel lệch theo.
 *
 * PHẢI nêu kỳ tường minh bằng --ky, không có chế độ "làm hết mọi kỳ": kỳ ĐÃ CHỐT là hồ sơ
 * bất biến của tháng đó, sửa vào phải là quyết định có ý thức chứ không phải hệ quả phụ
 * của một lệnh quét toàn bảng. Script vẫn cho sửa kỳ đã chốt nếu người chạy chỉ đích danh,
 * nhưng in cảnh báo rõ ràng.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const COMMIT = argv.includes("--commit");
const KY = argv.reduce<string[]>((acc, item, index) => {
  if (item === "--ky" && argv[index + 1] && !argv[index + 1].startsWith("--")) acc.push(argv[index + 1]);
  return acc;
}, []);

const GIA_TRI_MOI = 1;

async function main() {
  if (KY.length === 0) {
    console.error("Thiếu --ky. Ví dụ:");
    console.error("  npx tsx scripts/pccc-reset-so-luong-khu-vuc.ts --ky T09.2026 [--commit]");
    const co = await prisma.pcccPeriod.findMany({
      select: { label: true, closedAt: true },
      orderBy: { label: "asc" },
    });
    console.error(`\nCác kỳ hiện có: ${co.map((p) => `${p.label}${p.closedAt ? " (đã chốt)" : ""}`).join(" · ")}`);
    process.exit(1);
  }

  const periods = await prisma.pcccPeriod.findMany({
    where: { label: { in: KY } },
    select: { id: true, label: true, closedAt: true },
    orderBy: { label: "asc" },
  });

  const thieu = KY.filter((label) => !periods.some((p) => p.label === label));
  if (thieu.length) {
    console.error(`Không tìm thấy kỳ: ${thieu.join(", ")}`);
    process.exit(1);
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`ĐẶT LẠI "SL khu vực" = ${GIA_TRI_MOI} · ${COMMIT ? "GHI THẬT (--commit)" : "CHẠY KHÔ"}`);
  console.log("=".repeat(72));

  let tong = 0;
  for (const period of periods) {
    const canSua = await prisma.pcccEmergencyLight.findMany({
      where: { periodId: period.id, NOT: { soLuongKhuVuc: GIA_TRI_MOI } },
      select: { loai: true, soLuongKhuVuc: true },
    });
    const theoLoai = new Map<string, number>();
    for (const row of canSua) theoLoai.set(row.loai, (theoLoai.get(row.loai) ?? 0) + 1);

    const nhanChot = period.closedAt ? "  ⚠ KỲ ĐÃ CHỐT — đang sửa vào hồ sơ bất biến" : "";
    console.log(`\n### ${period.label}${nhanChot}`);
    if (canSua.length === 0) {
      console.log("  Mọi dòng đã bằng 1, không có gì để sửa.");
      continue;
    }
    for (const [loai, n] of [...theoLoai].sort()) {
      console.log(`  ${loai === "EXIT" ? "Đèn EXIT          " : "Đèn chiếu sáng sự cố"} : ${String(n).padStart(4)} dòng`);
    }
    // Giá trị đang có, để người đọc thấy mình sắp xoá mất thông tin gì.
    const phanBo = new Map<string, number>();
    for (const row of canSua) {
      const key = row.soLuongKhuVuc === null ? "(trống)" : String(row.soLuongKhuVuc);
      phanBo.set(key, (phanBo.get(key) ?? 0) + 1);
    }
    console.log(`  Giá trị hiện tại sẽ bị ghi đè: ${[...phanBo].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v}×${n}`).join(", ")}`);

    if (COMMIT) {
      const res = await prisma.pcccEmergencyLight.updateMany({
        where: { periodId: period.id, NOT: { soLuongKhuVuc: GIA_TRI_MOI } },
        data: { soLuongKhuVuc: GIA_TRI_MOI },
      });
      console.log(`  → đã cập nhật ${res.count} dòng`);
    }
    tong += canSua.length;
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`${COMMIT ? "ĐÃ SỬA" : "SẼ SỬA"} ${tong} dòng.`);
  if (!COMMIT && tong > 0) console.log("Chạy khô — chưa ghi gì. Thêm --commit để ghi thật.");
  console.log("=".repeat(72) + "\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
