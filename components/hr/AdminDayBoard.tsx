"use client";
// =====================================================================
// ĐĂNG KÝ ĐI HÀNH CHÍNH — bảng tuần (bản tích hợp theo module README)
// Nối vào hook/API sẵn có (HcGroup/HcCheckIn) — KHÔNG tạo model/API mới:
// - Danh sách:  GET /api/hc-registrations (useHcRegistrations)
// - Đăng ký:    POST /api/hc-groups/checkin (useHcCheckIn — chế độ đăng ký)
// - Duyệt:      PUT /api/hc-groups/checkin (useHcApprove)
// - Hủy:        PATCH /api/hc-groups/checkin (useHcCancelRegistration)
// Luật 2 ngày + 16h30 hiển thị ở client (lib/admin-day-rules), server chặn thật.
// =====================================================================
import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Archive, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useHcRegistrations,
  useHcCheckIn,
  useHcApprove,
  useHcCancelRegistration,
  type HcRegistration,
} from "@/hooks/useHcAttendance";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { addDaysIso, canRegister, deadlineFor, earliestRegistrableDate, isWeekend, isoDateVN } from "@/lib/admin-day-rules";
import { PageHeader } from "@/components/shared/page-header";

/* ---------------- Buổi ↔ nhóm hành chính sẵn có ---------------- */
type SessionKey = "SANG" | "CHIEU" | "CA_NGAY";
const SESSION_LABEL: Record<SessionKey, string> = { SANG: "Sáng", CHIEU: "Chiều", CA_NGAY: "Cả ngày" };
const SESSION_TO_PERIOD: Record<SessionKey, "MORNING" | "AFTERNOON" | "FULL_DAY"> = {
  SANG: "MORNING",
  CHIEU: "AFTERNOON",
  CA_NGAY: "FULL_DAY",
};
/** Nhãn buổi từ nội dung nhóm HC hiện có ("Hành chính - Buổi sáng"…) */
function sessionLabelOf(reg: HcRegistration) {
  const content = reg.group.content.replace(/^Hành chính - /, "");
  return content || "Hành chính";
}

