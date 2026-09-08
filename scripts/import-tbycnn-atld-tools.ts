/**
 * Nạp 3 bảng dụng cụ ATLĐ (Thang di động · Dây đai an toàn · Dụng cụ điện cầm tay)
 * từ hồ sơ TBYCNN_Final.pdf vào sổ TBYCNN.
 *
 *   npx tsx scripts/import-tbycnn-atld-tools.ts [--period 2026-09] [--dry-run] [--undo]
 *
 * KHÁC `import-tbycnn.ts` ở hai điểm, có chủ đích:
 *
 * 1. **`sourceId = null`.** Bộ 709 dòng gốc chiếm sourceId 1..711, và `import:tbycnn --prune`
 *    XOÁ mọi dòng của kỳ có sourceId ngoài tệp nguồn của nó. Cấp sourceId cho 39 dòng này là
 *    tự đặt bẫy: một lượt `--prune` sau này quét sạch chúng. Với sourceId null, mệnh đề
 *    `NOT (sourceId IN (…))` ra NULL nên prune không đụng tới.
 *    Idempotent thay bằng khoá nghiệp vụ `(kỳ, danh mục, mã hiệu)` — 39 mã hiệu đều duy nhất.
 *
 * 2. **Tự ghép `khuVuc` / `nhom` / `tt`** theo ĐÚNG luật của `submitCreate` trong
 *    `components/tbycnn/TbycnnPage.tsx`, kể cả mẹo dùng lại cách viết đang có trong sổ
 *    ("Khí Nén – Nhà Dầu" gạch dài ≠ nhãn danh mục "Khí nén - Nhà dầu"). Ghép mù theo nhãn
 *    chuẩn là đẻ ra nhóm thứ hai trông y hệt nhóm cũ.
 *
 * Quy ước chuyển đổi từ hồ sơ giấy sang cột của sổ:
 *   - Mỗi cột của biểu mẫu vào ĐÚNG cột của nó (`taiTrongThuKg`, `thoiGianThuPhut`,
 *     `tinhTrangSuDung`, `kiemTraBangMat`, `cachDienMOhm`, `ketQuaThu`) — xem
 *     prisma/manual/add-tbycnn-tool-columns.sql. KHÔNG ghép chuỗi vào `thongSoKyThuat`
 *     hay `ghiChu` nữa: ghép thì không lọc, không sắp xếp, không đối chiếu được bản giấy.
 *   - Kết quả "Đạt"          → soLuongKhaDung 1, soLuongKhongKhaDung 0
 *   - Kết quả khác "Đạt"     → soLuongKhaDung 0, soLuongKhongKhaDung 1
 *   - `kdGanNhat` = `kdTiepTheo` trừ chu kỳ (hồ sơ chỉ ghi ngày kiểm tra tiếp theo)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { normalizePosition } from "../lib/pccc-position";
import { parsePeriodLabel, parseVNDate, periodLabelOf, romanOf, TBYCNN_DON_VI_QUAN_LY } from "../lib/tbycnn";

const prisma = new PrismaClient();

function argValue(name: string) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

const FILE = argValue("--file") ?? path.join(process.cwd(), "scripts", "data", "tbycnn-atld-tools.json");
const PERIOD = argValue("--period") ?? periodLabelOf();
const DRY_RUN = process.argv.includes("--dry-run");
const UNDO = process.argv.includes("--undo");

type SourceRow = {
  tt: number;
  tenThietBi: string;
  maHieu: string;
  cuongViRaw: string;
  /** Chữ nguyên văn của ô Cương vị trong hồ sơ khi khác `cuongViRaw` (vd ô ghi hai chức danh). */
  cuongViHoSo?: string;
  thongSo?: string;
  tinhTrang?: string;
  kiemTraBangMat?: string;
  cachDienMOhm?: number;
  taiTrongThuKg?: number;
  thoiGianThuPhut?: number;
  ketQua: string;
  chuKyThuThang?: number | null;
  kdTiepTheoText?: string;
};

type SourceTable = {
  danhMuc: string;
  chuKyThuThang: number;
  kdTiepTheoText: string;
  taiTrongThuKg?: number;
  thoiGianThuPhut?: number;
  records: SourceRow[];
};

/**
 * Lùi `months` tháng, KẸP về ngày cuối tháng đích y như `computeDefaultKdTiepTheo` đi tới:
 * 31/03 lùi 1 tháng phải ra 28/02 chứ không để `Date` cuộn về 03/03.
 */
