"use client";

import { useMemo, useState } from "react";
import { LogIn, LogOut, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PermitCardScanner, type ScanOutcome } from "@/components/work-permits/card-scanner";
import { usePermitAttendance, type PermitAttendanceResult } from "@/hooks/useWorkPermits";
import { attendanceInside, attendanceTracked } from "@/lib/work-permit-attendance";
import type { PermitDetailRow, PermitMember, PermitSession } from "@/lib/work-permits";

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
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
export function SessionAttendance({ permit, session, canExecute }: { permit: PermitDetailRow; session: PermitSession; canExecute: boolean }) {
  const [scanning, setScanning] = useState(false);
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
  return <div className="space-y-2 rounded-lg border border-border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-semibold">
        {live ? <>Trong khu vực: <span className="text-emerald-700">{1 + insideCount}</span>/{1 + members.length} người</> : "Vào / ra vị trí làm việc"}
        <span className="ml-1 text-xs font-normal text-muted-foreground">(kèm CHTT)</span>
      </p>
      {live && canExecute && <Button type="button" size="sm" onClick={() => setScanning(true)}><ScanLine />Quét vào / ra</Button>}
    </div>
    {members.length > 0 && <div className="max-h-72 space-y-1 overflow-y-auto">
      {members.map(({ member, index }) => {
        const inside = attendanceInside(member);
        const visits = member.attendance ?? [];
        return <div key={member.personId ?? `${index}-${member.name}`} className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 px-2.5 py-1.5 text-sm">
          <span className={`h-2 w-2 shrink-0 rounded-full ${inside ? "bg-emerald-500" : visits.length ? "bg-slate-300" : "bg-amber-400"}`} aria-hidden />
          <span className="min-w-0 flex-1"><b>{member.name}</b>{member.code ? <span className="text-muted-foreground"> · {member.code}</span> : null}
            <span className="block text-xs text-muted-foreground">{visits.length ? visits.map(v => `Vào ${dayHhmm(v.in)}${v.out ? ` → Ra ${dayHhmm(v.out)}` : " → đang trong"}`).join(" · ") : "Chưa ghi vào/ra"}</span>
          </span>
          {live && canExecute && (inside
            ? <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={attendance.isPending} onClick={() => void manual(member, index, "out")}><LogOut size={14} />Ra</Button>
            : <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={attendance.isPending} onClick={() => void manual(member, index, "in")}><LogIn size={14} />{visits.length ? "Vào lại" : "Vào"}</Button>)}
        </div>;
      })}
    </div>}
    {scanning && <PermitCardScanner title="Quét vào / ra vị trí làm việc" unit={permit.teamName} companies={[permit.teamName, session.company].filter(Boolean)} permitId={permit.id}
      existing={[...members.map(({ member }) => member), commander]}
      onAdd={member => record({ direction: "in", personId: member.personId })}
      onExisting={async person => person.id === session.commanderId
        ? { tone: "info", detail: "CHTT của lần làm việc — có mặt suốt lần làm việc, không cần quét." }
        : record({ direction: "auto", personId: person.id })}
      onClose={() => setScanning(false)} />}
  </div>;
}
