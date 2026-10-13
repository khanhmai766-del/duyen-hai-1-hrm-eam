import { formatPermitNumber, isSessionCommander, type PermitMember } from "@/lib/work-permits";
import { samePermitWorker } from "@/lib/work-permit-presence";
import { overhaulItemKey, overhaulItemProgressOf, type OverhaulItemSnapshot } from "@/lib/work-permit-overhaul";
import { escapeTelegramHtml } from "@/lib/telegram";
import { formatVietnamDateTime } from "@/lib/vietnam-time";

export const OVERHAUL_OPEN_DELAY_MS = 30 * 60_000;
export type ProgressBaseline = Pick<OverhaulItemSnapshot, "code" | "source" | "sheet"> & { percent: number };
export type TelegramPermit = { id: string; number: string; year: number; content: string; teamName: string; teamType: string; contractorScope: string | null; position: string | null; companyCode?: string };
export type TelegramSession = {
  id: string; commanderId: string | null; commanderCode: string; commanderName: string; company: string;
  members: unknown; openedAt: Date; endedAt: Date | null; itemProgress: unknown; endNote: string;
};

const text = (value: unknown, max = 600) => {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  return escapeTelegramHtml(raw.length > max ? `${raw.slice(0, max - 1)}…` : raw || "—");
};
const contractorLabel = (name: string, code?: string) => `${text(name, 200)}${code?.trim() ? ` (${text(code, 80)})` : ""}`;
export const overhaulTelegramEligible = (permit: Pick<TelegramPermit, "teamType" | "contractorScope">) =>
  permit.teamType === "CONTRACTOR" && permit.contractorScope === "OVERHAUL";
export const openingDueAt = (openedAt: Date) => new Date(openedAt.getTime() + OVERHAUL_OPEN_DELAY_MS);
export function endedBeforeOpeningDue(session: Pick<TelegramSession, "openedAt" | "endedAt">) {
  const elapsed = session.endedAt ? session.endedAt.getTime() - session.openedAt.getTime() : -1;
  return elapsed >= 0 && elapsed < OVERHAUL_OPEN_DELAY_MS;
}

/** Mỗi dòng HTML của bản tin là độc lập; chỉ chia tại xuống dòng để không cắt thẻ/entity giữa chừng. */
export function splitOverhaulTelegramMessage(message: string) {
  const chunks: string[] = [];
  let chunk = "";
  for (const line of message.trim().split("\n")) {
    if (line.length > 3800) throw new Error("Một dòng báo cáo PCT quá dài để gửi Telegram");
    if (chunk && chunk.length + line.length + 1 > 3800) { chunks.push(chunk.trim()); chunk = ""; }
    chunk += `${chunk ? "\n" : ""}${line}`;
  }
  if (chunk.trim()) chunks.push(chunk.trim());
  return chunks;
}

/** Người từng vào trong toàn bộ lần làm việc, không lấy số còn trong khu vực lúc kết thúc. */
export function sessionTelegramWorkerCount(session: TelegramSession, now = new Date()) {
  const members = Array.isArray(session.members) ? session.members : [];
  const end = Math.min(session.endedAt?.getTime() ?? now.getTime(), now.getTime());
  const found: PermitMember[] = [];
  for (const value of members) {
    if (!value || typeof value !== "object" || typeof value.name !== "string" || typeof value.company !== "string") continue;
    const member = value as PermitMember;
    if (isSessionCommander(member, session)) continue;
    const worked = member.attendance == null || (Array.isArray(member.attendance) && member.attendance.some(visit => {
      if (!visit) return false;
      const from = Math.max(new Date(visit.in).getTime(), session.openedAt.getTime());
      const to = Math.min(visit.out ? new Date(visit.out).getTime() : end, end);
      return from < end && to > from;
    }));
    if (worked && !found.some(other => samePermitWorker(member, other))) found.push(member);
  }
  return found.length;
}

export function changedTelegramProgress(session: TelegramSession, baseline: ProgressBaseline[]) {
  const previous = new Map(baseline.map(item => [overhaulItemKey(item), item.percent]));
  return overhaulItemProgressOf(session.itemProgress).flatMap(item => {
    if (!item.done || item.percent == null) return [];
    const before = previous.get(overhaulItemKey(item));
    if (before === item.percent && !item.note.trim()) return [];
    return [{ ...item, before }];
  });
}

