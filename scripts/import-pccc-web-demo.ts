/**
 * Nạp BỐN NHÓM THIẾT BỊ PCCC ĐỢT 2 từ `data.js` của bản web demo tĩnh vào Postgres:
 * nút nhấn báo cháy (NNBC), van chữa cháy, đèn EXIT, đèn chiếu sáng sự cố — cộng
 * thêm cuộn vòi chữa cháy (CVCC) sinh từ tủ chữa cháy đã có sẵn trong DB.
 *
 *   npx tsx scripts/import-pccc-web-demo.ts --file "<đường dẫn data.js>" [--dry-run] [--prune]
 *   npx tsx scripts/import-pccc-web-demo.ts --file "…/data.js" --only nnbc,van
 *
 * VÌ SAO ĐỌC data.js CHỨ KHÔNG ĐỌC THẲNG 3 FILE EXCEL NGUỒN:
 * `export_web_data.py` của bản bàn giao đã làm sẵn phần khó và ĐÃ ĐƯỢC ĐỐI CHIẾU —
 * lấy đúng khối kiểm tra cuối của NNBC, dò cột "Tháng…" mới nhất của đèn, trải ô
 * merge cấp khu vực xuống từng đèn, gộp biến thể chính tả cương vị. Viết lại parser
 * Excel ở đây chỉ để ra cùng một kết quả là nhân đôi chỗ sai. Khi nào nguồn Excel
 * đổi cấu trúc thì chạy lại script Python rồi chạy lại script này.
 *
 * KHOÁ NGHIỆP VỤ: ba nguồn này KHÔNG có mã duy nhất (đo trên T07+T08.2026: NNBC có
 * 6 cặp dòng trùng hệt nhau, đèn EXIT có mã KKS lặp ở nhiều khu vực), nên mỗi dòng
 * mang `rowKey` = "<mã KKS>" cho lần xuất hiện đầu và "<mã KKS>#2", "#3"… cho các
 * lần sau, theo ĐÚNG thứ tự dòng của nguồn. Nhờ vậy chạy lại nhiều lần không nhân
 * bản (idempotent) và kỳ sau ghép được với kỳ trước.
 *
 * KHÔNG XOÁ GÌ theo mặc định. `--prune` mới xoá các dòng của kỳ đó không còn trong
 * nguồn (in danh sách trước khi xoá).
 */
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { normalizePosition } from "../lib/pccc-position";
import {
  ALARM_BUTTON_GROUPS,
  HOSE_REEL_GROUPS,
  deriveCabinetStatus,
  deriveHoseReelStatus,
  type TccComponent,
} from "../lib/pccc-status";

const prisma = new PrismaClient();

// ---------------------------------------------------------------- tham số CLI
function argValue(name: string) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const DEFAULT_FILE = "C:/Users/Asus/OneDrive/Desktop/Ban_Giao_Website_PCCC/Web_Demo_PCCC/data.js";
const FILE = argValue("--file") ?? DEFAULT_FILE;
const DRY_RUN = process.argv.includes("--dry-run");
const PRUNE = process.argv.includes("--prune");
const ONLY = (argValue("--only") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const wants = (name: string) => ONLY.length === 0 || ONLY.includes(name);

// ------------------------------------------------------------- đọc data.js
type DemoRow = Record<string, unknown>;
type DemoData = {
  months: string[];
  tcc?: Record<string, DemoRow[]>;
  nnbc?: Record<string, DemoRow[]>;
  van?: Record<string, DemoRow[]>;
  denExit?: Record<string, DemoRow[]>;
  denCssc?: Record<string, DemoRow[]>;
};

/**
 * `data.js` là một câu lệnh gán `window.__PCCC_DATA__ = {...}` chứ không phải JSON,
 * nên dựng một `window` giả rồi chạy nó trong Function — không cần jsdom.
 */
function readDemoData(file: string): DemoData {
  if (!existsSync(file)) throw new Error(`Không thấy file dữ liệu: ${file}`);
  const holder: { __PCCC_DATA__?: DemoData } = {};
  const prev = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = holder;
  try {
    new Function(readFileSync(file, "utf8"))();
  } finally {
    (globalThis as { window?: unknown }).window = prev;
  }
  const data = holder.__PCCC_DATA__;
  if (!data?.months?.length) throw new Error("File không chứa window.__PCCC_DATA__ hợp lệ");
  return data;
}

// ------------------------------------------------------------------ tiện ích
const str = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};
const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const date = (v: unknown) => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Bộ sinh `rowKey`: mã đầu tiên giữ nguyên, các lần lặp sau thêm "#2", "#3"… */
function makeRowKeyer() {
  const seen = new Map<string, number>();
  return (base: string) => {
    const key = base || "(trống)";
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}#${n}`;
  };
}

