/**
 * Nạp sổ TBYCNN (Thiết bị yêu cầu nghiêm ngặt về ATLĐ) từ bộ dữ liệu gốc vào Postgres.
 *
 *   npx tsx scripts/import-tbycnn.ts [--file <json>] [--period 2026-09] [--dry-run] [--prune]
 *
 * Nguồn mặc định: `scripts/data/tbycnn-equipment.json` — chính là `equipment_data.json`
 * của ứng dụng rời QuanLyThietBi_project, tức bản ĐÃ chạy qua 11 migration làm sạch của
 * app cũ (sửa số La Mã, chuẩn hoá tên danh mục/cương vị, tách tình trạng…). Vì vậy ở đây
 * không lặp lại các bước làm sạch đó, chỉ chuyển kiểu dữ liệu và chuẩn hoá cương vị.
 *
 * Idempotent: upsert theo (kỳ, sourceId) — chạy lại nhiều lần không nhân bản dòng.
 * Không xoá gì theo mặc định; `--prune` mới xoá các dòng của kỳ đó không còn trong file
 * nguồn (in danh sách trước khi xoá).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { normalizePosition } from "../lib/pccc-position";
import {
  extractDanhMuc,
  extractNhomSo,
  isExcelErrorMarker,
  parsePeriodLabel,
  parseVNDate,
  periodLabelOf,
  toIntOrNull,
  toNumberOrNull,
  trimOrNull,
} from "../lib/tbycnn";

const prisma = new PrismaClient();

function argValue(name: string) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

const FILE = argValue("--file") ?? path.join(process.cwd(), "scripts", "data", "tbycnn-equipment.json");
const PERIOD = argValue("--period") ?? periodLabelOf();
const DRY_RUN = process.argv.includes("--dry-run");
const PRUNE = process.argv.includes("--prune");

type SourceRecord = Record<string, unknown> & { id?: number };

/** Cương vị chưa khớp danh mục — gom lại báo cuối, thay vì im lặng bỏ qua. */
const unmatchedPositions = new Set<string>();

function mapRow(raw: SourceRecord, periodId: string) {
  const khuVuc = String(raw.khuVuc ?? "").trim();
  const pos = normalizePosition(khuVuc);
  if (pos.unmatched && pos.label) unmatchedPositions.add(pos.label);

  const nhom = String(raw.nhom ?? "").trim();
  const kdGanNhatText = trimOrNull(raw.thoiGianKdGanNhat);
  const kdTiepTheoTextRaw = trimOrNull(raw.thoiGianKdTiepTheo);
  // Mã lỗi Excel còn sót (#VALUE!…) coi như ô trống — bản cũ cũng vậy.
  const kdTiepTheoText = isExcelErrorMarker(kdTiepTheoTextRaw) ? null : kdTiepTheoTextRaw;

  return {
    periodId,
    sourceId: typeof raw.id === "number" ? raw.id : null,
    khuVuc,
    cuongVi: pos.label,
    cuongViCode: pos.code,
    machine: pos.machine,
    nhom,
    nhomSo: extractNhomSo(nhom),
    danhMuc: extractDanhMuc(nhom),
    tt: toIntOrNull(raw.tt),
    tenThietBi: String(raw.tenThietBi ?? "").trim(),
    soLuong: toIntOrNull(raw.soLuong),
    maHieu: trimOrNull(raw.maHieu),
    kks: trimOrNull(raw.kks),
    thongSoKyThuat: trimOrNull(raw.thongSoKyThuat),
    viTri: trimOrNull(raw.viTri),
    chucDanhQuanLy: trimOrNull(raw.chucDanhQuanLy),
    donViQuanLy: trimOrNull(raw.donViQuanLy),
    chuKyThu: toNumberOrNull(raw.chuKyThu),
    kdGanNhat: parseVNDate(kdGanNhatText),
    kdGanNhatText,
    soBbkd: trimOrNull(raw.soBBKD),
    donViKd: trimOrNull(raw.donViKD),
    kdTiepTheo: parseVNDate(kdTiepTheoText),
    kdTiepTheoText,
    soLuongKhaDung: toIntOrNull(raw.soLuongKhaDung),
    soLuongKhongKhaDung: toIntOrNull(raw.soLuongKhongKhaDung),
    khiemKhuyet: trimOrNull(raw.khiemKhuyet),
    ghiChu: trimOrNull(raw.ghiChu),
  };
}