export function buildOverhaulSessionMessage(permit: TelegramPermit, session: TelegramSession, kind: "OPEN" | "END" | "COMBINED", baseline: ProgressBaseline[], now = new Date()) {
  const title = kind === "OPEN" ? "MỞ NGÀY ĐẠI TU" : kind === "END" ? "KẾT THÚC NGÀY ĐẠI TU" : "MỞ VÀ KẾT THÚC NGÀY ĐẠI TU";
  const lines = [
    `🔧 <b>${title}</b>`,
    // Chỉ số hiệu của sổ PCT, không thay bằng số NKVH và không đưa tổ máy vào bản tin.
    `Số PCT: <b>${text(formatPermitNumber({ number: permit.number, year: permit.year }), 120)}</b>`,
    `Nhà thầu: ${contractorLabel(session.company || permit.teamName, permit.companyCode)}`,
    `Cương vị cho phép: ${text(permit.position, 200)}`,
    `Nội dung: ${text(permit.content)}`,
    `CHTT: ${text(session.commanderName, 200)}`,
    `Số nhân viên công tác: <b>${sessionTelegramWorkerCount(session, now)}</b> (không gồm CHTT)`,
    `Cho phép: ${formatVietnamDateTime(session.openedAt)}`,
  ];
  if (kind !== "OPEN") {
    if (session.endedAt) lines.push(`Kết thúc: ${formatVietnamDateTime(session.endedAt)}`);
    const changes = changedTelegramProgress(session, baseline);
    lines.push("", "<b>Tiến độ hạng mục thay đổi</b>");
    if (!changes.length) lines.push("Không có hạng mục thay đổi tiến độ hoặc ghi chú.");
    for (const item of changes) {
      lines.push(`• ${text(item.code, 60)} (${text(item.sheet, 120)}): ${item.before === undefined ? "Chưa ghi" : `${item.before}%`} → <b>${item.percent}%</b>${item.note.trim() ? `\n  Ghi chú: ${text(item.note)}` : ""}`);
    }
    if (session.endNote.trim()) lines.push("", `Ghi chú công việc: ${text(session.endNote)}`);
  }
  const url = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://duyenhai1.vn").replace(/\/$/, "");
  lines.push("", `<a href="${escapeTelegramHtml(`${url}/work-permits/${encodeURIComponent(permit.id)}/lam-viec?from=live`)}">Xem phiếu</a>`);
  return lines.join("\n");
}

export type DailyOverhaulContractor = { company: string; companyCode?: string; totalPersonnel: number; worked: number; permitNumbers: string[] };
export function buildOverhaulHandoffMessage(permit: TelegramPermit, previous: TelegramSession, next: TelegramSession, note: string, now = new Date()) {
  const lines = [
    "🔄 <b>BÀN GIAO CHTT ĐẠI TU</b>",
    `Số PCT: <b>${text(formatPermitNumber(permit), 120)}</b>`,
    `Nhà thầu: ${contractorLabel(next.company || permit.teamName, permit.companyCode)}`,
    `Cương vị cho phép: ${text(permit.position, 200)}`,
    `Nội dung: ${text(permit.content)}`,
    `CHTT bàn giao: ${text(previous.commanderName, 200)}`,
    `CHTT nhận bàn giao: ${text(next.commanderName, 200)}`,
    `Thời điểm bàn giao: ${formatVietnamDateTime(next.openedAt)}`,
    `Số nhân viên công tác: <b>${sessionTelegramWorkerCount(next, now)}</b> (không gồm CHTT)`,
    "Trạng thái: PCT tiếp tục làm việc.",
  ];
  if (note.trim()) lines.push(`Ghi chú bàn giao: ${text(note)}`);
  const url = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://duyenhai1.vn").replace(/\/$/, "");
  lines.push("", `<a href="${escapeTelegramHtml(`${url}/work-permits/${encodeURIComponent(permit.id)}/lam-viec?from=live`)}">Xem phiếu</a>`);
  return lines.join("\n");
}

export function buildOverhaulDailyMessage(day: string, rows: DailyOverhaulContractor[]) {
  const lines = ["📋 <b>NHÂN SỰ ĐẠI TU TRONG NGÀY</b>", `Ngày: ${day.split("-").reverse().join("/")} (giờ Việt Nam)`];
  for (const [index, row] of rows.filter(row => row.worked > 0).entries()) {
    lines.push("", `${index + 1}. <b>${contractorLabel(row.company, row.companyCode)}</b>`,
      `Tổng nhân sự đại tu: <b>${row.totalPersonnel}</b>`, `Làm việc trong ngày: <b>${row.worked}</b>`, "Số PCT thực hiện:");
    for (const number of [...new Set(row.permitNumbers)]) lines.push(`• ${text(number, 120)}`);
  }
  return lines.join("\n");
}
