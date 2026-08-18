"use client";
// TAB "TỔNG QUAN" — bám đúng sheet TỔNG QUAN của file gốc nhưng mọi con số đều
// TÍNH TỪ DỮ LIỆU CHI TIẾT (sheet gốc là bảng nhập tay). Xem docs/pccc.md mục 3.
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CalendarClock, CircleGauge, Droplets, FlameKindling, Layers, ShieldCheck } from "lucide-react";
import { PercentBar, StatCard, StatusBadge, TD_CLASS, TH_CLASS, TableShell, fmtPercent } from "@/components/pccc/pccc-shared";
import type { PcccSummary } from "@/hooks/usePccc";

const TONE_COLOR = { ok: "#16A34A", watch: "#D97706", bad: "#DC2626" } as const;

type TccGroupRow = { groupLabel: string; binhThuong: number; huHong1Phan: number; huHongHoanToan: number };

/** Nhãn nhóm linh kiện dài hơn bề ngang trục thì cắt bớt — tên đầy đủ vẫn có trong tooltip. */
function shortGroupLabel(value: string, max = 12) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Tooltip của biểu đồ TCC: hiện ĐỦ CẢ BA trạng thái, kể cả "bình thường" không vẽ trên cột. */
function TccChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: TccGroupRow }[] }) {
  if (!active || !payload?.length) return null;
  const g = payload[0].payload;
  const total = g.binhThuong + g.huHong1Phan + g.huHongHoanToan;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] shadow-lg">
      <p className="mb-1 font-bold text-ink">{g.groupLabel}</p>
      <p className="text-emerald-700">Bình thường: {g.binhThuong}</p>
      <p className="text-amber-700">Hư hỏng 1 phần: {g.huHong1Phan}</p>
      <p className="text-rose-700">Hư hỏng hoàn toàn: {g.huHongHoanToan}</p>
      <p className="mt-1 border-t border-slate-100 pt-1 text-muted-foreground">Tổng {total} ô đã tích</p>
    </div>
  );
}

function SectionTitle({ index, title, note }: { index: string; title: string; note?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline gap-2">
      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-navy text-[11px] font-bold text-white">{index}</span>
      <h3 className="text-sm font-bold uppercase tracking-wide text-navy">{title}</h3>
      {note && <span className="truncate text-[11px] text-muted-foreground">{note}</span>}
    </div>
  );
}

/**
 * Bấm thẻ KPI → mở đúng bảng chi tiết đã lọc sẵn của con số đó. Tổng quan chỉ nói
 * "có bao nhiêu", người dùng luôn hỏi tiếp "những cái nào" — đây là đường đi thẳng
 * tới câu trả lời, khỏi phải tự dò lại bộ lọc.
 */
export type PcccOverviewDrill =
  | "BCC_KHA_DUNG"
  | "BCC_BAT_KHA_DUNG"
  | "BCC_QUA_HAN"
  | "TCC_HONG_NANG"
  | "NNBC_BAT_KHA_DUNG";