/** Chuẩn hoá cặp cương vị + cấp giám sát về danh mục chức danh chung. */
function positions(row: DemoRow) {
  const cv = normalizePosition(str(row.cuongVi));
  const gs = normalizePosition(str(row.nguoiGiamSat));
  return {
    cuongVi: cv.label,
    cuongViCode: cv.code,
    machine: cv.machine,
    nguoiGiamSat: gs.label,
    nguoiGiamSatCode: gs.code,
    unmatched: cv.unmatched ? str(row.cuongVi) : null,
  };
}

/** Ô tích của nguồn demo: { "<nhóm>": { "<trạng thái>": bool } } → mảng phẳng. */
function flattenComponents(
  raw: unknown,
  groups: readonly { label: string; statuses: readonly string[] }[]
): TccComponent[] {
  const src = (raw ?? {}) as Record<string, Record<string, unknown>>;
  const out: TccComponent[] = [];
  groups.forEach((g, groupOrder) => {
    g.statuses.forEach((status, statusOrder) => {
      out.push({
        groupLabel: g.label,
        status,
        checked: Boolean(src[g.label]?.[status]),
        statusOrder,
        // groupOrder không nằm trong TccComponent nhưng cần khi ghi DB — giữ riêng ở dưới.
        ...({ groupOrder } as object),
      } as TccComponent & { groupOrder: number });
    });
  });
  return out;
}
type StoredComponent = TccComponent & { groupOrder: number };

// ------------------------------------------------------------------ thống kê
const stats = { created: 0, updated: 0, deleted: 0, skipped: 0 };
const unmatchedPositions = new Map<string, number>();
function noteUnmatched(value: string | null) {
  if (!value) return;
  unmatchedPositions.set(value, (unmatchedPositions.get(value) ?? 0) + 1);
}

async function periodOf(label: string) {
  const period = await prisma.pcccPeriod.findUnique({ where: { label }, select: { id: true, label: true, isClosed: true } });
  if (!period) {
    console.log(`  ⚠ Bỏ qua kỳ ${label}: chưa có PcccPeriod trong DB (chạy import BCC/TCC trước).`);
    return null;
  }
  return period;
}