async function main() {
  const parsedPeriod = parsePeriodLabel(PERIOD);
  if (!parsedPeriod) throw new Error(`Kỳ không hợp lệ: "${PERIOD}" (định dạng YYYY-MM)`);

  const source = JSON.parse(readFileSync(FILE, "utf8")) as { records?: SourceRecord[] };
  const records = source.records ?? [];
  if (!records.length) throw new Error(`Không đọc được dòng nào từ ${FILE}`);
  console.log(`Nguồn: ${FILE} — ${records.length} thiết bị, kỳ ${PERIOD}${DRY_RUN ? " (DRY RUN)" : ""}`);

  if (DRY_RUN) {
    const rows = records.map((r) => mapRow(r, "dry-run"));
    const khuVucs = new Set(rows.map((r) => r.khuVuc));
    const noDate = rows.filter((r) => !r.kdTiepTheo).length;
    console.log(`  ${khuVucs.size} cương vị, ${new Set(rows.map((r) => r.danhMuc)).size} danh mục`);
    console.log(`  ${noDate} dòng không parse được "KĐ tiếp theo" (giữ nguyên chữ trong kdTiepTheoText)`);
    if (unmatchedPositions.size) console.log(`  Cương vị chưa khớp danh mục: ${[...unmatchedPositions].join(", ")}`);
    return;
  }

  const period = await prisma.tbycnnPeriod.upsert({
    where: { label: PERIOD },
    update: {},
    create: { label: PERIOD, year: parsedPeriod.year, monthNo: parsedPeriod.monthNo },
  });
  if (period.isClosed) throw new Error(`Kỳ ${PERIOD} đã chốt sổ — không nạp thêm được.`);

  let created = 0;
  let updated = 0;
  const seen = new Set<number>();

  for (const raw of records) {
    const row = mapRow(raw, period.id);
    if (!row.tenThietBi) continue;
    if (row.sourceId == null) {
      // Không có id nguồn thì không có khoá upsert — tạo mới, tránh nhân bản im lặng.
      await prisma.tbycnnEquipment.create({ data: row });
      created++;
      continue;
    }
    seen.add(row.sourceId);
    const existing = await prisma.tbycnnEquipment.findUnique({
      where: { periodId_sourceId: { periodId: period.id, sourceId: row.sourceId } },
      select: { id: true },
    });
    if (existing) {
      await prisma.tbycnnEquipment.update({ where: { id: existing.id }, data: row });
      updated++;
    } else {
      await prisma.tbycnnEquipment.create({ data: row });
      created++;
    }
  }

  console.log(`Đã nạp: ${created} thêm mới, ${updated} cập nhật.`);

  if (PRUNE) {
    const stale = await prisma.tbycnnEquipment.findMany({
      where: { periodId: period.id, NOT: { sourceId: { in: [...seen] } } },
      select: { id: true, sourceId: true, khuVuc: true, tenThietBi: true },
    });
    if (stale.length) {
      console.log(`Xoá ${stale.length} dòng không còn trong nguồn:`);
      for (const s of stale) console.log(`  - #${s.sourceId} ${s.khuVuc} / ${s.tenThietBi}`);
      await prisma.tbycnnEquipment.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    } else {
      console.log("Không có dòng thừa cần xoá.");
    }
  }

  if (unmatchedPositions.size) {
    console.log(`CẢNH BÁO — cương vị chưa khớp lib/position-catalog.ts: ${[...unmatchedPositions].join(", ")}`);
  }

  const total = await prisma.tbycnnEquipment.count({ where: { periodId: period.id } });
  console.log(`Tổng trong kỳ ${PERIOD}: ${total} thiết bị.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