export function PcccOverview({ summary, onDrill }: { summary: PcccSummary; onDrill?: (target: PcccOverviewDrill) => void }) {
  const bccTotal = summary.bcc.total;
  /** Chỉ biến thẻ thành nút khi trang có xử lý — thẻ không đi đâu thì đừng giả vờ bấm được. */
  const drill = (target: PcccOverviewDrill) => (onDrill ? () => onDrill(target) : undefined);

  const donut = useMemo(
    () => [
      { name: "Khả dụng", value: bccTotal.khaDung, tone: "ok" as const },
      { name: "Cần theo dõi", value: bccTotal.canTheoDoi, tone: "watch" as const },
      { name: "Bất khả dụng", value: bccTotal.batKhaDung, tone: "bad" as const },
    ],
    [bccTotal]
  );

  const tccByGroup = useMemo(() => {
    const map = new Map<string, TccGroupRow>();
    for (const r of summary.tcc.rows) {
      const cur = map.get(r.groupLabel) ?? { groupLabel: r.groupLabel, binhThuong: 0, huHong1Phan: 0, huHongHoanToan: 0 };
      cur.binhThuong += r.binhThuong;
      cur.huHong1Phan += r.huHong1Phan;
      cur.huHongHoanToan += r.huHongHoanToan;
      map.set(r.groupLabel, cur);
    }
    return [...map.values()];
  }, [summary.tcc.rows]);

  /**
   * Xếp hạng nhóm linh kiện theo SỐ Ô LỖI, nhiều nhất lên trên. Bảng bên trái liệt kê
   * theo thứ tự cột gốc của sheet nên nhìn không ra "hỏng ở đâu nhiều nhất" — biểu đồ
   * này trả lời đúng câu đó, không lặp lại cột "Mức lành" của bảng.
   */
  const tccRanked = useMemo(
    () =>
      tccByGroup
        .map((g) => ({ ...g, loi: g.huHong1Phan + g.huHongHoanToan }))
        .sort((a, b) => b.loi - a.loi || b.huHongHoanToan - a.huHongHoanToan),
    [tccByGroup]
  );

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
          onClick={drill("BCC_KHA_DUNG")}
          actionLabel={`Bấm để xem ${bccTotal.khaDung} bình khả dụng ở tab Bình chữa cháy`}
        />
        <StatCard
          label="Bình bất khả dụng"
          value={bccTotal.batKhaDung}
          hint={`${bccTotal.canTheoDoi} bình cần theo dõi`}
          tone={bccTotal.batKhaDung > 0 ? "bad" : "ok"}
          icon={AlertTriangle}
          onClick={drill("BCC_BAT_KHA_DUNG")}
          actionLabel={`Bấm để xem ${bccTotal.batKhaDung} bình bất khả dụng ở tab Bình chữa cháy`}
        />
        <StatCard
          label="Quá hạn thay thế"
          value={bccTotal.quaHanThayThe}
          hint={`${bccTotal.sapDenHan} bình sắp đến hạn (90 ngày)`}
          tone={bccTotal.quaHanThayThe > 0 ? "watch" : "ok"}
          icon={CalendarClock}
          onClick={drill("BCC_QUA_HAN")}
          actionLabel={`Bấm để xem ${bccTotal.quaHanThayThe} bình quá hạn thay thế ở tab Bình chữa cháy`}
        />
        <StatCard
          label="Linh kiện tủ hỏng nặng"
          value={summary.tcc.total.huHongHoanToan}
          hint={`${summary.tcc.total.huHong1Phan} lỗi nhẹ · ${summary.tcc.total.binhThuong} bình thường`}
          tone={summary.tcc.total.huHongHoanToan > 0 ? "bad" : "ok"}
          icon={Layers}
          onClick={drill("TCC_HONG_NANG")}
          actionLabel="Bấm để xem các tủ bất khả dụng (có linh kiện hỏng nặng) ở tab Tủ chữa cháy"
        />
      </div>

      {/* I. BCC */}
      <section>
        <SectionTitle index="I" title="Bình chữa cháy (BCC)" note="theo chủng loại" />
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          {/* Cột trái cao hơn bảng BCC (bảng chỉ 4 dòng, biểu đồ tròn bên phải cao gấp
              đôi) nên hai thẻ RON được kê vào đúng khoảng trắng đó — số liệu ron tính
              từ tủ chữa cháy, nhưng đặt ở đây thì không ai phải cuộn để thấy nó. */}
          <div className="min-w-0 space-y-3">
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

          {/* Ron: công thức mới, tính từ ô ☑ thay cho 2 dòng nhập tay của sheet cũ */}
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.tcc.ron.map((r) => (
              <div key={r.loaiRon} className="rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-navy">Ron chữa cháy {r.loaiRon}</p>
                  <StatusBadge status={r.thieuRon === 0 ? "Khả dụng" : "Cần theo dõi"} />
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {r.loaiTu} · {r.soTu} tủ (ngàm 1) + {r.soCuonVoi} cuộn vòi (lăng phun 2) = {r.tongRon} ron
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
          </div>

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
        {/* Cột phải rộng hơn mục I (340 thay vì 280): trục dọc ở đây là TÊN NHÓM LINH
            KIỆN, dài tới "VAN TAY CHẶN TỔNG" — hẹp như bên kia là phải cắt chữ. */}
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* `min-w-0` là bắt buộc: cột `1fr` mặc định không co nhỏ hơn bề rộng tối thiểu
            của bảng, nên màn hình hẹp là bảng TRÀN ĐÈ lên biểu đồ bên phải thay vì tự
            cuộn ngang trong khung của nó. */}
        <TableShell className="min-w-0" fill>
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

        {/* Biểu đồ cột NGANG XẾP CHỒNG, khác kiểu với hình tròn của BCC là có chủ ý:
            bên BCC mỗi bình chỉ mang MỘT tình trạng nên chia tròn được; bên TCC một
            nhóm có thể vừa "hư hỏng 1 phần" vừa "hoàn toàn" nên tổng không phải 100%,
            và câu hỏi thực tế là "hỏng ở đâu nhiều nhất" — cột ngang xếp hạng trả lời
            được, hình tròn thì không. */}
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nhóm linh kiện lỗi nhiều nhất</p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">xếp theo số ô lỗi · rê chuột để xem cả số bình thường</p>
          <div className="mt-1.5 h-[268px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tccRanked} layout="vertical" margin={{ top: 2, right: 14, left: 0, bottom: 2 }} barCategoryGap={3}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} stroke="#94A3B8" />
                <YAxis
                  type="category"
                  dataKey="groupLabel"
                  width={124}
                  tick={{ fontSize: 10, fontWeight: 600 }}
                  tickFormatter={(v) => shortGroupLabel(String(v), 20)}
                  tickLine={false}
                  axisLine={false}
                  stroke="#64748B"
                />
                <Tooltip cursor={{ fill: "#F1F5F9" }} content={<TccChartTooltip />} />
                <Bar dataKey="huHong1Phan" name="Hư hỏng 1 phần" stackId="loi" fill={TONE_COLOR.watch} radius={[3, 0, 0, 3]} />
                <Bar dataKey="huHongHoanToan" name="Hư hỏng hoàn toàn" stackId="loi" fill={TONE_COLOR.bad} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-1 space-y-1 border-t border-slate-100 pt-1.5">
            {[
              { name: "Bình thường", value: summary.tcc.total.binhThuong, tone: "ok" as const },
              { name: "Hư hỏng 1 phần", value: summary.tcc.total.huHong1Phan, tone: "watch" as const },
              { name: "Hư hỏng hoàn toàn", value: summary.tcc.total.huHongHoanToan, tone: "bad" as const },
            ].map((d) => (
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

      {/* IV. NÚT NHẤN BÁO CHÁY */}
      <section>
        <SectionTitle index="IV" title="Nút nhấn báo cháy (NNBC)" note="đếm theo ô đã tích, một nhóm có thể có nhiều lỗi" />
        <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <StatCard
              label="Khả dụng"
              value={summary.nnbc.khaDung}
              hint={`trên ${summary.nnbc.tongSo} nút nhấn`}
              tone="ok"
              icon={ShieldCheck}
            />
            <StatCard label="Cần theo dõi" value={summary.nnbc.canTheoDoi} tone="watch" icon={AlertTriangle} />
            <StatCard
              label="Bất khả dụng"
              value={summary.nnbc.batKhaDung}
              tone="bad"
              icon={AlertTriangle}
              onClick={drill("NNBC_BAT_KHA_DUNG")}
            />
          </div>
          <TableShell fill>
            <thead>
              <tr>
                <th className={TH_CLASS}>Hạng mục</th>
                <th className={`${TH_CLASS} text-right`}>Bình thường</th>
                <th className={`${TH_CLASS} text-right`}>Hư hỏng 1 phần</th>
                <th className={`${TH_CLASS} text-right`}>Hư hỏng hoàn toàn</th>
              </tr>
            </thead>
            <tbody>
              {summary.nnbc.theoNhom.length === 0 && (
                <tr>
                  <td className={`${TD_CLASS} text-muted-foreground`} colSpan={4}>
                    Chưa có ô nào được tích trong kỳ này.
                  </td>
                </tr>
              )}
              {summary.nnbc.theoNhom.map((g) => (
                <tr key={g.groupLabel}>
                  <td className={`${TD_CLASS} font-medium`}>{g.groupLabel}</td>
                  <td className={`${TD_CLASS} text-right tabular-nums text-emerald-700`}>{g.binhThuong || ""}</td>
                  <td className={`${TD_CLASS} text-right tabular-nums text-amber-700`}>{g.huHong1Phan || ""}</td>
                  <td className={`${TD_CLASS} text-right tabular-nums font-semibold text-rose-700`}>{g.huHongHoanToan || ""}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
      </section>

      {/* V. VAN CHỮA CHÁY */}
      <section>
        <SectionTitle index="V" title="Van chữa cháy" note="tách theo loại van (Deluge / Alarm)" />
        <TableShell>
          <thead>
            <tr>
              <th className={TH_CLASS}>Loại van</th>
              <th className={`${TH_CLASS} text-right`}>Tổng số</th>
              <th className={`${TH_CLASS} text-right`}>Khả dụng</th>
              <th className={`${TH_CLASS} text-right`}>Suy giảm, vẫn dùng được</th>
              <th className={`${TH_CLASS} text-right`}>Không khả dụng</th>
              <th className={`${TH_CLASS} text-right`}>Chưa cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {summary.van.rows.map((r) => (
              <tr key={r.loaiVan}>
                <td className={`${TD_CLASS} font-medium`}>{r.loaiVan}</td>
                <td className={`${TD_CLASS} text-right tabular-nums`}>{r.tongSo}</td>
                <td className={`${TD_CLASS} text-right tabular-nums text-emerald-700`}>{r.khaDung || ""}</td>
                <td className={`${TD_CLASS} text-right tabular-nums text-amber-700`}>{r.suyGiam || ""}</td>
                <td className={`${TD_CLASS} text-right tabular-nums font-semibold text-rose-700`}>{r.khongKhaDung || ""}</td>
                <td className={`${TD_CLASS} text-right tabular-nums text-muted-foreground`}>{r.chuaCapNhat || ""}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <td className={TD_CLASS}>TỔNG CỘNG</td>
              <td className={`${TD_CLASS} text-right tabular-nums`}>{summary.van.total.tongSo}</td>
              <td className={`${TD_CLASS} text-right tabular-nums text-emerald-700`}>{summary.van.total.khaDung || ""}</td>
              <td className={`${TD_CLASS} text-right tabular-nums text-amber-700`}>{summary.van.total.suyGiam || ""}</td>
              <td className={`${TD_CLASS} text-right tabular-nums text-rose-700`}>{summary.van.total.khongKhaDung || ""}</td>
              <td className={`${TD_CLASS} text-right tabular-nums text-muted-foreground`}>{summary.van.total.chuaCapNhat || ""}</td>
            </tr>
          </tbody>
        </TableShell>
      </section>

      {/* VI. ĐÈN SỰ CỐ */}
      <section>
        <SectionTitle
          index="VI"
          title="Đèn EXIT · Đèn chiếu sáng sự cố"
          note="“Không có đèn” là vị trí không lắp đèn, không tính là lỗi"
        />
        <TableShell>
          <thead>
            <tr>
              <th className={TH_CLASS}>Loại đèn</th>
              <th className={`${TH_CLASS} text-right`}>Tổng số</th>
              <th className={`${TH_CLASS} text-right`}>Đạt</th>
              <th className={`${TH_CLASS} text-right`}>Không đạt</th>
              <th className={`${TH_CLASS} text-right`}>Không có đèn</th>
              <th className={`${TH_CLASS} text-right`}>Chưa cập nhật</th>
              <th className={`${TH_CLASS} text-right`}>% đạt</th>
            </tr>
          </thead>
          <tbody>
            {summary.den.map((r) => {
              {/* Mẫu số BỎ QUA "không có đèn": vị trí không lắp đèn thì không phải đối
                  tượng kiểm tra, để nó trong mẫu số là tự dìm tỉ lệ đạt của cả bảng. */}
              const denominator = r.tongSo - r.khongCoDen;
              return (
                <tr key={r.loai}>
                  <td className={`${TD_CLASS} font-medium`}>{r.loai === "EXIT" ? "Đèn EXIT" : "Đèn chiếu sáng sự cố"}</td>
                  <td className={`${TD_CLASS} text-right tabular-nums`}>{r.tongSo}</td>
                  <td className={`${TD_CLASS} text-right tabular-nums text-emerald-700`}>{r.dat || ""}</td>
                  <td className={`${TD_CLASS} text-right tabular-nums font-semibold text-rose-700`}>{r.khongDat || ""}</td>
                  <td className={`${TD_CLASS} text-right tabular-nums text-slate-500`}>{r.khongCoDen || ""}</td>
                  <td className={`${TD_CLASS} text-right tabular-nums text-muted-foreground`}>{r.chuaCapNhat || ""}</td>
                  <td className={`${TD_CLASS} text-right tabular-nums font-semibold`}>
                    {denominator > 0 ? fmtPercent(r.dat / denominator, 0) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      </section>
    </div>
  );
}