// ============================================================ NÚT NHẤN BÁO CHÁY
async function importAlarmButtons(data: DemoData, label: string, periodId: string) {
  const rows = data.nnbc?.[label] ?? [];
  const rowKey = makeRowKeyer();
  const keep = new Set<string>();

  for (const row of rows) {
    const key = rowKey(String(str(row.maKks) ?? ""));
    keep.add(key);
    const p = positions(row);
    noteUnmatched(p.unmatched);
    const components = flattenComponents(row.components, ALARM_BUTTON_GROUPS) as StoredComponent[];

    const payload = {
      stt: num(row.stt),
      maKks: str(row.maKks) ?? "",
      tenKhuVuc: str(row.tenKhuVuc),
      viTri: str(row.viTri),
      cuongVi: p.cuongVi,
      cuongViCode: p.cuongViCode,
      machine: p.machine,
      nguoiGiamSat: p.nguoiGiamSat,
      nguoiGiamSatCode: p.nguoiGiamSatCode,
      khac: str(row.khac),
      ngayKiemTra: date(row.ngayKiemTra),
      nguoiKiemTra: str(row.nguoiKiemTra),
      // Tình trạng tổng thể LUÔN tính lại từ ô tích, không tin giá trị của nguồn:
      // đây là trường dẫn xuất, nguồn và công thức lệch nhau thì công thức thắng.
      tinhTrangTongThe: deriveCabinetStatus(components),
    };

    if (DRY_RUN) { stats.skipped++; continue; }

    const existing = await prisma.pcccAlarmButton.findUnique({
      where: { periodId_rowKey: { periodId, rowKey: key } },
      select: { id: true },
    });
    const saved = existing
      ? await prisma.pcccAlarmButton.update({ where: { id: existing.id }, data: payload, select: { id: true } })
      : await prisma.pcccAlarmButton.create({ data: { ...payload, periodId, rowKey: key }, select: { id: true } });
    existing ? stats.updated++ : stats.created++;

    for (const c of components) {
      await prisma.pcccAlarmButtonComponent.upsert({
        where: { buttonId_groupLabel_status: { buttonId: saved.id, groupLabel: c.groupLabel, status: c.status } },
        create: { buttonId: saved.id, groupLabel: c.groupLabel, status: c.status, checked: c.checked, groupOrder: c.groupOrder, statusOrder: c.statusOrder },
        update: { checked: c.checked, groupOrder: c.groupOrder, statusOrder: c.statusOrder },
      });
    }
  }
  await pruneMissing("pcccAlarmButton", periodId, keep, (r) => r.rowKey);
  return rows.length;
}

// ================================================================ VAN CHỮA CHÁY
async function importValves(data: DemoData, label: string, periodId: string) {
  const rows = data.van?.[label] ?? [];
  const rowKey = makeRowKeyer();
  const keep = new Set<string>();

  for (const row of rows) {
    const key = rowKey(String(str(row.maKks) ?? ""));
    keep.add(key);
    const p = positions(row);
    noteUnmatched(p.unmatched);

    const payload = {
      stt: num(row.stt),
      tenVan: str(row.tenVan) ?? "",
      loaiVan: (str(row.loaiVan) ?? "DELUGE").toUpperCase(),
      maKks: str(row.maKks) ?? "",
      cuongVi: p.cuongVi,
      cuongViCode: p.cuongViCode,
      machine: p.machine,
      nguoiGiamSat: p.nguoiGiamSat,
      nguoiGiamSatCode: p.nguoiGiamSatCode,
      viTri: str(row.viTri),
      tinhTrang: str(row.tinhTrang),
      moTa: str(row.moTa),
      soYcsc: str(row.soYcsc),
      ngayKiemTra: date(row.ngayKiemTra),
      nguoiKiemTra: str(row.nguoiKiemTra),
    };

    if (DRY_RUN) { stats.skipped++; continue; }

    const existing = await prisma.pcccValve.findUnique({
      where: { periodId_rowKey: { periodId, rowKey: key } },
      select: { id: true },
    });
    if (existing) { await prisma.pcccValve.update({ where: { id: existing.id }, data: payload }); stats.updated++; }
    else { await prisma.pcccValve.create({ data: { ...payload, periodId, rowKey: key } }); stats.created++; }
  }
  await pruneMissing("pcccValve", periodId, keep, (r) => r.rowKey);
  return rows.length;
}

