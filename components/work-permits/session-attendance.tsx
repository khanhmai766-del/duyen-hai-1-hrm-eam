"use client";

import { PersonViolationTag, RecordPersonViolation } from "@/components/work-permits/person-violations";
import { useId, useMemo, useState } from "react";
import { LogIn, LogOut, ScanLine, Search, Trash2, Users } from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PermitCardScanner, type ScanOutcome } from "@/components/work-permits/card-scanner";
import { PermitPeopleDirectory } from "@/components/work-permits/contractor-work";
import { PersonPhoto } from "@/components/work-permits/person-photo";
import { usePermitSessionViolations, usePermitAttendance, useRemoveSessionMember, usePermitPartnerCompanies, type PermitAttendanceResult } from "@/hooks/useWorkPermits";
import { useAdminMode } from "@/hooks/useAdminMode";
import { attendanceInside, attendanceTracked } from "@/lib/work-permit-attendance";
import { normalizeText } from "@/lib/nav";
import { isOverhaulPaperPermit } from "@/lib/work-permit-overhaul";
import { formatPermitNumber, isSessionCommander, type PermitDetailRow, type PermitMember, type PermitPerson, type PermitSession } from "@/lib/work-permits";

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
    case "TOO_SOON_AFTER_OUT": return { tone: "info", detail: `Vừa ra lúc ${hhmm(result.at)} — chưa đủ 1 phút nên không ghi vào lại. Nếu cần vào lại ngay, người cho phép dùng nút “Vào lại”.` };
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
  // "Chọn từ danh sách" khi lần làm việc đang mở: người không mang thẻ / không quét được vẫn cho vào được.
  const [picking, setPicking] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);
  const [previousQuery, setPreviousQuery] = useState("");
  const [previousId, setPreviousId] = useState<string | null>(null);
  const previousGroupId = useId();
  const [admitting, setAdmitting] = useState(false);
  const [filter, setFilter] = useState<"inside" | "out" | "waiting" | null>(null);
  const [query, setQuery] = useState("");
  const attendance = usePermitAttendance(permit.id);
  const removeMember = useRemoveSessionMember(permit.id);
  // Quản trị (đang bật chế độ quản trị) gỡ hẳn người đã ra / chưa vào — máy chủ kiểm lại vai trò.
  const { data: authSession } = useSession();
  const [adminMode] = useAdminMode();
  const canRemove = authSession?.user?.role === "ADMIN" && adminMode;
  const live = !session.endedAt;
  const members = useMemo(() => session.members.map((member, index) => ({ member, index }))
    .filter(({ member }) => !isSessionCommander(member, session)), [session]);
  const tracked = members.some(({ member }) => attendanceTracked(member));
  const memberIds = useMemo(() => members.flatMap(({ member }) => member.personId ? [member.personId] : []), [members]);
  const violations = usePermitSessionViolations(permit.id, session.id, (live || tracked) && memberIds.length > 0, { memberIds, live });
  const violationsById = useMemo(() => new Map((violations.data?.data ?? []).map(person => [person.id, person])), [violations.data]);
  const violationLoadError = violations.isError && <p role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Chưa tải được ảnh và thông tin vi phạm của nhân viên.<Button type="button" variant="ghost" size="sm" onClick={() => void violations.refetch()}>Thử lại</Button></p>;
  const memberPhoto = (member: PermitMember) => <PersonPhoto person={{ name: member.name, photoUrl: member.personId ? violationsById.get(member.personId)?.photoUrl : null }} className="h-12 w-9 shrink-0 rounded-md border border-border/60" />;
  const memberViolations = (member: PermitMember) => {
    const person = member.personId ? violationsById.get(member.personId) : undefined;
    return person ? <PersonViolationTag violations={person.violations} compact /> : null;
  };
  const insideCount = members.filter(({ member }) => attendanceInside(member)).length;
  const commander: PermitMember = { personId: session.commanderId ?? undefined, code: session.commanderCode, name: session.commanderName, company: session.company };
  // Đơn vị được quét vào: đơn vị trên phiếu + đơn vị CHTT, kèm đơn vị cùng liên danh (EPS + S3A…).
  const scanCompanies = usePermitPartnerCompanies([permit.teamName, session.company]);
  const previousSessions = live && canExecute && isOverhaulPaperPermit(permit)
    ? (permit.previousWorkSessions ?? (permit.previousWorkSession ? [permit.previousWorkSession] : [])).slice(0, 3) : [];
  const previousSession = previousSessions.find(previous => previous.id === previousId) ?? previousSessions[0];
  const previousMembers = previousSession?.members.filter(member => !isSessionCommander(member, previousSession)) ?? [];
  const matchesMember = (left: PermitMember, right: PermitMember) => Boolean(left.personId && right.personId && left.personId === right.personId)
    || Boolean(left.code.trim() && left.code.normalize("NFC").trim().toUpperCase() === right.code.normalize("NFC").trim().toUpperCase());

  async function record(body: { direction: "auto" | "in" | "out"; personId?: string; index?: number; name?: string }) {
    return outcomeOf(await attendance.mutateAsync({ sessionId: session.id, ...body }));
  }
  async function manual(member: PermitMember, index: number, direction: "in" | "out") {
    try {
      const result = await record(member.personId ? { direction, personId: member.personId } : { direction, index, name: member.name });
      toast.success(`${member.name}: ${result.detail}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không ghi nhận được"); }
  }

  async function remove(member: PermitMember, index: number) {
    const visits = member.attendance?.length ?? 0;
    if (!window.confirm(`Gỡ ${member.name}${member.code ? ` (${member.code})` : ""} khỏi lần làm việc này?\n\nXoá luôn ${visits} lượt vào/ra của người này và bỏ khỏi danh sách nhân viên trên phiếu — phiếu không còn vết. Chỉ dùng cho người đã rút ra, quét nhầm hoặc hồ sơ trùng.`)) return;
    try {
      await removeMember.mutateAsync(member.personId ? { sessionId: session.id, personId: member.personId } : { sessionId: session.id, index, name: member.name });
      toast.success(`Đã gỡ ${member.name} khỏi lần làm việc`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không gỡ được"); }
  }

  /** Cho vào lần lượt từng người đã chọn — máy chủ kiểm như quét thẻ (đúng đơn vị, đúng nhóm, không đang ở PCT khác). */
  async function admitPicked(people: PermitPerson[]) {
    setPicking(false); setAdmitting(true);
    const failed: string[] = [];
    let added = 0;
    for (const person of people) {
      try { if ((await record({ direction: "in", personId: person.id })).added) added++; }
      catch (error) { failed.push(`${person.name}: ${error instanceof Error ? error.message : "không ghi nhận được"}`); }
    }
    setAdmitting(false);
    if (added) toast.success(`Đã cho vào ${added} người`);
    if (failed.length) toast.error(`Không cho vào ${failed.length} người`, { description: failed.join(" · "), duration: 12000 });
  }

  if (!live && !tracked) return null;
  const large = size === "lg";
  const scanner = scanning && <PermitCardScanner title="Quét vào / ra vị trí làm việc" unit={permit.teamName} companies={scanCompanies} scope={permit.contractorScope} permitId={permit.id}
    existing={[...members.map(({ member }) => member), commander]}
    onAdd={member => record({ direction: "in", personId: member.personId })}
    onExisting={async person => person.id === session.commanderId
      ? { tone: "info", detail: "CHTT của lần làm việc — có mặt suốt lần làm việc, không cần quét." }
      : record({ direction: "auto", personId: person.id })}
    onClose={() => setScanning(false)} />;
  const picker = picking && <PermitPeopleDirectory onClose={() => setPicking(false)} onPickMany={people => void admitPicked(people)}
    existingMembers={[...members.map(({ member }) => member), commander]} company={permit.teamName || undefined} scope={permit.contractorScope} />;
  const pickButton = (className: string) => <Button type="button" variant="outline" className={className} disabled={admitting} onClick={() => setPicking(true)}><Users />{admitting ? "Đang cho vào…" : "Chọn từ danh sách"}</Button>;
  const previousButton = previousSession && <Button type="button" variant="outline" className="h-auto min-h-10 w-full whitespace-normal px-3 py-2 text-sm sm:w-auto" onClick={() => { setPreviousId(previousSessions[0].id); setPreviousQuery(""); setShowPrevious(true); }}><Users className="shrink-0" />Danh sách các lần làm việc trước</Button>;
  const previousDialog = showPrevious && previousSession && <Dialog open onOpenChange={setShowPrevious}><DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col gap-3 overflow-hidden p-4 sm:p-6">
    <DialogTitle className="shrink-0 pr-7">Danh sách các lần làm việc trước</DialogTitle>
    <DialogDescription className="shrink-0">Chọn lượt công tác để xem nhân viên. Bấm Cho vào để ghi nhận từng người trong lần làm việc đang mở.</DialogDescription>
    <div role="radiogroup" aria-label="Chọn lần làm việc trước" className="shrink-0 space-y-2">
      {previousSessions.map((previous, index) => {
        const selected = previous.id === previousSession.id;
        const count = previous.members.filter(member => !isSessionCommander(member, previous)).length;
        return <label key={previous.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-sm ${selected ? "border-blue-500 bg-blue-50/60" : "border-border bg-background"}`}>
          <input type="radio" name={previousGroupId} value={previous.id} checked={selected} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" onChange={() => { setPreviousId(previous.id); setPreviousQuery(""); }} />
          <span className="min-w-0 space-y-0.5">
            <span className="block break-words text-xs font-semibold sm:text-sm">Lượt {index + 1} · {dayHhmm(previous.openedAt)} → {previous.endedAt ? dayHhmm(previous.endedAt) : "—"}</span>
            <span className="block break-words text-xs text-muted-foreground">CHTT {previous.commanderName} · {count} nhân viên</span>
          </span>
        </label>;
      })}
    </div>
    <input type="search" aria-label="Tìm trong danh sách lần làm việc đã chọn" className="h-10 w-full shrink-0 rounded-lg border border-input bg-background px-3 text-base sm:text-sm" placeholder="Tìm tên hoặc mã thẻ…" value={previousQuery} onChange={e => setPreviousQuery(e.target.value)} />
    <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain">{previousMembers.filter(member => normalizeText(`${member.name} ${member.code}`).includes(normalizeText(previousQuery.trim()))).map((member, index) => {
      const current = members.find(item => matchesMember(item.member, member));
      const isCommander = matchesMember(member, commander);
      const inside = isCommander || Boolean(current && attendanceInside(current.member));
      const unavailable = !member.personId && !current;
      return <div key={`${member.personId || member.code}-${index}`} className="flex items-center gap-3 rounded-lg border border-border p-3">
        <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{member.name}</p><p className="break-words text-xs text-muted-foreground">{[member.code, member.company].filter(Boolean).join(" · ")}</p>{unavailable && <p className="text-xs text-amber-700">Không còn liên kết hồ sơ — quét thẻ hoặc chọn từ danh bạ.</p>}</div>
        <Button type="button" size="sm" className="h-10 shrink-0" aria-label={`${inside ? "Đang trong" : "Cho vào"} ${member.name}`} disabled={inside || unavailable || attendance.isPending || admitting} onClick={() => void manual(current?.member ?? member, current?.index ?? -1, "in")}>{inside ? "Đang trong" : "Cho vào"}</Button>
      </div>;
    })}{!previousMembers.length && <p className="py-4 text-sm text-muted-foreground">Lượt làm việc này không có nhân viên đi cùng.</p>}{previousMembers.length > 0 && !previousMembers.some(member => normalizeText(`${member.name} ${member.code}`).includes(normalizeText(previousQuery.trim()))) && <p className="py-4 text-sm text-muted-foreground">Không tìm thấy nhân viên phù hợp.</p>}</div>
    <div className="flex shrink-0 justify-end"><Button type="button" variant="outline" className="h-10" onClick={() => setShowPrevious(false)}>Đóng</Button></div>
  </DialogContent></Dialog>;
  const violationButton = (member: PermitMember) => live && canExecute && member.personId
    ? <RecordPersonViolation member={member} violations={violationsById.get(member.personId)?.violations} context={{ permitId: permit.id, sessionId: session.id, permitNumber: formatPermitNumber(permit) }} compact />
    : null;
  const rows = !large && members.map(({ member, index }) => {
    const inside = attendanceInside(member);
    const visits = member.attendance ?? [];
    return <div key={member.personId ?? `${index}-${member.name}`} className={`flex flex-wrap items-center gap-2 rounded-md border border-border/70 ${large ? "px-3 py-2.5" : "px-2.5 py-1.5 text-sm"}`}>
      <div className="relative shrink-0">{memberPhoto(member)}<span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${inside ? "bg-emerald-500" : visits.length ? "bg-slate-300" : "bg-amber-400"}`} aria-hidden /></div>
      <div className="min-w-0 flex-1"><b>{member.name}</b>{member.code ? <span className="text-muted-foreground"> · {member.code}</span> : null}
        <span className="block text-xs text-muted-foreground">{visits.length ? visits.map(v => `Vào ${dayHhmm(v.in)}${v.out ? ` → Ra ${dayHhmm(v.out)}` : " → đang trong"}`).join(" · ") : "Chưa ghi vào/ra"}</span>
        {violationButton(member) ?? memberViolations(member)}
      </div>
      {live && canExecute && (inside
        ? <Button type="button" size="sm" variant="outline" className={large ? "h-9 px-3" : "h-7 px-2 text-xs"} disabled={attendance.isPending} onClick={() => void manual(member, index, "out")}><LogOut size={14} />Ra</Button>
        : <Button type="button" size="sm" variant="outline" className={large ? "h-9 px-3" : "h-7 px-2 text-xs"} disabled={attendance.isPending} onClick={() => void manual(member, index, "in")}><LogIn size={14} />{visits.length ? "Vào lại" : "Vào"}</Button>)}
      {canRemove && !inside && <Button type="button" size="sm" variant="outline" className={`${large ? "h-10 w-10" : "h-10 w-10 sm:h-7 sm:w-7"} px-0 text-red-700 hover:text-red-800`} disabled={removeMember.isPending} aria-label={`Gỡ ${member.name} khỏi lần làm việc`} title="Gỡ khỏi lần làm việc (Quản trị) — xoá luôn lượt vào/ra" onClick={() => void remove(member, index)}><Trash2 size={14} /></Button>}
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
      { key: "out" as const, value: counts.out, label: "Đã ra", tone: "text-slate-600", ring: "ring-slate-400" },
      { key: "waiting" as const, value: counts.waiting, label: "Chưa quét", tone: "text-amber-600", ring: "ring-amber-500" },
    ];
    return <div className="space-y-3">
      {previousButton}
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Lọc theo trạng thái vào/ra">
        {tiles.map(tile => <button key={tile.key} type="button" aria-pressed={filter === tile.key} onClick={() => setFilter(filter === tile.key ? null : tile.key)}
          className={`rounded-xl border border-border bg-background px-1 py-2.5 text-center transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${filter === tile.key ? `ring-2 ${tile.ring}` : ""}`}>
          <span className={`block text-3xl font-bold tabular-nums leading-9 sm:text-4xl ${tile.tone}`}>{tile.value}</span>
          <span className="block text-[11px] font-medium leading-4 text-muted-foreground sm:text-xs">{tile.label}</span>
        </button>)}
      </div>
      {members.length > 8 && <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" /><input type="search" aria-label="Tìm nhân viên" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-base focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm" placeholder="Tìm tên hoặc mã thẻ…" value={query} onChange={e => setQuery(e.target.value)} /></div>}
      {filter && <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>Đang lọc: <b className="text-foreground">{tiles.find(t => t.key === filter)?.label}</b></span><button type="button" className="font-semibold text-blue-700" onClick={() => setFilter(null)}>Bỏ lọc</button></p>}
      {violationLoadError}
      {members.length === 0 ? <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">Chưa có nhân viên bổ sung — quét thẻ người đúng đơn vị để cho vào.</p>
        : shown.length ? <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">{shown.map(({ member, index }) => {
          const inside = attendanceInside(member);
          const visits = member.attendance ?? [];
          const last = visits[visits.length - 1];
          return <div key={member.personId ?? `${index}-${member.name}`} className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 bg-background px-3 py-2.5">
            <div className="relative shrink-0">{memberPhoto(member)}<span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-background ${inside ? "bg-emerald-500" : visits.length ? "bg-slate-300" : "bg-amber-400"}`} aria-hidden /></div>
            <div className="min-w-0 flex-1">
              <span className="block break-words text-[15px] font-semibold leading-5">{member.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{member.code || "—"}{last ? ` · ${inside ? `Vào ${shortTime(last.in)}` : `Ra ${shortTime(last.out ?? last.in)}`}${visits.length > 1 ? ` · ${visits.length} lượt` : ""}` : " · Chưa quét"}</span>
              {violationButton(member) ?? memberViolations(member)}
            </div>
            <div className={`flex items-center justify-end gap-2 ${canRemove && !inside ? "col-start-2 col-end-4 sm:col-start-auto sm:col-end-auto" : ""}`}>
              {live && canExecute && <Button type="button" variant="outline" className="h-10 min-w-[4.5rem] shrink-0 px-3" disabled={attendance.isPending} onClick={() => void manual(member, index, inside ? "out" : "in")}>{inside ? <><LogOut size={16} />Ra</> : <><LogIn size={16} />{visits.length ? "Vào lại" : "Vào"}</>}</Button>}
              {canRemove && !inside && <Button type="button" variant="outline" className="h-10 w-10 shrink-0 px-0 text-red-700 hover:text-red-800" disabled={removeMember.isPending} aria-label={`Gỡ ${member.name} khỏi lần làm việc`} title="Gỡ khỏi lần làm việc (Quản trị) — xoá luôn lượt vào/ra" onClick={() => void remove(member, index)}><Trash2 size={16} /></Button>}
            </div>
          </div>;
        })}</div> : <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">Không có người phù hợp.</p>}
      {/* Máy tính (lg) không có thanh điều hướng đáy và màn hình đủ cao: nút nằm yên bên phải, không dính đáy. */}
      {live && canExecute && <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 grid grid-cols-[2fr_3fr] gap-2 lg:static lg:flex lg:justify-end">
        {pickButton("h-14 bg-background px-2 text-sm shadow-lg lg:h-11 lg:px-5 lg:shadow-sm")}
        <Button type="button" className="h-14 w-full flex-col gap-1 px-2 text-sm shadow-lg sm:text-base lg:h-11 lg:w-auto lg:flex-row lg:gap-2 lg:px-8 lg:shadow-sm" onClick={() => setScanning(true)}><ScanLine className="!h-5 !w-5 sm:!h-6 sm:!w-6" />Quét vào / ra</Button>
      </div>}
      {scanner}{picker}{previousDialog}
    </div>;
  }
  return <div className="space-y-2 rounded-lg border border-border p-3">
    {previousButton}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-semibold">
        {live ? <>Trong khu vực: <span className="text-emerald-700">{1 + insideCount}</span>/{1 + members.length} người</> : "Vào / ra vị trí làm việc"}
        <span className="ml-1 text-xs font-normal text-muted-foreground">(kèm CHTT)</span>
      </p>
      {live && canExecute && <div className="flex gap-2">{pickButton("h-9 px-3 text-sm")}<Button type="button" size="sm" onClick={() => setScanning(true)}><ScanLine />Quét vào / ra</Button></div>}
    </div>
    {violationLoadError}
    {members.length > 0 && <div className="max-h-72 space-y-1 overflow-y-auto">{rows}</div>}
    {scanner}{picker}{previousDialog}
  </div>;
}
