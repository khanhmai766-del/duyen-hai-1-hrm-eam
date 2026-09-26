"use client";

import { useMemo, useState } from "react";
import { LogIn, LogOut, ScanLine, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PermitCardScanner, type ScanOutcome } from "@/components/work-permits/card-scanner";
import { usePermitAttendance, type PermitAttendanceResult } from "@/hooks/useWorkPermits";
import { attendanceInside, attendanceTracked } from "@/lib/work-permit-attendance";
import { normalizeText } from "@/lib/nav";
import type { PermitDetailRow, PermitMember, PermitSession } from "@/lib/work-permits";

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
/** Giờ gọn cho điện thoại: chỉ HH:mm nếu trong hôm nay, khác ngày thì kèm ngày/tháng. */
const shortTime = (iso: string) => new Date(iso).toDateString() === new Date().toDateString() ? hhmm(iso) : dayHhmm(iso);
const dayHhmm = (iso: string) => new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

function outcomeOf(result: PermitAttendanceResult): ScanOutcome {
  const count = `trong khu vực ${result.inside}/${result.total} người`;
  switch (result.outcome) {
    case "ADDED": return { tone: "ok", detail: `Đúng đơn vị — VÀO lúc ${hhmm(result.at)} · ${count}.`, added: true };
    case "IN": return { tone: "ok", detail: `VÀO lại lúc ${hhmm(result.at)} · ${count}.`, added: true };
    case "OUT": return { tone: "ok", detail: `RA lúc ${hhmm(result.at)} · còn ${count}.`, out: true };
    case "ALREADY_IN": return { tone: "info", detail: `Đang ở trong khu vực (vào lúc ${hhmm(result.at)}).` };
    case "TOO_SOON": return { tone: "info", detail: `Vừa vào lúc ${hhmm(result.at)} — chưa đủ 1 phút nên KHÔNG ghi ra. Người này rời vị trí thật thì quét lại sau.` };
  }
}

/**
 * Vào / ra vị trí làm việc của một lần làm việc nhà thầu. Đang mở: bộ đếm "trong khu vực", nút quét thẻ
 * (quét người đang trong → RA, đã ra → VÀO lại, người mới đúng đơn vị → cho vào) và nút tay cho người
 * không mang thẻ. Đã kết thúc: chỉ xem giờ vào/ra.
 */