function subtractMonths(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

/** Ghép các mảnh chữ thành một ô, bỏ mảnh rỗng. Không mảnh nào thì trả null. */
function joinParts(parts: Array<string | null | undefined>): string | null {
  const kept = parts.map((p) => (p ?? "").trim()).filter(Boolean);
  return kept.length ? kept.join("; ") : null;
}

/** Thông tin một nhóm (khuVuc) đang có trong kỳ — dùng để ghép nhóm mới đúng cách viết cũ. */
type GroupInfo = {
  khuVuc: string;
  maxNhomSo: number;
  chucDanhQuanLy: string | null;
  /** danhMuc → chuỗi `nhom` đang dùng, để không đánh số La Mã lần hai cho cùng danh mục. */
  nhomByDanhMuc: Map<string, string>;
  /** `${nhom}` → STT lớn nhất đang có. */
  maxTtByNhom: Map<string, number>;
};

async function main() {
  const parsed = parsePeriodLabel(PERIOD);
  if (!parsed) throw new Error(`Kỳ không hợp lệ: "${PERIOD}" (định dạng YYYY-MM)`);

  const source = JSON.parse(readFileSync(FILE, "utf8")) as { bangs?: SourceTable[] };
  const tables = source.bangs ?? [];
  if (!tables.length) throw new Error(`Không đọc được bảng nào từ ${FILE}`);

  const period = await prisma.tbycnnPeriod.findUnique({ where: { label: PERIOD }, select: { id: true, isClosed: true } });
  if (!period) throw new Error(`Chưa có kỳ ${PERIOD} trong DB — chạy npm run import:tbycnn trước.`);
  if (period.isClosed) throw new Error(`Kỳ ${PERIOD} đã chốt sổ — không ghi thêm được.`);

  const danhMucs = tables.map((t) => t.danhMuc);

  if (UNDO) {
    // Gỡ đúng phần script này đã nạp: 3 danh mục mới + sourceId null. Không đụng dòng gốc.
    const doomed = await prisma.tbycnnEquipment.findMany({
      where: { periodId: period.id, sourceId: null, danhMuc: { in: danhMucs } },
      select: { id: true, khuVuc: true, danhMuc: true, maHieu: true },
    });
    console.log(`Gỡ ${doomed.length} dòng đã nạp (kỳ ${PERIOD})${DRY_RUN ? " — DRY RUN, không xoá" : ""}:`);
    for (const d of doomed) console.log(`  - ${d.danhMuc} / ${d.maHieu} (${d.khuVuc || "«không cương vị»"})`);
    if (!DRY_RUN && doomed.length) {
      await prisma.tbycnnEquipment.deleteMany({ where: { id: { in: doomed.map((d) => d.id) } } });
    }
    return;
  }

  // ---- Dựng bản đồ nhóm đang có trong kỳ ------------------------------------------------
  /*
   * LOẠI chính các dòng script này quản lý ra khỏi bản đồ.
   *
   * `tt` được tính là "max + 1 trong nhóm". Nếu đếm cả các dòng của chính lượt nạp trước
   * thì mỗi lần chạy lại lại cộng dồn: lần hai, STT của Máy phó nhảy từ 1..5 lên 6..10 và
   * thứ tự sổ sai hẳn (đã xảy ra thật). Loại ra thì chạy bao nhiêu lượt cũng ra cùng một
   * kết quả — đúng nghĩa idempotent.
   *
   * NOT ở đây là NOT(sourceId IS NULL AND danhMuc IN (...)): dòng gốc có sourceId nên vế
   * đầu sai, cả mệnh đề sai, phủ định lại thành đúng — vẫn được giữ.
   */
  const existing = await prisma.tbycnnEquipment.findMany({
    where: {
      periodId: period.id,
      NOT: { sourceId: null, danhMuc: { in: danhMucs } },
    },
    select: { khuVuc: true, cuongViCode: true, machine: true, nhom: true, nhomSo: true, danhMuc: true, chucDanhQuanLy: true, tt: true },
  });
  const groups = new Map<string, GroupInfo>();
  /** (cuongViCode|machine) → khuVuc đang dùng, để chép lại đúng cách viết trong sổ. */
  const khuVucByPos = new Map<string, string>();
  for (const row of existing) {
    const g = groups.get(row.khuVuc) ?? {
      khuVuc: row.khuVuc,
      maxNhomSo: 0,
      chucDanhQuanLy: row.chucDanhQuanLy,
      nhomByDanhMuc: new Map(),
      maxTtByNhom: new Map(),
    };
    g.maxNhomSo = Math.max(g.maxNhomSo, row.nhomSo ?? 0);
    if (!g.nhomByDanhMuc.has(row.danhMuc)) g.nhomByDanhMuc.set(row.danhMuc, row.nhom);
    g.maxTtByNhom.set(row.nhom, Math.max(g.maxTtByNhom.get(row.nhom) ?? 0, row.tt ?? 0));
    if (!g.chucDanhQuanLy) g.chucDanhQuanLy = row.chucDanhQuanLy;
    groups.set(row.khuVuc, g);
    const posKey = `${row.cuongViCode ?? ""}|${row.machine}`;
    if (!khuVucByPos.has(posKey)) khuVucByPos.set(posKey, row.khuVuc);
  }

  const planned: Array<{ data: Prisma.TbycnnEquipmentUncheckedCreateInput; existingId: string | null }> = [];
  const unmatched = new Set<string>();
  const noPosition: string[] = [];

  for (const table of tables) {
    for (const raw of table.records) {
      const pos = normalizePosition(raw.cuongViRaw ?? "");
      if (pos.unmatched && pos.label) unmatched.add(pos.label);
      if (!pos.code) noPosition.push(`${table.danhMuc} / ${raw.maHieu}`);

      // khuVuc: dùng lại đúng chuỗi của cặp (cương vị, tổ máy) đang có trong sổ; chưa có thì
      // mới ghép. Cương vị rỗng → khuVuc rỗng (hồ sơ không ghi ai quản lý).
      const posKey = `${pos.code ?? ""}|${pos.machine}`;
      const khuVuc = pos.label
        ? khuVucByPos.get(posKey) ?? (pos.machine === "COMMON" ? pos.label : `${pos.label} ${pos.machine}`)
        : "";

      const group = groups.get(khuVuc) ?? {
        khuVuc,
        maxNhomSo: 0,
        chucDanhQuanLy: khuVuc || null,
        nhomByDanhMuc: new Map<string, string>(),
        maxTtByNhom: new Map<string, number>(),
      };
      if (!groups.has(khuVuc)) {
        groups.set(khuVuc, group);
        if (pos.label) khuVucByPos.set(posKey, khuVuc);
      }

      let nhom = group.nhomByDanhMuc.get(table.danhMuc);
      if (!nhom) {
        group.maxNhomSo += 1;
        nhom = `${romanOf(group.maxNhomSo)}. ${table.danhMuc}`;
        group.nhomByDanhMuc.set(table.danhMuc, nhom);
      }
      const tt = (group.maxTtByNhom.get(nhom) ?? 0) + 1;
      group.maxTtByNhom.set(nhom, tt);

      const chuKyThu = raw.chuKyThuThang === undefined ? table.chuKyThuThang : raw.chuKyThuThang;
      const kdTiepTheoText = (raw.kdTiepTheoText === undefined ? table.kdTiepTheoText : raw.kdTiepTheoText) || null;
      const kdTiepTheo = parseVNDate(kdTiepTheoText);
      // Hồ sơ CHỈ ghi ngày kiểm tra tiếp theo. Ngày kiểm định gần nhất suy ngược từ chu kỳ
      // (đã chốt với người dùng) — không có một trong hai thì để trống, không đoán tiếp.
      const kdGanNhat = kdTiepTheo && chuKyThu ? subtractMonths(kdTiepTheo, Math.round(chuKyThu)) : null;

      /*
       * `ketQua` để TRỐNG = thiết bị CHƯA ĐƯỢC THỬ trong đợt này (vd PXVH1-THANG-03: bản
       * giấy có chữ "Đạt" nhưng bỏ trống cả hai mốc kiểm định, và con số tổng kết của
       * chính biên bản đó — 16 — chỉ đếm 16 thang thật sự thử ngày 20/05/2026).
       *
       * Chưa thử thì Tình trạng về "Chưa cập nhật" (hai ô null), KHÔNG phải "Không khả
       * dụng": chưa thử khác hẳn thử xong bị đánh trượt.
       */
      const ketQua = raw.ketQua.trim();
      const chuaThu = ketQua === "";
      const dat = ketQua.toLowerCase() === "đạt";
      const taiTrong = raw.taiTrongThuKg ?? table.taiTrongThuKg;
      const thoiGianThu = raw.thoiGianThuPhut ?? table.thoiGianThuPhut;

      const data: Prisma.TbycnnEquipmentUncheckedCreateInput = {
        periodId: period.id,
        sourceId: null,
        khuVuc,
        cuongVi: pos.label,
        cuongViCode: pos.code,
        machine: pos.machine,
        nhom,
        nhomSo: group.maxNhomSo,
        danhMuc: table.danhMuc,
        tt,
        tenThietBi: raw.tenThietBi,
        soLuong: 1,
        maHieu: raw.maHieu,
        thongSoKyThuat: raw.thongSo?.trim() || null,
        taiTrongThuKg: taiTrong ?? null,
        thoiGianThuPhut: thoiGianThu ?? null,
        tinhTrangSuDung: raw.tinhTrang?.trim() || null,
        kiemTraBangMat: raw.kiemTraBangMat?.trim() || null,
        cachDienMOhm: raw.cachDienMOhm ?? null,
        ketQuaThu: chuaThu ? null : ketQua,
        // Hồ sơ để trống cột này ở cả 6 dòng dụng cụ điện; giữ null chứ không bịa "Không".
        nghiemThuSauSuaChua: null,
        chucDanhQuanLy: group.chucDanhQuanLy ?? (khuVuc || null),
        donViQuanLy: TBYCNN_DON_VI_QUAN_LY,
        chuKyThu: chuKyThu ?? null,
        kdGanNhat,
        kdGanNhatText: kdGanNhat ? formatVN(kdGanNhat) : null,
        kdTiepTheo,
        kdTiepTheoText,
        soLuongKhaDung: chuaThu ? null : dat ? 1 : 0,
        soLuongKhongKhaDung: chuaThu ? null : dat ? 0 : 1,
        // Kết quả đã có cột riêng; `khiemKhuyet` chỉ giữ phần GIẢI THÍCH của dòng không đạt.
        khiemKhuyet: chuaThu || dat ? null : ketQua,
        /*
         * Ghi chú CHỈ giữ thứ thuộc về hồ sơ. Trước đây có thêm câu "KĐ gần nhất suy ra
         * từ KĐ tiếp theo trừ chu kỳ" — ghi chú nội bộ của lượt nhập, nhưng cột Ghi chú
         * của bảng dụng cụ điện được IN THẲNG vào biên bản kiểm tra nộp lên, nên câu đó
         * xuất hiện trên văn bản chính thức. Đã bỏ: ba biên bản gốc của phân xưởng xác
         * nhận ngày kiểm tra đúng bằng ngày suy ra (20/5, 08/6, 03/7/2026), nên đó là số
         * liệu đã kiểm chứng chứ không còn là giả định cần chú thích.
         */
        ghiChu: joinParts([
          raw.cuongViHoSo ? `Hồ sơ ghi cương vị: "${raw.cuongViHoSo}"` : null,
        ]),
      };

      const found = await prisma.tbycnnEquipment.findFirst({
        where: { periodId: period.id, sourceId: null, danhMuc: table.danhMuc, maHieu: raw.maHieu },
        select: { id: true },
      });
      planned.push({ data, existingId: found?.id ?? null });
    }
  }

  const toCreate = planned.filter((p) => !p.existingId).length;
  const toUpdate = planned.length - toCreate;
  console.log(`Nguồn: ${FILE}`);
  console.log(`Kỳ ${PERIOD} — ${planned.length} dòng (${toCreate} thêm mới, ${toUpdate} cập nhật)${DRY_RUN ? " — DRY RUN, không ghi" : ""}`);
  const perGroup = new Map<string, number>();
  for (const p of planned) {
    const key = `${p.data.khuVuc || "«không cương vị»"} → ${p.data.nhom}`;
    perGroup.set(key, (perGroup.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...perGroup].sort()) console.log(`  ${count.toString().padStart(2)}  ${key}`);
  if (unmatched.size) console.log(`CẢNH BÁO — cương vị chưa khớp danh mục: ${[...unmatched].join(", ")}`);
  if (noPosition.length) console.log(`${noPosition.length} dòng KHÔNG có cương vị quản lý (hồ sơ để trống): ${noPosition.join(", ")}`);

  if (DRY_RUN) return;

  for (const p of planned) {
    if (p.existingId) await prisma.tbycnnEquipment.update({ where: { id: p.existingId }, data: p.data });
    else await prisma.tbycnnEquipment.create({ data: p.data });
  }
  const total = await prisma.tbycnnEquipment.count({ where: { periodId: period.id } });
  console.log(`Xong. Tổng thiết bị trong kỳ ${PERIOD}: ${total}.`);
}

function formatVN(date: Date) {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${date.getUTCFullYear()}`;
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
