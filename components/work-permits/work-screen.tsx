"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChartNoAxesColumnIncreasing, Play, RefreshCw, Square, UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canUpdateOverhaulProgress, ContractorSessions, SessionEditor } from "@/components/work-permits/contractor-work";
import { SessionAttendance } from "@/components/work-permits/session-attendance";
import { usePermitCompanySummary, useWorkPermit } from "@/hooks/useWorkPermits";
import { formatPermitNumber, PERMIT_KINDS, PERMIT_STATUSES, PERMIT_UNITS, permitDeadline, workersStillInside, type PermitSession } from "@/lib/work-permits";
import { PermitDeadlineBadge } from "@/components/work-permits/permit-deadline";
import { OverhaulItemsEditButton } from "@/components/work-permits/overhaul-items-edit";
import { compactOverhaulContent } from "@/lib/work-permit-overhaul";

const fmt = (v: string) => new Date(v).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
function elapsed(from: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 60_000));
  return minutes < 60 ? `${minutes} phút` : `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
}
// Nhiều máy cùng theo dõi một lần làm việc (cổng quét, phòng điều khiển): làm mới định kỳ.
const LIVE_REFRESH_MS = 15_000;

/**
 * Màn hình làm việc của một PCT nhà thầu (toàn trang, dùng được trên máy tính bảng / điện thoại ở cổng):
 * cho phép / mở lần làm việc, quét thẻ vào–ra với bộ đếm lớn, bàn giao CHTT, kết thúc; lịch sử bên dưới.
 */
export function PermitWorkScreen({ id }: { id: string }) {
  const query = useWorkPermit(id, LIVE_REFRESH_MS);
  const companies = usePermitCompanySummary();
  const [action, setAction] = useState<{ kind: "open" } | { kind: "handoff" | "end"; session: PermitSession } | { kind: "progress"; session?: PermitSession } | null>(null);
  const permit = query.data?.data;
  const canExecute = Boolean(query.data?.meta?.canExecute);
  const canIssue = Boolean(query.data?.meta?.canIssue);
  // `?open=1` từ QR PCT Đại tu; `?scan=1` / `?end=1` từ QR hoặc bảng Đang làm việc:
  // bật đúng hộp MỘT lần rồi xoá tham số, tải lại trang không bật lại.
  const searchParams = useSearchParams();
  const router = useRouter();
  const [initialIntent] = useState(() => searchParams.get("open") === "1" ? "open" : searchParams.get("scan") === "1" ? "scan" : searchParams.get("end") === "1" ? "end" : null);
  const intent = useRef(initialIntent);
  const autoScan = initialIntent === "scan";
  const liveSession = permit?.sessions.find(s => !s.endedAt);
  // Quá "Kết thúc công việc dự kiến": theo quy định kết thúc phiếu, cấp PCT mới — không mở / bàn giao (server cũng chặn).
  const overdue = Boolean(permit && permitDeadline(permit)?.state === "overdue");
  const canOpen = Boolean(permit && canExecute && !liveSession && !overdue && ["ISSUED", "WAITING"].includes(permit.status));
  const canUpdateLater = Boolean(permit && canExecute && !liveSession && ["ISSUED", "WAITING", "CLOSED"].includes(permit.status) && canUpdateOverhaulProgress(permit));
  useEffect(() => {
    if (!permit || !intent.current) return;
    if (intent.current === "end" && liveSession && canExecute) setAction({ kind: "end", session: liveSession });
    if (intent.current === "open" && canOpen) setAction({ kind: "open" });
    intent.current = null;
    router.replace(`/work-permits/${encodeURIComponent(id)}/lam-viec`, { scroll: false });
  }, [permit, liveSession, canExecute, canOpen, id, router]);
  const back = <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 px-2 text-xs"><Link href={`/work-permits?permitId=${encodeURIComponent(id)}`}><ArrowLeft />Về sổ PCT</Link></Button>;

  if (query.isError) return <div className="mx-auto max-w-4xl space-y-3">{back}<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{query.error.message}</p></div>;
  if (!permit) return <div className="mx-auto max-w-4xl space-y-3">{back}<p role="status" className="text-sm text-muted-foreground">Đang tải phiếu…</p></div>;

  const live = liveSession;
  // Còn nhân viên (trừ CHTT) trong khu vực → khoá nút Kết thúc tới khi quét ra hết.
  const workersInside = live ? workersStillInside(live.members, live).length : 0;
  // PCT nhà thầu: hiện mã đơn vị (tên gọi tắt trong danh bạ) cho gọn; đơn vị chưa khai mã thì giữ tên đầy đủ.
  const teamCode = permit.teamType === "CONTRACTOR" ? companies.data?.data.find(row => row.company === permit.teamName)?.code || "" : "";
  // Không thêm lề ngang: <main> của AppShell đã có p-4 (điện thoại) / p-6 / p-8.
  return <div className="mx-auto max-w-4xl space-y-4">
    <header className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">{back}
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin" : undefined} />Làm mới</Button>
      </div>
      <div>
        {/* Điện thoại: bỏ dòng nhãn và vị trí cho gọn đầu trang (người dùng chính ở hiện trường). */}
        <p className="hidden text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:block">Màn hình làm việc · {PERMIT_KINDS[permit.kind]} · {PERMIT_STATUSES[permit.status]}</p>
        <h1 className="text-lg font-bold sm:text-2xl">PCT {formatPermitNumber(permit)}</h1>
        <p className="mt-1 line-clamp-3 whitespace-pre-line text-[15px] font-semibold leading-6">{compactOverhaulContent(permit.content) || "—"}</p>
        <p className="text-sm text-muted-foreground">{permit.location && <span className="hidden sm:inline">{permit.location} · </span>}{PERMIT_UNITS[permit.unit]}{permit.teamName && <>{PERMIT_UNITS[permit.unit] && " · "}<span title={permit.teamName}>{teamCode || permit.teamName}</span></>}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2"><PermitDeadlineBadge permit={permit} />{Boolean(query.data?.meta?.canEditOverhaulItems) && <OverhaulItemsEditButton permit={permit} />}</div>
      </div>
    </header>

    {permit.teamType !== "CONTRACTOR" ? <p className="rounded-lg bg-muted/40 p-4 text-sm">Màn hình làm việc chỉ dành cho PCT nhà thầu.</p> : live ? <section className="space-y-4 rounded-2xl border-2 border-emerald-400 bg-card p-3 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700"><span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500 align-middle" aria-hidden />Đang làm việc · {elapsed(live.openedAt)}</p>
          <p className="mt-1 text-base font-bold leading-6 sm:text-lg">CHTT {live.commanderName}{live.commanderCode && <span className="ml-1.5 text-xs font-medium text-muted-foreground">{live.commanderCode}</span>}</p>
          <p className="text-xs text-muted-foreground sm:text-sm">Mở lúc {fmt(live.openedAt)} · Cho phép: {live.authorizerName}</p>
        </div>
        {canExecute && <div className="grid grid-cols-2 gap-2 sm:flex">
          {/* PCT đại tu: cập nhật % + ghi chú từng hạng mục giữa chừng — điện thoại chiếm trọn hàng đầu. */}
          {canUpdateOverhaulProgress(permit) && <Button type="button" variant="outline" className="col-span-2 h-10 border-violet-200 text-violet-800 hover:bg-violet-50 hover:text-violet-900 sm:order-2 sm:col-span-1 dark:border-violet-900 dark:text-violet-200" onClick={() => setAction({ kind: "progress", session: live })}><ChartNoAxesColumnIncreasing />Cập nhật tiến độ</Button>}
          <Button type="button" variant="outline" className="h-10 sm:order-1" disabled={overdue} title={overdue ? "PCT đã quá hạn — không đổi CHTT, chỉ kết thúc" : undefined} onClick={() => setAction({ kind: "handoff", session: live })}><UserRoundCog />Đổi CHTT</Button>
          <Button type="button" variant="outline" disabled={workersInside > 0} title={workersInside ? `Còn ${workersInside} nhân viên trong khu vực — quét ra hết rồi mới kết thúc` : undefined} className="h-10 border-red-200 text-red-700 sm:order-3 hover:bg-red-50 hover:text-red-800" onClick={() => setAction({ kind: "end", session: live })}><Square />Kết thúc</Button>
        </div>}
      </div>
      {canExecute && workersInside > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">Còn {workersInside} nhân viên trong khu vực — quét ra hết mới bấm được Kết thúc.</p>}
      <SessionAttendance permit={permit} session={live} canExecute={canExecute} size="lg" autoScan={autoScan} />
    </section> : <section className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/50 p-5 text-center dark:bg-sky-950/20">
      <p className="text-base font-semibold">Chưa có lần làm việc đang mở</p>
      <p className="text-sm text-muted-foreground">{canOpen ? "Chọn CHTT, người cho phép và quét thẻ nhân viên để mở lần làm việc." : overdue && ["ISSUED", "WAITING"].includes(permit.status) ? "PCT đã quá thời gian kết thúc công việc dự kiến — không mở lần làm việc mới. Kết thúc phiếu này; công tác chưa xong thì cấp PCT mới." : ["ISSUED", "WAITING"].includes(permit.status) ? "Bạn không có quyền cho phép làm việc trên phiếu này." : `Phiếu đang ở trạng thái “${PERMIT_STATUSES[permit.status]}” nên không mở được lần làm việc mới.`}</p>
      {(canOpen || canUpdateLater) && <div className="flex flex-col justify-center gap-2 sm:flex-row">
        {canOpen && <Button type="button" className="h-12 w-full px-6 text-base sm:w-auto" onClick={() => setAction({ kind: "open" })}><Play />Cho phép / mở lần làm việc</Button>}
        {/* PCT đại tu không có lần đang mở (đã kết thúc ngày / kết thúc phiếu): vẫn cập nhật tiến độ ghi Sheet. */}
        {canUpdateLater && <Button type="button" variant="outline" className="h-12 w-full border-violet-200 px-6 text-base text-violet-800 hover:bg-violet-50 hover:text-violet-900 sm:w-auto dark:border-violet-900 dark:text-violet-200" onClick={() => setAction({ kind: "progress" })}><ChartNoAxesColumnIncreasing />Cập nhật tiến độ</Button>}
      </div>}
    </section>}

    {permit.teamType === "CONTRACTOR" && <ContractorSessions key={`${permit.id}-${permit.version}-history`} permit={permit} canExecute={canExecute} historyOnly />}

    {action && <SessionEditor permit={permit} session={action.kind === "open" ? undefined : action.session} handoff={action.kind === "handoff"} progressUpdate={action.kind === "progress"} onClose={() => setAction(null)} />}
  </div>;
}
