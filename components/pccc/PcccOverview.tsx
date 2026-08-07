"use client";
// TAB "TỔNG QUAN" — bám đúng sheet TỔNG QUAN của file gốc nhưng mọi con số đều
// TÍNH TỪ DỮ LIỆU CHI TIẾT (sheet gốc là bảng nhập tay). Xem docs/pccc.md mục 3.
import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AlertTriangle, CalendarClock, CircleGauge, Droplets, FlameKindling, Layers, ShieldCheck } from "lucide-react";
import { PercentBar, StatCard, StatusBadge, TD_CLASS, TH_CLASS, TableShell, fmtPercent } from "@/components/pccc/pccc-shared";
import type { PcccSummary } from "@/hooks/usePccc";

const TONE_COLOR = { ok: "#16A34A", watch: "#D97706", bad: "#DC2626" } as const;

function SectionTitle({ index, title, note }: { index: string; title: string; note?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline gap-2">
      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-navy text-[11px] font-bold text-white">{index}</span>
      <h3 className="text-sm font-bold uppercase tracking-wide text-navy">{title}</h3>
      {note && <span className="truncate text-[11px] text-muted-foreground">{note}</span>}
    </div>
  );
}

export function PcccOverview({ summary }: { summary: PcccSummary }) {
  const bccTotal = summary.bcc.total;

  const donut = useMemo(
    () => [
      { name: "Khả dụng", value: bccTotal.khaDung, tone: "ok" as const },
      { name: "Cần theo dõi", value: bccTotal.canTheoDoi, tone: "watch" as const },
      { name: "Bất khả dụng", value: bccTotal.batKhaDung, tone: "bad" as const },
    ],
    [bccTotal]
  );

  const tccByGroup = useMemo(() => {
    const map = new Map<string, { groupLabel: string; binhThuong: number; huHong1Phan: number; huHongHoanToan: number }>();
    for (const r of summary.tcc.rows) {
      const cur = map.get(r.groupLabel) ?? { groupLabel: r.groupLabel, binhThuong: 0, huHong1Phan: 0, huHongHoanToan: 0 };
      cur.binhThuong += r.binhThuong;
      cur.huHong1Phan += r.huHong1Phan;
      cur.huHongHoanToan += r.huHongHoanToan;
      map.set(r.groupLabel, cur);
    }
    return [...map.values()];
  }, [summary.tcc.rows]);

  const worstFcd = summary.fcd.reduce<number | null>(
    (min, b) => (b.phanTramConLai === null ? min : min === null ? b.phanTramConLai : Math.min(min, b.phanTramConLai)),
    null
  );

  return (
    <div className="space-y-6">
      {/* Dải số liệu chính */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Bình chữa cháy"
          value={bccTotal.tongSo}
          hint={`${fmtPercent(bccTotal.phanTramKhaDung, 1)} khả dụng`}
          tone={bccTotal.phanTramKhaDung >= 0.9 ? "ok" : bccTotal.phanTramKhaDung >= 0.7 ? "watch" : "bad"}
          icon={FlameKindling}
        />
        <StatCard
          label="Bình bất khả dụng"
          value={bccTotal.batKhaDung}
          hint={`${bccTotal.canTheoDoi} bình cần theo dõi`}
          tone={bccTotal.batKhaDung > 0 ? "bad" : "ok"}
          icon={AlertTriangle}
        />
        <StatCard
          label="Quá hạn thay thế"
          value={bccTotal.quaHanThayThe}
          hint={`${bccTotal.sapDenHan} bình sắp đến hạn (90 ngày)`}
          tone={bccTotal.quaHanThayThe > 0 ? "watch" : "ok"}
          icon={CalendarClock}
        />
        <StatCard
          label="Linh kiện tủ hỏng nặng"
          value={summary.tcc.total.huHongHoanToan}
          hint={`${summary.tcc.total.huHong1Phan} lỗi nhẹ · ${summary.tcc.total.binhThuong} bình thường`}
          tone={summary.tcc.total.huHongHoanToan > 0 ? "bad" : "ok"}
          icon={Layers}
        />
      </div>

      {/* I. BCC */}
      <section>
        <SectionTitle index="I" title="Bình chữa cháy (BCC)" note="theo chủng loại" />
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <TableShell>
            <thead>
              <tr>
                {["Chỉ số", "Tổng số", "Khả dụng", "Cần theo dõi", "Bất khả dụng", "Quá hạn", "Sắp đến hạn", "Gỉ sét thân", "Gỉ sét tay nắm", "% Khả dụng"].map(
                  (h, i) => (
                    <th key={h} className={`${TH_CLASS} ${i > 0 ? "text-right" : ""}`}>
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {[...summary.bcc.rows, summary.bcc.total].map((r, idx) => {
                const isTotal = idx === summary.bcc.rows.length;
                return (
                  <tr key={r.chungLoai} className={isTotal ? "bg-slate-50 font-semibold" : "hover:bg-slate-50/60"}>
                    <td className={`${TD_CLASS} whitespace-nowrap`}>{r.chungLoai}</td>
                    <td className={`${TD_CLASS} text-right tabular-nums`}>{r.tongSo}</td>
                    <td className={`${TD_CLASS} text-right tabular-nums text-emerald-700`}>{r.khaDung}</td>
                    <td className={`${TD_CLASS} text-right tabular-nums text-amber-700`}>{r.canTheoDoi}</td>
                    <td className={`${TD_CLASS} text-right tabular-nums text-rose-700`}>{r.batKhaDung}</td>
                    <td className={`${TD_CLASS} text-right tabular-nums`}>{r.quaHanThayThe}</td>
                    <td className={`${TD_CLASS} text-right tabular-nums`}>{r.sapDenHan}</td>
                    <td className={`${TD_CLASS} text-right tabular-nums`}>{r.giSetThanBinh}</td>
                    <td className={`${TD_CLASS} text-right tabular-nums`}>{r.giSetTayNam}</td>
                    <td className={`${TD_CLASS} w-32`}>
                      <PercentBar value={r.phanTramKhaDung} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cơ cấu tình trạng</p>
            <div className="h-[168px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut} dataKey="value" nameKey="name" innerRadius={46} outerRadius={70} paddingAngle={2} strokeWidth={0}>
                    {donut.map((d) => (
                      <Cell key={d.name} fill={TONE_COLOR[d.tone]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [`${v} bình`, n]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-1 space-y-1">
              {donut.map((d) => (
                <li key={d.name} className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ background: TONE_COLOR[d.tone] }} />
                    {d.name}
                  </span>
                  <span className="font-semibold tabular-nums">{d.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* II. TCC */}
      <section>
        <SectionTitle index="II" title="Tủ chữa cháy (TCC)" note="đếm theo ô đã tích, một nhóm có thể có nhiều lỗi" />
        <TableShell>
          <thead>
            <tr>
              <th className={TH_CLASS}>Linh kiện</th>
              <th className={`${TH_CLASS} text-right`}>Bình thường</th>
              <th className={`${TH_CLASS} text-right`}>Hư hỏng 1 phần</th>
              <th className={`${TH_CLASS} text-right`}>Hư hỏng hoàn toàn</th>
              <th className={TH_CLASS}>Mức lành</th>
            </tr>
          </thead>
          <tbody>
            {tccByGroup.map((g) => {
              const total = g.binhThuong + g.huHong1Phan + g.huHongHoanToan;
              return (
                <tr key={g.groupLabel} className="hover:bg-slate-50/60">
                  <td className={`${TD_CLASS} whitespace-nowrap font-medium`}>{g.groupLabel}</td>
                  <td className={`${TD_CLASS} text-right tabular-nums text-emerald-700`}>{g.binhThuong}</td>
                  <td className={`${TD_CLASS} text-right tabular-nums text-amber-700`}>{g.huHong1Phan || ""}</td>
                  <td className={`${TD_CLASS} text-right tabular-nums text-rose-700`}>{g.huHongHoanToan || ""}</td>
                  <td className={`${TD_CLASS} w-40`}>
                    <PercentBar value={total === 0 ? null : g.binhThuong / total} />
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-50 font-semibold">
              <td className={TD_CLASS}>TỔNG CỘNG</td>
              <td className={`${TD_CLASS} text-right tabular-nums`}>{summary.tcc.total.binhThuong}</td>
              <td className={`${TD_CLASS} text-right tabular-nums`}>{summary.tcc.total.huHong1Phan}</td>
              <td className={`${TD_CLASS} text-right tabular-nums`}>{summary.tcc.total.huHongHoanToan}</td>
              <td className={TD_CLASS} />
            </tr>
          </tbody>
        </TableShell>

        {/* Ron: công thức mới, tính từ ô ☑ thay cho 2 dòng nhập tay của sheet cũ */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {summary.tcc.ron.map((r) => (
            <div key={r.loaiRon} className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-navy">Ron chữa cháy {r.loaiRon}</p>
                <StatusBadge status={r.thieuRon === 0 ? "Khả dụng" : "Cần theo dõi"} />
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {r.loaiTu} · {r.soTu} tủ × 3 ron (lăng phun 2 + ngàm 1) = {r.tongRon} ron
              </p>
              <div className="mt-2">
                <PercentBar value={r.tongRon === 0 ? null : r.dayDu / r.tongRon} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                <span className="text-emerald-700">
                  Đầy đủ <b className="tabular-nums">{r.dayDu}</b>
                </span>
                <span className="text-rose-700">
                  Thiếu ron <b className="tabular-nums">{r.thieuRon}</b>
                </span>
                {Object.entries(r.thieuRonTheoNhom)
                  .filter(([, n]) => n > 0)
                  .map(([g, n]) => (
                    <span key={g} className="text-muted-foreground">
                      {g}: {n}
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* III. FCD + FM200 */}
      <section>
        <SectionTitle index="III" title="Foam · CO2 · Diesel · FM200" note="ngưỡng: ≥90% đủ mức · 70–90% cần theo dõi" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Mức thấp nhất"
            value={worstFcd === null ? "—" : fmtPercent(worstFcd, 0)}
            hint="bồn cần chú ý nhất"
            tone={worstFcd === null ? "none" : worstFcd >= 0.9 ? "ok" : worstFcd >= 0.7 ? "watch" : "bad"}
            icon={CircleGauge}
          />
          {summary.fcd.map((b) => (
            <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold text-ink" title={b.ten}>
                  {b.ten}
                </p>
                <StatusBadge status={b.tinhTrang} />
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {b.khoiLuongHienTai ?? "—"}/{b.khoiLuongThietKe ?? "—"} {b.dvt ?? ""} · {b.cuongVi ?? "—"}
              </p>
              <div className="mt-2">
                <PercentBar value={b.phanTramConLai} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {summary.fm200.map((panel) => {
            const measured = panel.binh.filter((b) => b.muc.value !== null || b.ap.value !== null).length;
            return (
              <div key={panel.panelKey} className="rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-navy">
                    FM200 · {panel.panelKey === "KICH_TU" ? "Phòng kích từ" : "Nhà ĐKTT"}
                  </p>
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Droplets className="size-3" />
                    {measured}/{panel.binh.length} bình đã đo
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {panel.binh.map((b) => (
                    <span
                      key={b.label}
                      title={`Bình ${b.label}: mức ${b.muc.value ?? "chưa đo"} · áp ${b.ap.value ?? "chưa đo"}`}
                      className={`grid size-7 place-items-center rounded-md border text-[11px] font-semibold ${
                        b.muc.value === null && b.ap.value === null
                          ? "border-slate-200 bg-slate-50 text-slate-400"
                          : b.muc.tinhTrang === "Đủ mức" && b.ap.tinhTrang === "Đủ mức"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : b.muc.tinhTrang === "Cần bổ sung gấp" || b.ap.tinhTrang === "Cần bổ sung gấp"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {b.label}
                    </span>
                  ))}
                </div>
                {measured === 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <ShieldCheck className="size-3" />
                    Chưa có số liệu — nhập ở tab “Foam · CO2 · Diesel · FM200”.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
