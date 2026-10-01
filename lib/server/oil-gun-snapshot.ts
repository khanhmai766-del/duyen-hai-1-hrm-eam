import type { OilGun, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/*
 * Ảnh chụp sơ đồ vòi đốt theo ngày (giờ Việt Nam) — bảng OilGunSnapshot.
 *
 * QUY TẮC (chốt với người dùng 01/10/2026):
 *  1. Không cần lịch chạy: mỗi lần sửa vòi / ghi chú chụp lại bản của HÔM NAY (ghi đè) → bản của một ngày luôn là
 *     trạng thái CUỐI ngày đó. Lần xem đầu tiên trong ngày cũng chụp (cả S1 và S2).
 *  2. KHÔNG LƯU BẢN TRÙNG: chỉ có dòng khi trạng thái khác bản gần nhất trước đó. Xem ngày D = bản gần nhất có
 *     date <= D, nên ngày không đổi gì vẫn hiển thị đúng mà không tốn dòng.
 *  3. LƯU 3 NĂM: bản cũ hơn 3 năm bị xoá khi chụp, NHƯNG giữ lại bản mới nhất nằm trước mốc làm "bản neo" — xoá
 *     nó thì các ngày ngay sau mốc sẽ thành "chưa có dữ liệu".
 *  4. Ảnh chụp là hồ sơ trạng thái thực tế, KHÔNG có API/giao diện sửa hay xoá. Nhập sai thì sửa sơ đồ hôm nay.
 */

export const OIL_GUN_SNAPSHOT_RETENTION_YEARS = 3;

type SnapshotState = {
  guns: OilGun[];
  note: string;
  noteUpdatedBy: string | null;
  noteUpdatedAt: Date | null;
};

export function vietnamDate(at = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function isSnapshotDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Dấu vân tay TRẠNG THÁI (bỏ qua người sửa / giờ sửa): hai bản cùng dấu = không có gì thay đổi. */
export function snapshotSignature(state: { guns: Array<Pick<OilGun, "code" | "status" | "defectSccn" | "defectScd" | "forceFlame" | "coalStatus" | "coalDefectNote">>; note: string }) {
  const text = (v: string | null | undefined) => (v ?? "").trim();
  const guns = [...state.guns]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(g => [g.code, g.status, text(g.defectSccn), text(g.defectScd), g.forceFlame ? 1 : 0, g.coalStatus, text(g.coalDefectNote)]);
  return JSON.stringify({ guns, note: state.note.trim() });
}

/** "YYYY-MM-DD" lùi `years` năm (29/02 → 28/02). */
function yearsBefore(date: string, years: number) {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y - years, m - 1, d));
  if (target.getUTCMonth() !== m - 1) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

/**
 * Lưu trạng thái `state` làm bản của ngày `date` — dùng chung cho app và script nạp từ bản sao lưu.
 * Trùng bản gần nhất trước đó → không lưu (và bỏ bản đã có của ngày đó, vì nó không còn mang thông tin mới).
 * Trả về "saved" | "unchanged".
 */
export async function saveOilGunSnapshot(machine: string, date: string, state: SnapshotState, capturedAt = new Date()) {
  const previous = await prisma.oilGunSnapshot.findFirst({ where: { machine, date: { lt: date } }, orderBy: { date: "desc" } });
  const unchanged = previous && snapshotSignature({ guns: previous.guns as unknown as OilGun[], note: previous.note }) === snapshotSignature(state);
  if (unchanged) {
    await prisma.oilGunSnapshot.deleteMany({ where: { machine, date } });
    return "unchanged" as const;
  }
  const data = {
    guns: state.guns as unknown as Prisma.InputJsonValue,
    note: state.note,
    noteUpdatedBy: state.noteUpdatedBy,
    noteUpdatedAt: state.noteUpdatedAt,
    capturedAt,
  };
  await prisma.oilGunSnapshot.upsert({ where: { machine_date: { machine, date } }, create: { machine, date, ...data }, update: data });
  return "saved" as const;
}

/** Xoá bản cũ hơn 3 năm, giữ lại một bản neo (bản mới nhất trước mốc). */
export async function pruneOilGunSnapshots(machine: string, today = vietnamDate()) {
  const cutoff = yearsBefore(today, OIL_GUN_SNAPSHOT_RETENTION_YEARS);
  const anchor = await prisma.oilGunSnapshot.findFirst({ where: { machine, date: { lt: cutoff } }, orderBy: { date: "desc" }, select: { id: true } });
  if (!anchor) return 0;
  const { count } = await prisma.oilGunSnapshot.deleteMany({ where: { machine, date: { lt: cutoff }, id: { not: anchor.id } } });
  return count;
}

async function currentState(machine: string): Promise<SnapshotState> {
  const [guns, note] = await Promise.all([
    prisma.oilGun.findMany({ where: { machine }, orderBy: { position: "asc" } }),
    prisma.oilGunNote.findUnique({ where: { machine } }),
  ]);
  return { guns, note: note?.note ?? "", noteUpdatedBy: note?.updatedBy ?? null, noteUpdatedAt: note?.updatedAt ?? null };
}

/** Chụp trạng thái hiện tại vào bản của hôm nay. Lỗi không làm hỏng thao tác sửa. */
export async function captureOilGunSnapshot(machine: string) {
  try {
    const state = await currentState(machine);
    if (!state.guns.length) return;
    const today = vietnamDate();
    await saveOilGunSnapshot(machine, today, state);
    checkedToday.set(machine, today);
    await pruneOilGunSnapshots(machine, today);
  } catch (error) {
    console.error("[oil-gun-snapshot] Không chụp được sơ đồ vòi đốt", machine, error);
  }
}

/** Đã kiểm tra trong ngày (theo tiến trình) — lần xem sau không phải so lại. */
const checkedToday = new Map<string, string>();

/** Lần xem đầu tiên trong ngày: chụp nếu trạng thái khác bản gần nhất (ngày không đổi gì thì không sinh dòng). */
export async function ensureTodaySnapshot(machine: string) {
  const today = vietnamDate();
  if (checkedToday.get(machine) === today) return;
  const exists = await prisma.oilGunSnapshot.findUnique({ where: { machine_date: { machine, date: today } }, select: { id: true } }).catch(() => null);
  if (!exists) await captureOilGunSnapshot(machine);
  else checkedToday.set(machine, today);
}

/** Bản dùng để hiển thị ngày `date`: bản gần nhất có date <= ngày đó; null nếu trước ngày bắt đầu chụp. */
export async function findOilGunSnapshot(machine: string, date: string) {
  const snapshot = await prisma.oilGunSnapshot.findFirst({ where: { machine, date: { lte: date } }, orderBy: { date: "desc" } });
  if (!snapshot) return null;
  return { ...snapshot, guns: snapshot.guns as unknown as OilGun[] };
}

/** Ngày sớm nhất có ảnh chụp (để ô chọn ngày biết giới hạn). */
export async function firstOilGunSnapshotDate(machine?: string) {
  const first = await prisma.oilGunSnapshot.findFirst({ where: machine ? { machine } : {}, orderBy: { date: "asc" }, select: { date: true } });
  return first?.date ?? null;
}
