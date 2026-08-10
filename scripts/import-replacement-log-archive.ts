/**
 * Nhập LƯU TRỮ lịch sử sử dụng vật tư từ sổ theo dõi (Google Sheet) vào
 * MaterialReplacementLog.
 *
 * Vì sao an toàn với luồng đang chạy:
 *  - dòng nhập KHÔNG gắn `replacementId` nên không đụng điểm theo dõi nào, không dời
 *    hạn thay thế, không sinh cảnh báo đến hạn;
 *  - KHÔNG gắn `defectId`/`requestNumber` nên không dính vào SYC hay lịch sử khiếm khuyết;
 *  - đánh dấu bằng `importSource` + `importKey`, có UNIQUE nên chạy lại chỉ CẬP NHẬT
 *    đúng dòng cũ, không bao giờ nhân bản.
 *
 * Chạy thử (không ghi):  npx tsx scripts/import-replacement-log-archive.ts <file.json>
 * Ghi thật:              npx tsx scripts/import-replacement-log-archive.ts <file.json> --commit
 */
import fs from "fs";
import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/nav";
import { positionCodeOf, positionLabelOf } from "@/lib/position-catalog";

const IMPORT_SOURCE = "SHEET_VT";

type Row = {
  tab: string; row: number;
  tenVT: string; ngaySuDung: string; qty: number | null; unit: string;
  noiDung: string; vhvSuDung: string; pct: string; ghiChu: string;
  cuongViChuan: string; loai: string;
};

function parseArgs() {
  const file = process.argv[2];
  if (!file) throw new Error("Thiếu đường dẫn file JSON dữ liệu");
  return { file, commit: process.argv.includes("--commit") };
}

async function main() {
  const { file, commit } = parseArgs();
  const rows: Row[] = JSON.parse(fs.readFileSync(file, "utf8"));

  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const byName = new Map(users.map((u) => [normalizeText(u.name), u]));
  // Người ghi nhận dự phòng cho các dòng không tra ra tài khoản (người đã nghỉ việc,
  // ô bỏ trống). Tên thật vẫn được giữ nguyên văn ở `doneByName` nên bảng hiển thị đúng.
  const fallback =
    (await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true }, select: { id: true, name: true } })) ??
    users[0];
  if (!fallback) throw new Error("Không tìm thấy tài khoản nào để gán người ghi nhận dự phòng");

  const planned = rows.map((r) => {
    const first = String(r.vhvSuDung || "").split(/[\n,;]/)[0].trim();
    const hit = byName.get(normalizeText(r.vhvSuDung)) ?? byName.get(normalizeText(first)) ?? null;
    const code = positionCodeOf(r.cuongViChuan);
    return {
      importKey: `${String(r.tab).trim()}|${r.row}`,
      matched: Boolean(hit),
      data: {
        importSource: IMPORT_SOURCE,
        importKey: `${String(r.tab).trim()}|${r.row}`,
        replacedAt: new Date(`${r.ngaySuDung}T00:00:00+07:00`),
        doneById: hit?.id ?? fallback.id,
        // Giữ tên nguyên văn trên sổ để bảng hiện đúng người, kể cả khi không có tài khoản.
        doneByName: r.vhvSuDung || null,
        quantity: r.qty === null ? null : Math.round(r.qty),
        note: r.noiDung || null,
        unitLabel: r.unit || null,
        pctNumber: r.pct || null,
        sourceNote: r.ghiChu || null,
        materialNameLabel: r.tenVT || null,
        materialCategory: r.loai || null,
        managingPosition: code ? positionLabelOf(code) : r.cuongViChuan || null,
      },
    };
  });

  const keys = planned.map((p) => p.importKey);
  const dupKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupKeys.length) throw new Error(`Khoá nhập bị trùng trong file: ${dupKeys.slice(0, 5).join(", ")}`);

  const existing = await prisma.materialReplacementLog.findMany({
    where: { importSource: IMPORT_SOURCE },
    select: { importKey: true },
  });
  const have = new Set(existing.map((e) => e.importKey));
  const insert = planned.filter((p) => !have.has(p.importKey));
  const update = planned.filter((p) => have.has(p.importKey));

  console.log(`Nguồn            : ${file}`);
  console.log(`Chế độ           : ${commit ? "GHI THẬT" : "CHẠY THỬ (không ghi gì)"}`);
  console.log(`Người ghi dự phòng: ${fallback.name}`);
  console.log("");
  console.log(`Dòng trong file  : ${planned.length}`);
  console.log(`  thêm mới       : ${insert.length}`);
  console.log(`  cập nhật lại   : ${update.length}`);
  console.log(`  khớp tài khoản : ${planned.filter((p) => p.matched).length}/${planned.length}`);
  console.log("");
  const byCat = new Map<string, number>();
  const byPos = new Map<string, number>();
  for (const p of planned) {
    byCat.set(p.data.materialCategory ?? "—", (byCat.get(p.data.materialCategory ?? "—") ?? 0) + 1);
    byPos.set(p.data.managingPosition ?? "—", (byPos.get(p.data.managingPosition ?? "—") ?? 0) + 1);
  }
  console.log("Theo loại vật tư:");
  [...byCat].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));
  console.log("\nTheo cương vị:");
  [...byPos].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));

  const before = await prisma.materialReplacementLog.count();
  console.log(`\nBảng lịch sử trước khi chạy: ${before} dòng (trong đó lưu trữ: ${existing.length})`);

  if (!commit) {
    console.log("\n[CHẠY THỬ] Không ghi gì. Thêm --commit để ghi thật.");
    return;
  }

  let done = 0;
  for (const p of planned) {
    await prisma.materialReplacementLog.upsert({
      where: { importSource_importKey: { importSource: IMPORT_SOURCE, importKey: p.importKey } },
      create: p.data,
      update: p.data,
    });
    done++;
    if (done % 100 === 0) console.log(`  … ${done}/${planned.length}`);
  }
  const after = await prisma.materialReplacementLog.count();
  const archived = await prisma.materialReplacementLog.count({ where: { importSource: IMPORT_SOURCE } });
  console.log(`\nĐã ghi ${done} dòng.`);
  console.log(`Bảng lịch sử sau khi chạy : ${after} dòng (lưu trữ: ${archived}, dòng web tự sinh: ${after - archived})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