// ============================================== ĐÈN EXIT / ĐÈN CHIẾU SÁNG SỰ CỐ
async function importLights(data: DemoData, label: string, periodId: string, loai: "EXIT" | "CSSC") {
  const rows = (loai === "EXIT" ? data.denExit?.[label] : data.denCssc?.[label]) ?? [];
  const rowKey = makeRowKeyer();
  const keep = new Set<string>();

  for (const row of rows) {
    const key = rowKey(String(str(row.maKks) ?? ""));
    keep.add(key);
    const p = positions(row);
    noteUnmatched(p.unmatched);

    const payload = {
      stt: num(row.stt),
      maKks: str(row.maKks) ?? "",
      tenKhuVuc: str(row.tenKhuVuc),
      maBanVe: str(row.maBanVe),
      soLuongKhuVuc: num(row.soLuongKhuVuc),
      cuongVi: p.cuongVi,
      cuongViCode: p.cuongViCode,
      machine: p.machine,
      nguoiGiamSat: p.nguoiGiamSat,
      nguoiGiamSatCode: p.nguoiGiamSatCode,
      tinhTrang: str(row.tinhTrang),
      ketQuaTest: str(row.ketQuaTest),
      ghiChu: str(row.ghiChu),
      ngayKiemTra: date(row.ngayKiemTra),
      nguoiKiemTra: str(row.nguoiKiemTra),
    };

    if (DRY_RUN) { stats.skipped++; continue; }

    const existing = await prisma.pcccEmergencyLight.findUnique({
      where: { periodId_loai_rowKey: { periodId, loai, rowKey: key } },
      select: { id: true },
    });
    if (existing) { await prisma.pcccEmergencyLight.update({ where: { id: existing.id }, data: payload }); stats.updated++; }
    else { await prisma.pcccEmergencyLight.create({ data: { ...payload, periodId, loai, rowKey: key } }); stats.created++; }
  }
  await pruneMissing("pcccEmergencyLight", periodId, keep, (r) => r.rowKey, { loai });
  return rows.length;
}

// ========================================================= CUỘN VÒI CHỮA CHÁY
/**
 * Mã cuộn vòi suy từ mã tủ cha — chép đúng deriveCvccMa() của bản demo: đổi đoạn
 * "TCC" thành "CVCC"; tủ ngoài trời chèn thêm "01"/"02" ngay TRƯỚC hai đoạn cuối.
 */
function deriveHoseReelMa(cabinetMa: string, seqNum: number | null) {
  const parts = String(cabinetMa || "").split("/");
  const idx = parts.indexOf("TCC");
  if (idx !== -1) parts[idx] = "CVCC";
  if (seqNum) {
    const tail = parts.length >= 2 ? parts.splice(parts.length - 2, 2) : [];
    parts.push(String(seqNum).padStart(2, "0"), ...tail);
  }
  return parts.join("/");
}

/**
 * Sinh cuộn vòi từ tủ chữa cháy CỦA CHÍNH KỲ ĐÓ. Tủ INDOOR → 1 cuộn, OUTDOOR → 2.
 * Trạng thái ô tích SAO từ hai nhóm cùng tên của tủ cha tại thời điểm sinh; sau đó
 * hai bảng sửa độc lập với nhau.
 *
 * CHỈ SINH DÒNG CÒN THIẾU: cuộn vòi đã có trong DB là dữ liệu thật (người dùng đã
 * sửa/ký, hoặc tự thêm tay) — chạy lại script không được ghi đè lên đó.
 */
async function importHoseReels(periodId: string) {
  const cabinets = await prisma.pcccCabinet.findMany({
    where: { periodId },
    orderBy: [{ stt: "asc" }, { ma: "asc" }],
    select: {
      id: true, ma: true, ten: true, viTri: true, cuongVi: true, cuongViCode: true, machine: true,
      components: { select: { groupLabel: true, status: true, checked: true, groupOrder: true, statusOrder: true } },
    },
  });

  let stt = 1;
  let planned = 0;
  for (const cab of cabinets) {
    const variants = /OUTDOOR/i.test(cab.ten ?? "") ? [1, 2] : [null];
    for (const v of variants) {
      const ma = deriveHoseReelMa(cab.ma, v);
      const seq = stt++;
      planned++;
      if (DRY_RUN) { stats.skipped++; continue; }

      const existing = await prisma.pcccHoseReel.findUnique({
        where: { periodId_ma: { periodId, ma } },
        select: { id: true },
      });
      if (existing) { stats.skipped++; continue; }

      // Sao ô tích của tủ cha cho đúng hai nhóm của cuộn vòi; nhóm/mức nào tủ
      // không có thì để chưa tích.
      const components: StoredComponent[] = [];
      HOSE_REEL_GROUPS.forEach((g, groupOrder) => {
        g.statuses.forEach((status, statusOrder) => {
          const from = cab.components.find((c) => c.groupLabel === g.label && c.status === status);
          components.push({ groupLabel: g.label, status, checked: from?.checked ?? false, groupOrder, statusOrder });
        });
      });

      await prisma.pcccHoseReel.create({
        data: {
          periodId,
          cabinetId: cab.id,
          stt: seq,
          ma,
          ten: v ? `Cuộn vòi chữa cháy #${v}` : "Cuộn vòi chữa cháy",
          viTri: cab.viTri,
          cuongVi: cab.cuongVi,
          cuongViCode: cab.cuongViCode,
          machine: cab.machine,
          tinhTrangTongThe: deriveHoseReelStatus(components),
          components: {
            create: components.map((c) => ({
              groupLabel: c.groupLabel, status: c.status, checked: c.checked,
              groupOrder: c.groupOrder, statusOrder: c.statusOrder,
            })),
          },
        },
      });
      stats.created++;
    }
  }
  return planned;
}

