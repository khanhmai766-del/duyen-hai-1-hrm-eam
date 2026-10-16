"use client";

import Link from "next/link";
import { CircleAlert, IdCard, ScanLine } from "lucide-react";
import { PersonViolations } from "@/components/work-permits/person-violations";
import { Button } from "@/components/ui/button";
import { cardExpired, isCardlessCode } from "@/lib/work-permit-card";
import { formatPermitNumber, PERMIT_CONTRACTOR_SCOPES, type PermitPerson } from "@/lib/work-permits";

const vnDate = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "";
const vnTime = (value: string) => new Date(value).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });

/** Dải màu đầu thẻ theo nhóm — nhìn từ xa cũng biết Đại tu (tím) hay SCTX (xanh). */
const HEADER: Record<string, string> = { OVERHAUL: "bg-violet-600", SCTX: "bg-sky-600", INVESTMENT: "bg-amber-600" };

/**
 * Thẻ thông tin nhân sự nhà thầu khi quét thẻ ra vào cổng bằng nút "Quét QR" chung (11/10/2026): chỉ xem, không ghi gì.
 * Trả lời nhanh "người này là nhân sự Đại tu hay SCTX, thẻ còn hạn không, đang làm ở PCT nào".
 */
export function WorkerCardResult({ code, person, onScanAgain }: { code: string; person: PermitPerson | null; onScanAgain: () => void }) {
  if (!person) return <section className="overflow-hidden rounded-2xl border-2 border-amber-300 bg-amber-50 text-amber-950" aria-live="assertive">
    <div className="flex items-center gap-2 bg-amber-500 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white"><CircleAlert className="h-4 w-4" />Chưa có trong danh bạ nhà thầu</div>
    <div className="space-y-3 p-4">
      <p className="text-sm">Thẻ <b>{code}</b> chưa có trong danh bạ nhân sự nhà thầu, nên chưa biết thuộc nhóm SCTX, Đại tu hay Đầu tư. Kiểm tra lại với đơn vị nhà thầu hoặc đồng bộ danh bạ từ Google Sheets.</p>
      <Button type="button" className="min-h-11 w-full" onClick={onScanAgain}><ScanLine />Quét thẻ khác</Button>
    </div>
  </section>;

  const scope = person.scope && Object.hasOwn(PERMIT_CONTRACTOR_SCOPES, person.scope) ? person.scope : null;
  const expired = cardExpired(person.cardExpiresAt);
  const cardNumber = isCardlessCode(person.code) ? null : person.code;
  const works = person.activeWorks ?? [];
  const rows: Array<[string, React.ReactNode]> = [
    ["Số thẻ", cardNumber ? <b>{cardNumber}</b> : <span className="font-semibold text-amber-700">Chưa cấp thẻ</span>],
    ["Đơn vị", person.company],
    ...(person.jobTitle ? [["Chức vụ", person.jobTitle] as [string, React.ReactNode]] : []),
    ["Vai trò", person.canCommand ? "Được làm CHTT" : "Nhân viên"],
    ["Tình trạng", person.isActive ? <span className="font-semibold text-emerald-700">Đang hoạt động</span> : <span className="font-bold text-red-700">Ngừng hoạt động</span>],
    ...(person.cardExpiresAt ? [["Hạn thẻ", <span key="hsd" className={expired ? "font-bold text-red-700" : "font-semibold text-emerald-700"}>{vnDate(person.cardExpiresAt)}{expired ? " · HẾT HẠN" : ""}</span>] as [string, React.ReactNode]] : []),
    ...(person.trainingResult || person.trainedAt ? [["Huấn luyện", [person.trainingResult, person.trainedAt && `ngày ${vnDate(person.trainedAt)}`].filter(Boolean).join(" · ")] as [string, React.ReactNode]] : []),
  ];

  return <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-live="assertive">
    <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-white ${scope ? HEADER[scope] : "bg-slate-600"}`}>
      <span className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide"><IdCard className="h-4 w-4" />Thẻ nhân sự nhà thầu</span>
      <span className="text-lg font-black uppercase tracking-wide">{scope ? `Nhân sự ${PERMIT_CONTRACTOR_SCOPES[scope]}` : "Chưa phân nhóm"}</span>
    </div>
    <div className="flex gap-4 p-4">
      {person.photoUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={person.photoUrl} alt={`Ảnh ${person.name}`} className="h-32 w-24 shrink-0 rounded-lg border object-cover shadow-sm" />
        : <div className="flex h-32 w-24 shrink-0 items-center justify-center rounded-lg border bg-muted text-4xl text-slate-300">👤</div>}
      <div className="min-w-0 flex-1">
        <p className="break-words text-xl font-bold leading-7">{person.name}</p>
        <PersonViolations person={person} />
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm leading-5">
          {rows.map(([label, value]) => <div key={label} className="contents"><dt className="text-xs leading-5 text-muted-foreground">{label}</dt><dd className="min-w-0 break-words">{value}</dd></div>)}
        </dl>
      </div>
    </div>
    <div className="space-y-2 border-t border-border bg-muted/30 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Đang làm việc</p>
      {works.length ? works.map(work => <Link key={work.sessionId} href={`/work-permits/${encodeURIComponent(work.permit.id)}/lam-viec`} className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 hover:bg-emerald-100">
        <span><b>PCT {formatPermitNumber(work.permit)}</b> · {work.role === "CHTT" ? "CHTT" : "Nhân viên"}</span>
        <span className="shrink-0 text-xs">từ {vnTime(work.openedAt)}</span>
      </Link>) : <p className="text-sm text-muted-foreground">Không đang làm việc ở PCT nào.</p>}
      <Button type="button" className="mt-1 min-h-11 w-full" onClick={onScanAgain}><ScanLine />Quét thẻ khác</Button>
    </div>
  </section>;
}