export function SessionAttendance({ permit, session, canExecute, size = "md", autoScan = false }: { permit: PermitDetailRow; session: PermitSession; canExecute: boolean; size?: "md" | "lg"; autoScan?: boolean }) {
  // `autoScan`: mở từ nút "Quét" trên bảng Đang làm việc → bật máy quét ngay.
  const [scanning, setScanning] = useState(autoScan && canExecute && !session.endedAt);
  const [filter, setFilter] = useState<"inside" | "out" | "waiting" | null>(null);
  const [query, setQuery] = useState("");
  const attendance = usePermitAttendance(permit.id);
  const live = !session.endedAt;
  const members = useMemo(() => session.members.map((member, index) => ({ member, index }))
    .filter(({ member }) => member.personId ? member.personId !== session.commanderId : member.code !== session.commanderCode), [session]);
  const tracked = members.some(({ member }) => attendanceTracked(member));
  const insideCount = members.filter(({ member }) => attendanceInside(member)).length;
  const commander: PermitMember = { personId: session.commanderId, code: session.commanderCode, name: session.commanderName, company: session.company };

  async function record(body: { direction: "auto" | "in" | "out"; personId?: string; index?: number; name?: string }) {
    return outcomeOf(await attendance.mutateAsync({ sessionId: session.id, ...body }));
  }
  async function manual(member: PermitMember, index: number, direction: "in" | "out") {
    try {
      const result = await record(member.personId ? { direction, personId: member.personId } : { direction, index, name: member.name });
      toast.success(`${member.name}: ${result.detail}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không ghi nhận được"); }
  }

  if (!live && !tracked) return null;
  const large = size === "lg";
  const scanner = scanning && <PermitCardScanner title="Quét vào / ra vị trí làm việc" unit={permit.teamName} companies={[permit.teamName, session.company].filter(Boolean)} permitId={permit.id}
    existing={[...members.map(({ member }) => member), commander]}
    onAdd={member => record({ direction: "in", personId: member.personId })}
    onExisting={async person => person.id === session.commanderId
      ? { tone: "info", detail: "CHTT của lần làm việc — có mặt suốt lần làm việc, không cần quét." }
      : record({ direction: "auto", personId: person.id })}
    onClose={() => setScanning(false)} />;
  const rows = members.map(({ member, index }) => {
    const inside = attendanceInside(member);
    const visits = member.attendance ?? [];
    return <div key={member.personId ?? `${index}-${member.name}`} className={`flex flex-wrap items-center gap-2 rounded-md border border-border/70 ${large ? "px-3 py-2.5" : "px-2.5 py-1.5 text-sm"}`}>
      <span className={`${large ? "h-3 w-3" : "h-2 w-2"} shrink-0 rounded-full ${inside ? "bg-emerald-500" : visits.length ? "bg-slate-300" : "bg-amber-400"}`} aria-hidden />
      <span className="min-w-0 flex-1"><b>{member.name}</b>{member.code ? <span className="text-muted-foreground"> · {member.code}</span> : null}
        <span className="block text-xs text-muted-foreground">{visits.length ? visits.map(v => `Vào ${dayHhmm(v.in)}${v.out ? ` → Ra ${dayHhmm(v.out)}` : " → đang trong"}`).join(" · ") : "Chưa ghi vào/ra"}</span>
      </span>
      {live && canExecute && (inside
        ? <Button type="button" size="sm" variant="outline" className={large ? "h-9 px-3" : "h-7 px-2 text-xs"} disabled={attendance.isPending} onClick={() => void manual(member, index, "out")}><LogOut size={14} />Ra</Button>
        : <Button type="button" size="sm" variant="outline" className={large ? "h-9 px-3" : "h-7 px-2 text-xs"} disabled={attendance.isPending} onClick={() => void manual(member, index, "in")}><LogIn size={14} />{visits.length ? "Vào lại" : "Vào"}</Button>)}
    </div>;
  });

  // Màn hình làm việc (điện thoại là chính): ba ô đếm lớn đồng thời là bộ lọc, ô tìm khi đông người, nút quét
  // dính đáy màn hình (trên thanh điều hướng) để ngón cái bấm được khi đang cuộn danh sách 100–200 người.
  if (large) {
    const state = (member: PermitMember) => attendanceInside(member) ? "inside" : (member.attendance ?? []).length ? "out" : "waiting";
    const counts = { inside: insideCount, out: 0, waiting: 0 };
    for (const { member } of members) { const key = state(member); if (key !== "inside") counts[key] += 1; }
    const term = normalizeText(query.trim());
    const shown = members.filter(({ member }) => (!filter || state(member) === filter) && (!term || normalizeText(`${member.name} ${member.code ?? ""}`).includes(term)));
    const tiles = [
      { key: "inside" as const, value: live ? 1 + counts.inside : counts.inside, label: live ? "Trong khu vực (kèm CHTT)" : "Trong khu vực", tone: "text-emerald-700", ring: "ring-emerald-500" },
      { key: "out" as const, value: counts.out, label: "Đã ra", tone: "text-slate-600 dark:text-slate-300", ring: "ring-slate-400" },
      { key: "waiting" as const, value: counts.waiting, label: "Chưa quét", tone: "text-amber-600", ring: "ring-amber-500" },
    ];
    return <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Lọc theo trạng thái vào/ra">
        {tiles.map(tile => <button key={tile.key} type="button" aria-pressed={filter === tile.key} onClick={() => setFilter(filter === tile.key ? null : tile.key)}
          className={`rounded-xl border border-border bg-background px-1 py-2.5 text-center transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${filter === tile.key ? `ring-2 ${tile.ring}` : ""}`}>
          <span className={`block text-3xl font-bold tabular-nums leading-9 sm:text-4xl ${tile.tone}`}>{tile.value}</span>
          <span className="block text-[11px] font-medium leading-4 text-muted-foreground sm:text-xs">{tile.label}</span>
        </button>)}
      </div>
      {members.length > 8 && <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" /><input type="search" aria-label="Tìm nhân viên" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-base focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm" placeholder="Tìm tên hoặc mã thẻ…" value={query} onChange={e => setQuery(e.target.value)} /></div>}
      {filter && <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>Đang lọc: <b className="text-foreground">{tiles.find(t => t.key === filter)?.label}</b></span><button type="button" className="font-semibold text-blue-700" onClick={() => setFilter(null)}>Bỏ lọc</button></p>}
      {members.length === 0 ? <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">Chưa có nhân viên bổ sung — quét thẻ người đúng đơn vị để cho vào.</p>
        : shown.length ? <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">{shown.map(({ member, index }) => {
          const inside = attendanceInside(member);
          const visits = member.attendance ?? [];
          const last = visits[visits.length - 1];
          return <div key={member.personId ?? `${index}-${member.name}`} className="flex items-center gap-3 bg-background px-3 py-2.5">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${inside ? "bg-emerald-500" : visits.length ? "bg-slate-300" : "bg-amber-400"}`} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold leading-5">{member.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{member.code || "—"}{last ? ` · ${inside ? `Vào ${shortTime(last.in)}` : `Ra ${shortTime(last.out ?? last.in)}`}${visits.length > 1 ? ` · ${visits.length} lượt` : ""}` : " · Chưa quét"}</span>
            </span>
            {live && canExecute && <Button type="button" variant="outline" className="h-10 min-w-[4.5rem] shrink-0 px-3" disabled={attendance.isPending} onClick={() => void manual(member, index, inside ? "out" : "in")}>{inside ? <><LogOut size={16} />Ra</> : <><LogIn size={16} />{visits.length ? "Vào lại" : "Vào"}</>}</Button>}
          </div>;
        })}</div> : <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">Không có người phù hợp.</p>}
      {/* Máy tính (lg) không có thanh điều hướng đáy và màn hình đủ cao: nút nằm yên bên phải, không dính đáy. */}
      {live && canExecute && <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 lg:static lg:flex lg:justify-end">
        <Button type="button" className="h-14 w-full text-base shadow-lg lg:h-11 lg:w-auto lg:px-8 lg:shadow-sm" onClick={() => setScanning(true)}><ScanLine className="!h-6 !w-6" />Quét vào / ra</Button>
      </div>}
      {scanner}
    </div>;
  }
  return <div className="space-y-2 rounded-lg border border-border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-semibold">
        {live ? <>Trong khu vực: <span className="text-emerald-700">{1 + insideCount}</span>/{1 + members.length} người</> : "Vào / ra vị trí làm việc"}
        <span className="ml-1 text-xs font-normal text-muted-foreground">(kèm CHTT)</span>
      </p>
      {live && canExecute && <Button type="button" size="sm" onClick={() => setScanning(true)}><ScanLine />Quét vào / ra</Button>}
    </div>
    {members.length > 0 && <div className="max-h-72 space-y-1 overflow-y-auto">{rows}</div>}
    {scanner}
  </div>;
}
