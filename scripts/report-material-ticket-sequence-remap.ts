/**
 * BẢNG ĐỐI CHIẾU STT CŨ → MỚI khi tách dãy phiếu vật tư thành hai (VT / HC).
 *
 *   npx tsx scripts/report-material-ticket-sequence-remap.ts            # in ra màn hình
 *   npx tsx scripts/report-material-ticket-sequence-remap.ts --csv      # kèm CSV để lưu
 *
 * CHẠY TRƯỚC prisma/manual/split-material-ticket-sequence.sql. Script chỉ ĐỌC, không ghi.
 *
 * Vì sao cần: đánh lại số làm đổi STT của phiếu cũ, mà STT đã nằm trong tên tệp biên bản
 * đã xuất (`phieu-vat-tu-YYYY-MM-stt-N`) và trong chuỗi ghi ở AuditLog. Không có bảng này
 * thì sau khi chạy không còn cách nào lần ngược "STT 7 tháng 8" trong giấy tờ cũ là phiếu
 * nào nữa.
 */
import { PrismaClient } from "@prisma/client";
import { sequenceScopeOfType, SCOPE_PREFIX } from "../lib/material-ticket-sequence";

const prisma = new PrismaClient();
const CSV = process.argv.includes("--csv");

async function main() {
  const tickets = await prisma.materialTicket.findMany({
    orderBy: [{ sequenceMonth: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      sequenceMonth: true,
      sequenceNumber: true,
      type: true,
      materialCategory: true,
      status: true,
      createdAt: true,
      createdByName: true,
      docUrl: true,
      proposalDocUrl: true,
      bbktDocUrl: true,
    },
  });

  // Đánh lại số y hệt câu SQL: phân hoạch theo (tháng, dãy), xếp theo createdAt rồi id.
  const counter = new Map<string, number>();
  const rows = tickets.map((t) => {
    const scope = sequenceScopeOfType(t.type);
    const key = `${t.sequenceMonth}|${scope}`;
    const next = (counter.get(key) ?? 0) + 1;
    counter.set(key, next);
    return {
      ...t,
      scope,
      cu: `STT ${t.sequenceNumber}`,
      moi: `${SCOPE_PREFIX[scope]}-${next}`,
      doiSo: t.sequenceNumber !== next,
      coTaiLieu: Boolean(t.docUrl || t.proposalDocUrl || t.bbktDocUrl),
    };
  });

  for (const thang of [...new Set(rows.map((r) => r.sequenceMonth))]) {
    const cua = rows.filter((r) => r.sequenceMonth === thang);
    console.log(`\n=== ${thang} — ${cua.length} phiếu ===`);
    console.log("  cũ     → mới     dãy       loại phiếu       tài liệu  trạng thái");
    for (const r of cua) {
      console.log(
        `  ${r.cu.padEnd(7)}→ ${r.moi.padEnd(8)} ${r.scope.padEnd(9)} ${(r.type ?? "").padEnd(16)} ` +
          `${(r.coTaiLieu ? "CÓ" : "—").padEnd(9)} ${r.status}${r.doiSo ? "   ← ĐỔI SỐ" : ""}`
      );
    }
    const doi = cua.filter((r) => r.doiSo);
    const doiCoTaiLieu = doi.filter((r) => r.coTaiLieu);
    console.log(`  → ${doi.length}/${cua.length} phiếu đổi số, trong đó ${doiCoTaiLieu.length} phiếu ĐÃ XUẤT tài liệu.`);
  }

  if (CSV) {
    console.log("\n--- CSV ---");
    console.log("thang,id,stt_cu,stt_moi,day,loai_phieu,da_xuat_tai_lieu,trang_thai,nguoi_tao,tao_luc");
    for (const r of rows) {
      console.log(
        [
          r.sequenceMonth,
          r.id,
          r.sequenceNumber,
          r.moi,
          r.scope,
          r.type,
          r.coTaiLieu ? "1" : "0",
          r.status,
          `"${(r.createdByName ?? "").replace(/"/g, '""')}"`,
          r.createdAt.toISOString(),
        ].join(",")
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