const STATUS_UI = {
  PENDING: { label: "Chờ duyệt", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  APPROVED: { label: "Đã duyệt", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REJECTED: { label: "Không duyệt", cls: "bg-orange-50 text-orange-600 border-orange-200" },
  CANCELLED: { label: "Đã hủy", cls: "bg-red-50 text-red-600 border-red-200" },
} as const;
const AVATAR_COLORS = ["bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-rose-500", "bg-amber-500", "bg-cyan-600", "bg-indigo-500"];
const DAY_NAMES = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

const initials = (name: string) => name.trim().split(/\s+/).slice(-2).map((w) => w[0]).join("");
const hashColor = (s: string) => AVATAR_COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
const fmtVN = (dateIso: string) => new Date(dateIso + "T00:00:00").toLocaleDateString("vi-VN");

function Avatar({ reg, size, ring }: { reg: HcRegistration; size: string; ring: string }) {
  return reg.user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={reg.user.avatarUrl} alt={reg.user.name} className={`${size} rounded-full object-cover border-2 ${ring} shrink-0`} title={reg.user.name} />
  ) : (
    <span className={`${size} rounded-full border-2 ${ring} ${hashColor(reg.user.id)} text-white font-bold flex items-center justify-center shrink-0`} title={reg.user.name}>
      {initials(reg.user.name)}
    </span>
  );
}

export default function AdminDayBoard() {
  const todayIso = isoDateVN(new Date());
  const week = React.useMemo(() => [...Array(7)].map((_, i) => addDaysIso(todayIso, i)), [todayIso]);

  const { data: session } = useSession();
  const myId = session?.user?.id;
  const rbac = useRbacAccess();
  const canApprove = rbac.can("hc-attendance-approve", ["approve", "manage", "full"]);

  const registrations = useHcRegistrations(week[0], week[6]);
  const regs = React.useMemo(() => registrations.data?.data ?? [], [registrations.data?.data]);
  const checkIn = useHcCheckIn();
  const approveMut = useHcApprove();
  const cancelMut = useHcCancelRegistration();
  const busy = checkIn.isPending || approveMut.isPending || cancelMut.isPending;

  const [selDate, setSelDate] = React.useState(earliestRegistrableDate());
  const [sessionKey, setSessionKey] = React.useState<SessionKey>("CA_NGAY");
  const [note, setNote] = React.useState("");
  const [cancelFor, setCancelFor] = React.useState<string | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");

  const regsByDate = React.useMemo(() => {
    const m = new Map<string, HcRegistration[]>();
    for (const r of regs) {
      const key = isoDateVN(new Date(r.group.date));
      const list = m.get(key);
      if (list) list.push(r);
      else m.set(key, [r]);
    }
    return m;
  }, [regs]);

  const dayRegs = regsByDate.get(selDate) ?? [];
  const myDayReg = dayRegs.find((r) => r.userId === myId && !["CANCELLED"].includes(r.registrationStatus));
  const registrable = canRegister(selDate);
  const dl = deadlineFor(selDate);
  const dlLabel = dl.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

  const submit = async () => {
    try {
      await checkIn.mutateAsync({ date: selDate, period: SESSION_TO_PERIOD[sessionKey], note: note.trim() });
      toast.success("Đã gửi đăng ký đi hành chính");
      setNote("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const approve = async (r: HcRegistration) => {
    try {
      await approveMut.mutateAsync({ groupId: r.group.id, ids: [r.id] });
      toast.success(`Đã duyệt đăng ký của ${r.user.name}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const doCancel = async (r: HcRegistration) => {
    try {
      await cancelMut.mutateAsync({ checkInId: r.id, action: "CANCEL", reason: cancelReason.trim() });
      toast.success("Đã hủy đăng ký");
      setCancelFor(null);
      setCancelReason("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* ===== Header — dùng PageHeader chuẩn của site để đồng bộ kiểu chữ ===== */}
      <div className="mb-6">
        <PageHeader
          title="ĐĂNG KÝ ĐI HÀNH CHÍNH"
          description={`Gửi trước tối thiểu 2 ngày (Thứ 2 – Thứ 6), trước 16h30 · ${canApprove ? "Bạn đang có quyền duyệt đăng ký" : "Đăng ký của bạn sẽ chờ người có quyền duyệt"}`}
        >
          <Link
            href="/hr/admin-registration/kho-luu-tru"
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-card text-sm font-semibold text-muted-foreground hover:bg-muted"
          >
            <Archive className="h-4 w-4" /> Kho lưu trữ
          </Link>
        </PageHeader>
      </div>

      {/* ===== Dải tuần ===== */}
      <div className="grid grid-cols-7 gap-2 mb-6">
        {week.map((dIso) => {
          const d = new Date(dIso + "T00:00:00");
          const active = (regsByDate.get(dIso) ?? []).filter((r) => !["CANCELLED", "REJECTED"].includes(r.registrationStatus));
          const locked = !canRegister(dIso);
          const selected = dIso === selDate;
          const isToday = dIso === todayIso;
          return (
            <button
              key={dIso}
              onClick={() => setSelDate(dIso)}
              className={`relative rounded-2xl border px-2 pt-3 pb-2.5 text-center transition-all ${
                selected
                  ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/25"
                  : "bg-card border-border hover:border-blue-300 hover:shadow-sm"
              }`}
            >
              <div className={`text-[11px] font-bold tracking-widest ${selected ? "text-blue-100" : isToday ? "text-blue-600" : "text-muted-foreground"}`}>
                {DAY_NAMES[d.getDay()]}
                {isToday ? " · NAY" : ""}
              </div>
              <div className={`text-xl font-extrabold leading-tight ${selected ? "text-white" : "text-ink"}`}>
                {String(d.getDate()).padStart(2, "0")}
              </div>
              <div className="mt-1.5 h-6 flex items-center justify-center">
                {active.length > 0 ? (
                  <div className="flex -space-x-1.5">
                    {active.slice(0, 3).map((r) => (
                      <Avatar key={r.id} reg={r} size="w-5 h-5 text-[8px]" ring={selected ? "border-blue-600" : "border-white"} />
                    ))}
                    {active.length > 3 && (
                      <span className={`w-5 h-5 rounded-full border-2 ${selected ? "border-blue-600 bg-blue-500" : "border-white bg-slate-400"} text-white text-[8px] font-bold flex items-center justify-center`}>
                        +{active.length - 3}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className={`text-[10px] ${selected ? "text-blue-200" : "text-slate-300"}`}>—</span>
                )}
              </div>
              {locked && (
                <span className={`absolute top-1.5 right-1.5 text-[9px] ${selected ? "text-blue-200" : "text-slate-300"}`} title={isWeekend(dIso) ? "Cuối tuần — không đăng ký đi hành chính" : "Đã quá hạn gửi đăng ký"}>
                  🔒
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* ===== Form đăng ký ===== */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5 h-fit">
          <div className="text-sm font-bold text-ink mb-4">Đăng ký cho ngày {fmtVN(selDate)}</div>

          <div className="text-xs font-semibold text-muted-foreground mb-1.5">Buổi</div>
          <div className="grid grid-cols-3 rounded-lg border border-border overflow-hidden text-sm font-semibold mb-4">
            {(Object.keys(SESSION_LABEL) as SessionKey[]).map((s) => (
              <button
                key={s}
                onClick={() => setSessionKey(s)}
                className={`py-2 ${sessionKey === s ? "bg-blue-600 text-white" : "bg-card text-muted-foreground hover:bg-muted"}`}
              >
                {SESSION_LABEL[s]}
              </button>
            ))}
          </div>

          <div className="text-xs font-semibold text-muted-foreground mb-1.5">
            Nội dung công việc{" "}
            <span className="font-normal text-slate-400">(chỉ điền khi đã được phân công — ghi rõ người phân công; chưa có thì để trống)</span>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="VD: Hoàn thiện hồ sơ PCCC theo phân công của Quản đốc"
            className="w-full border border-border rounded-lg px-3 py-2.5 text-sm resize-none bg-card focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 mb-4"
          />

          {myDayReg ? (
            <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm mb-4 bg-blue-50 text-blue-800">
              <span className="mt-0.5">ℹ</span>
              <span>
                Bạn đã có đăng ký <b>{sessionLabelOf(myDayReg)}</b> ({STATUS_UI[myDayReg.registrationStatus].label}) cho ngày này.
              </span>
            </div>
          ) : (
            <div className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm mb-4 ${registrable ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
              <span className="mt-0.5">{registrable ? "✔" : "✖"}</span>
              {registrable ? (
                <span>
                  Còn hạn gửi cho ngày này — hạn chót <b>{dlLabel}</b>. Sau khi gửi không thể tự hủy; chỉ người có quyền duyệt hủy được.
                </span>
              ) : isWeekend(selDate) ? (
                <span>
                  Không cho phép đăng ký đi hành chính vào <b>ngày cuối tuần (Thứ 7, Chủ nhật)</b>. Chỉ được đăng ký các ngày trong tuần
                  từ Thứ 2 đến Thứ 6 — ngày sớm nhất còn đăng ký: <b>{fmtVN(earliestRegistrableDate())}</b>.
                </span>
              ) : (
                <span>
                  Đã quá hạn gửi cho ngày này (hạn {dlLabel}). Ngày sớm nhất còn đăng ký: <b>{fmtVN(earliestRegistrableDate())}</b>.
                </span>
              )}
            </div>
          )}

          <button
            onClick={submit}
            disabled={!registrable || !!myDayReg || busy}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {checkIn.isPending ? "Đang gửi…" : "Gửi đăng ký"}
          </button>
        </div>

        {/* ===== Danh sách ngày đang chọn ===== */}
        <div className="lg:col-span-3">
          <div className="flex items-baseline gap-2 mb-3">
            <div className="text-sm font-bold text-ink">Ngày {fmtVN(selDate)}</div>
            <div className="text-xs text-muted-foreground">
              {dayRegs.filter((r) => !["CANCELLED", "REJECTED"].includes(r.registrationStatus)).length} nhân sự đăng ký
              {canApprove && dayRegs.some((r) => r.registrationStatus === "PENDING") && (
                <span className="ml-2 text-amber-600 font-semibold">
                  · {dayRegs.filter((r) => r.registrationStatus === "PENDING").length} chờ bạn duyệt
                </span>
              )}
            </div>
          </div>

          {registrations.isLoading ? (
            <div className="bg-card border border-border rounded-2xl py-14 text-center text-sm text-muted-foreground">
              <Loader2 className="inline h-4 w-4 animate-spin mr-1.5" /> Đang tải…
            </div>
          ) : dayRegs.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-2xl py-14 text-center text-sm text-muted-foreground">
              Chưa có ai đăng ký ngày này. Đăng ký ở khung bên trái.
            </div>
          ) : (
            <div className="space-y-3">
              {dayRegs.map((r) => {
                const st = STATUS_UI[r.registrationStatus];
                return (
                  <div key={r.id} className={`bg-card border border-border rounded-2xl p-4 ${["CANCELLED", "REJECTED"].includes(r.registrationStatus) ? "opacity-70" : ""}`}>
                    <div className="flex items-start gap-3">
                      <Avatar reg={r} size="w-10 h-10 text-sm" ring="border-white" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-ink">{r.user.name}</span>
                          {r.user.position && <span className="text-xs text-muted-foreground">{r.user.position}</span>}
                          <span className="text-[11px] font-semibold bg-muted text-muted-foreground rounded px-2 py-0.5">{sessionLabelOf(r)}</span>
                          <span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                        </div>
                        {r.note && <div className="text-sm text-slate-600 mt-1.5">{r.note}</div>}
                        {r.registrationStatus === "CANCELLED" && r.cancellationReason && (
                          <div className="text-xs text-red-500 mt-1.5">Lý do hủy: {r.cancellationReason}</div>
                        )}
                        {r.registrationStatus === "REJECTED" && (
                          <div className="text-xs text-orange-500 mt-1.5">Không được duyệt{r.rejectionCount >= 2 ? " (đã 2 lần — không thể đăng ký lại ngày này)" : ""}</div>
                        )}
                        {cancelFor === r.id && (
                          <div className="flex gap-2 mt-2">
                            <input
                              autoFocus
                              value={cancelReason}
                              onChange={(e) => setCancelReason(e.target.value)}
                              placeholder="Lý do hủy (bắt buộc, hiển thị cho người đăng ký)"
                              className="flex-1 border border-red-300 rounded-lg px-3 py-1.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-red-400/40"
                            />
                            <button
                              onClick={() => doCancel(r)}
                              disabled={!cancelReason.trim() || busy}
                              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-40"
                            >
                              Xác nhận hủy
                            </button>
                            <button onClick={() => setCancelFor(null)} className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground">
                              Thôi
                            </button>
                          </div>
                        )}
                      </div>
                      {canApprove && cancelFor !== r.id && r.registrationStatus === "PENDING" && (
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => approve(r)} disabled={busy} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-40">
                            ✔ Duyệt
                          </button>
                          <button onClick={() => setCancelFor(r.id)} className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-xs font-bold">
                            Hủy
                          </button>
                        </div>
                      )}
                      {canApprove && cancelFor !== r.id && r.registrationStatus === "APPROVED" && (
                        <button onClick={() => setCancelFor(r.id)} className="shrink-0 px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted text-xs font-semibold">
                          Hủy
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
