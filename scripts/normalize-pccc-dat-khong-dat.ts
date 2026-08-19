/**
 * Quy đổi TÌNH TRẠNG của bình chữa cháy, tủ chữa cháy và nút nhấn báo cháy từ ba mức
 * cũ sang hai mức Đạt / Không đạt.
 *
 *   npx tsx scripts/normalize-pccc-dat-khong-dat.ts            # DRY-RUN
 *   npx tsx scripts/normalize-pccc-dat-khong-dat.ts --apply    # ghi thật
 *
 * Căn cứ: TB 5100/TB-NĐDH ngày 14/8/2026, mục "BẢNG II … Đánh giá tình trạng hoạt
 * động" — kết quả kiểm tra chỉ ghi Đạt / Không đạt, không còn mức trung gian.
 *
 * Ánh xạ đã chốt:  Khả dụng → Đạt · Cần theo dõi → Đạt (vẫn dùng được) ·
 *                  Bất khả dụng → Không đạt.
 *
 * CÓ đụng kỳ ĐÃ CHỐT (nghiệp vụ chốt 2026-08-19): đây là đổi CÁCH GHI theo văn bản mới
 * chứ không phải sửa kết quả kiểm tra, nên không phá tính bất biến của kỳ. Không quy đổi
 * thì mở kỳ cũ ra sẽ thấy nhãn xám "không nhận ra" vì bảng màu không còn biết ba mức đó.
 *
 * Idempotent: chạy lại lần hai không đổi gì thêm. Giá trị lạ ngoài ba mức cũ được GIỮ
 * NGUYÊN và liệt kê ở cuối, không suy đoán ép về một trong hai mức.
 */
import { PrismaClient } from "@prisma/client";
import { TINH_TRANG_DAT, TINH_TRANG_KHONG_DAT } from "../lib/pccc-status";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const MAP: Record<string, string> = {
  "Khả dụng": TINH_TRANG_DAT,
  "Cần theo dõi": TINH_TRANG_DAT,
  "Bất khả dụng": TINH_TRANG_KHONG_DAT,
};

const changes = new Map<string, number>();
const untouched = new Map<string, number>();

/** Đã ở đúng bộ hai mức rồi thì không phải "giá trị lạ" — chạy lại lần hai gặp toàn thứ này. */
const DA_QUY_DOI = new Set<string>([TINH_TRANG_DAT, TINH_TRANG_KHONG_DAT]);

function plan(bang: string, current: string | null) {
  if (!current || DA_QUY_DOI.has(current)) return null;
  const next = MAP[current];
  if (!next) {
    untouched.set(`${bang} · ${current}`, (untouched.get(`${bang} · ${current}`) ?? 0) + 1);
    return null;
  }
  if (next === current) return null;
  changes.set(`${bang}: ${current} → ${next}`, (changes.get(`${bang}: ${current} → ${next}`) ?? 0) + 1);
  return next;
}

async function main() {
  console.log(APPLY ? "CHẾ ĐỘ GHI THẬT (--apply)\n" : "DRY-RUN — chưa ghi gì. Thêm --apply để ghi thật.\n");

  // --- Bình chữa cháy (cột `tinhTrang`)
  const bcc = await prisma.pcccExtinguisher.findMany({ select: { id: true, tinhTrang: true } });
  for (const r of bcc) {
    const next = plan("Bình chữa cháy", r.tinhTrang);
    if (next && APPLY) await prisma.pcccExtinguisher.update({ where: { id: r.id }, data: { tinhTrang: next } });
  }

  // --- Tủ chữa cháy + nút nhấn báo cháy (cột `tinhTrangTongThe`, dẫn xuất từ ô tích).
  // Quy đổi NHÃN ở đây là đủ: hàm suy tình trạng đã đổi sang hai mức, nên lần sửa ô tích
  // kế tiếp sẽ tự tính ra đúng một trong hai nhãn này.
  const tcc = await prisma.pcccCabinet.findMany({ select: { id: true, tinhTrangTongThe: true } });
  for (const r of tcc) {
    const next = plan("Tủ chữa cháy", r.tinhTrangTongThe);
    if (next && APPLY) await prisma.pcccCabinet.update({ where: { id: r.id }, data: { tinhTrangTongThe: next } });
  }

  const nnbc = await prisma.pcccAlarmButton.findMany({ select: { id: true, tinhTrangTongThe: true } });
  for (const r of nnbc) {
    const next = plan("Nút nhấn báo cháy", r.tinhTrangTongThe);
    if (next && APPLY) await prisma.pcccAlarmButton.update({ where: { id: r.id }, data: { tinhTrangTongThe: next } });
  }

  const total = [...changes.values()].reduce((a, b) => a + b, 0);
  console.log(`${total} dòng cần quy đổi:\n`);
  for (const [key, n] of [...changes].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${key}`);
  }
  if (untouched.size) {
    console.log("\n⚠ Giá trị ngoài ba mức cũ — GIỮ NGUYÊN, không suy đoán:");
    for (const [key, n] of untouched) console.log(`  ${String(n).padStart(5)}  ${key}`);
  }
  if (!APPLY && total > 0) console.log("\nChưa ghi gì. Chạy lại với --apply để áp dụng.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