// ------------------------------------------------------------------- prune
type PrunableModel = "pcccAlarmButton" | "pcccValve" | "pcccEmergencyLight";
async function pruneMissing(
  model: PrunableModel,
  periodId: string,
  keep: Set<string>,
  keyOf: (row: { rowKey: string }) => string,
  extraWhere: Record<string, unknown> = {}
) {
  if (!PRUNE || DRY_RUN) return;
  const where = { periodId, ...extraWhere } as never;
  const delegate = prisma[model] as unknown as {
    findMany: (a: unknown) => Promise<{ id: string; rowKey: string }[]>;
    delete: (a: unknown) => Promise<unknown>;
  };
  const rows = await delegate.findMany({ where, select: { id: true, rowKey: true } });
  const stale = rows.filter((r) => !keep.has(keyOf(r)));
  for (const r of stale) {
    console.log(`  🗑 xoá ${model} rowKey=${r.rowKey}`);
    await delegate.delete({ where: { id: r.id } });
    stats.deleted++;
  }
}

// -------------------------------------------------------------------- main
async function main() {
  console.log(`Nguồn: ${FILE}`);
  if (DRY_RUN) console.log("CHẾ ĐỘ THỬ (--dry-run): không ghi gì vào DB.\n");
  const data = readDemoData(FILE);
  console.log(`Các kỳ trong nguồn: ${data.months.join(", ")}\n`);

  for (const label of data.months) {
    const period = await periodOf(label);
    if (!period) continue;
    if (period.isClosed) { console.log(`  ⚠ Bỏ qua kỳ ${label}: đã CHỐT (chỉ đọc).`); continue; }
    console.log(`### Kỳ ${label}`);
    if (wants("nnbc")) console.log(`  NNBC          : ${await importAlarmButtons(data, label, period.id)} dòng nguồn`);
    if (wants("van")) console.log(`  Van chữa cháy : ${await importValves(data, label, period.id)} dòng nguồn`);
    if (wants("denExit")) console.log(`  Đèn EXIT      : ${await importLights(data, label, period.id, "EXIT")} dòng nguồn`);
    if (wants("denCssc")) console.log(`  Đèn CSSC      : ${await importLights(data, label, period.id, "CSSC")} dòng nguồn`);
    if (wants("cvcc")) console.log(`  Cuộn vòi      : ${await importHoseReels(period.id)} dòng suy từ tủ chữa cháy`);
    console.log("");
  }

  console.log(`Tổng: tạo ${stats.created} · cập nhật ${stats.updated} · bỏ qua ${stats.skipped} · xoá ${stats.deleted}`);
  if (unmatchedPositions.size) {
    console.log("\n⚠ Cương vị KHÔNG khớp danh mục chức danh (giữ nguyên nhãn, nhưng cuongViCode = null");
    console.log("  nên các dòng này chỉ Quản trị mới sửa/ký được — bổ sung bí danh vào lib/position-catalog.ts):");
    for (const [k, v] of [...unmatchedPositions].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
