"use client";
// TAB "TỔNG QUAN" — bám đúng sheet TỔNG QUAN của file gốc nhưng mọi con số đều
// TÍNH TỪ DỮ LIỆU CHI TIẾT (sheet gốc là bảng nhập tay). Xem docs/pccc.md mục 3.
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CalendarClock, CircleGauge, Droplets, FlameKindling, Layers, ShieldCheck } from "lucide-react";
import { PercentBar, StatCard, StatusBadge, TD_CLASS, TH_CLASS, TableShell, fmtPercent } from "@/components/pccc/pccc-shared";
import { TINH_TRANG_CHUA_CAP_NHAT } from "@/lib/pccc-status";
import { PcccLightingOverview } from "./PcccLightingOverview";
import type { PcccSummary } from "@/hooks/usePccc";

// `none` = chưa có kết quả kiểm tra — xám trung tính, KHÔNG tô đỏ như lỗi.
const TONE_COLOR = { ok: "#16A34A", watch: "#D97706", bad: "#DC2626", none: "#94A3B8" } as const;

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
    <div className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-slate-200 pb-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-navy text-xs font-bold text-white">{index}</span>
      <h3 className="text-base font-bold tracking-tight text-navy">{title}</h3>
      {note && <span className="basis-full text-xs leading-5 text-slate-600 sm:basis-auto">{note}</span>}
    </div>
  );
}

/**
 * Bấm thẻ KPI → mở đúng bảng chi tiết đã lọc sẵn của con số đó. Tổng quan chỉ nói
 * "có bao nhiêu", người dùng luôn hỏi tiếp "những cái nào" — đây là đường đi thẳng
 * tới câu trả lời, khỏi phải tự dò lại bộ lọc.
 */
/**
 * Bấm một thẻ số ở Tổng quan → mở bảng chi tiết đã lọc sẵn đúng con số vừa bấm.
 *
 * Dạng ĐỐI TƯỢNG chứ không phải chuỗi hằng: mỗi nhóm thiết bị có vốn từ tình trạng
 * riêng và số thẻ ngày càng nhiều, liệt kê thành hằng chuỗi thì vừa dài vừa phải sửa
 * hai nơi mỗi lần thêm một thẻ.
 */
export type PcccOverviewDrill =
  | { bang: "BCC"; tinhTrang?: string; quaHan?: boolean }
  | { bang: "TCC"; tinhTrang?: string; loaiTu?: "INDOOR" | "OUTDOOR" }
  /** Bảng con nằm dưới tab Tủ chữa cháy — lọc bằng ô riêng của nó. */
  | { bang: "CVCC"; tinhTrang: string }
  | { bang: "NNBC"; tinhTrang: string }
  | { bang: "DEN"; loai: "EXIT" | "CSSC"; tinhTrang: string };

export function PcccOverview({ summary, onDrill }: { summary: PcccSummary; onDrill?: (target: PcccOverviewDrill) => void }) {
  const bccTotal = summary.bcc.total;
  /** Chỉ biến thẻ thành nút khi trang có xử lý — thẻ không đi đâu thì đừng giả vờ bấm được. */
  const drill = (target: PcccOverviewDrill) => (onDrill ? () => onDrill(target) : undefined);

  const donut = useMemo(
    () => [
      { name: "Đạt", value: bccTotal.dat, tone: "ok" as const },
      { name: "Không đạt", value: bccTotal.khongDat, tone: "bad" as const },
      { name: "Chưa cập nhật", value: bccTotal.chuaCapNhat, tone: "none" as const },
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
    <div className="min-w-0 space-y-8 [&_table]:text-[13px] [&_td]:py-3 [&_th]:py-3 [&_th]:normal-case [&_th]:tracking-normal [&_th]:text-slate-600">
      {/* Dải số liệu chính */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4 [&_button]:p-3 sm:[&_button]:p-4 [&_button>span:nth-child(2)]:hidden sm:[&_button>span:nth-child(2)]:grid [&_button>span:nth-child(3)>span:first-child]:min-h-10 sm:[&_button>span:nth-child(3)>span:first-child]:min-h-0">
        <StatCard
          spotlight
          label="Bình chữa cháy"
          value={bccTotal.tongSo}
          hint={`${fmtPercent(bccTotal.phanTramDat, 1)} đạt`}
          tone={bccTotal.phanTramDat >= 0.9 ? "ok" : bccTotal.phanTramDat >= 0.7 ? "watch" : "bad"}
          icon={FlameKindling}
          onClick={drill({ bang: "BCC" })}
          actionLabel={`Bấm để xem toàn bộ ${bccTotal.tongSo} bình chữa cháy`}
        />
        <StatCard
          spotlight
          label="Bình bất khả dụng"
          value={bccTotal.khongDat}
          hint={`${bccTotal.chuaCapNhat} bình chưa cập nhật`}
          tone={bccTotal.khongDat > 0 ? "bad" : "ok"}
          icon={AlertTriangle}
          onClick={drill({ bang: "BCC", tinhTrang: "Không đạt" })}
          actionLabel={`Bấm để xem ${bccTotal.khongDat} bình không đạt ở tab Bình chữa cháy`}
        />
        <StatCard
          spotlight
          label="Quá hạn thay thế"
          value={bccTotal.quaHanThayThe}
          hint={`${bccTotal.sapDenHan} bình sắp đến hạn (90 ngày)`}
          tone={bccTotal.quaHanThayThe > 0 ? "watch" : "ok"}
          icon={CalendarClock}
          onClick={drill({ bang: "BCC", quaHan: true })}
          actionLabel={`Bấm để xem ${bccTotal.quaHanThayThe} bình quá hạn thay thế ở tab Bình chữa cháy`}
        />
        <StatCard
          spotlight
          label="Linh kiện tủ hỏng nặng"
          value={summary.tcc.total.huHongHoanToan}
          hint={`${summary.tcc.total.huHong1Phan} lỗi nhẹ · ${summary.tcc.total.binhThuong} bình thường`}
          tone={summary.tcc.total.huHongHoanToan > 0 ? "bad" : "ok"}
          icon={Layers}
          onClick={drill({ bang: "TCC", tinhTrang: "Không đạt" })}
          actionLabel="Bấm để xem các tủ bất khả dụng (có linh kiện hỏng nặng) ở tab Tủ chữa cháy"
        />
      </div>

      {/* I. BCC */}
      <section>
        <SectionTitle index="I" title="Bình chữa cháy (BCC)" note="theo chủng loại" />
        <p className="mb-3 text-xs text-slate-600 2xl:hidden">Cuộn ngang bảng để xem đầy đủ chỉ số →</p>
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_240px] 2xl:grid-cols-[minmax(0,1fr)_280px]">
          {/* Cột trái cao hơn bảng BCC (bảng chỉ 4 dòng, biểu đồ tròn bên phải cao gấp
              đôi) nên hai thẻ RON được kê vào đúng khoảng trắng đó — số liệu ron tính
              từ tủ chữa cháy, nhưng đặt ở đây thì không ai phải cuộn để thấy nó. */}
          <div className="min-w-0 space-y-3">
          <TableShell className="[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:bg-white [&_td:first-child]:font-semibold [&_tr:last-child>td]:bg-slate-100/90">
            <thead>
              <tr>
                {["Chỉ số", "Tổng số", "Đạt", "Không đạt", "Chưa cập nhật", "Quá hạn", "Sắp đến hạn", "Gỉ sét thân", "Gỉ sét tay nắm", "% Đạt"].map(
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
                    <td className={`${TD_CLASS} text-right tabular-nums text-emerald-700`}>{r.dat}</td>
                    <td className={`${TD_CLASS} text-right tabular-nums text-rose-700`}>{r.khongDat}</td>
                    <td className={`${TD_CLASS} text-right tabular-nums text-muted-foreground`}>{r.chuaCapNhat || ""}</td>
                    <td className={`${TD_CLASS} text-right tabular-nums`}>{r.quaHanThayThe}</td>
                    <td className={`${TD_CLASS} text-right tabular-nums`}>{r.sapDenHan}</td>
                    <td className={`${TD_CLASS} text-right tabular-nums`}>{r.giSetThanBinh}</td>
                    <td className={`${TD_CLASS} text-right tabular-nums`}>{r.giSetTayNam}</td>
                    <td className={`${TD_CLASS} w-32`}>
                      <PercentBar value={r.phanTramDat} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>

          {/* Ron: công thức mới, tính từ ô ☑ thay cho 2 dòng nhập tay của sheet cũ */}
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.tcc.ron.map((r) => (
              <button
                key={r.loaiRon}
                type="button"
                disabled={!onDrill}
                onClick={drill({ bang: "TCC", loaiTu: r.loaiTu })}
                className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-sky-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:shadow-none"
                aria-label={`Mở danh sách tủ ${r.loaiTu} của ron ${r.loaiRon}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-navy">Ron chữa cháy {r.loaiRon}</p>
                  <StatusBadge status={r.thieuRon > 0 ? "Không đạt" : r.chuaCapNhat > 0 ? "Chưa cập nhật" : "Đạt"} />
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
                  <span className="text-slate-500">
                    Chưa cập nhật <b className="tabular-nums">{r.chuaCapNhat}</b>
                  </span>
                  {Object.entries(r.thieuRonTheoNhom)
                    .filter(([, n]) => n > 0)
                    .map(([g, n]) => (
                      <span key={g} className="text-muted-foreground">
                        {g}: {n}
                      </span>
                    ))}
                </div>
              </button>
            ))}
          </div>
          </div>

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-navy">Cơ cấu tình trạng</p>
            <p className="mt-1 text-xs text-slate-600">{bccTotal.tongSo} bình chữa cháy</p>
            <div className="relative h-[192px]" role="img" aria-label={`Tỷ lệ bình chữa cháy đạt: ${fmtPercent(bccTotal.phanTramDat, 0)}`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut} dataKey="value" nameKey="name" innerRadius={58} outerRadius={78} paddingAngle={2} strokeWidth={0} isAnimationActive={false}>
                    {donut.map((d) => (
                      <Cell key={d.name} fill={TONE_COLOR[d.tone]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [`${v} bình`, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[30px] font-bold leading-none tracking-tight tabular-nums text-navy">{fmtPercent(bccTotal.phanTramDat, 0)}</span>
                <span className="mt-1.5 text-xs text-slate-600">Tỷ lệ đạt</span>
              </div>
            </div>
            <ul className="space-y-3 border-t border-slate-100 pt-4">
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
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
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
          <p className="text-sm font-semibold text-navy">Nhóm linh kiện lỗi nhiều nhất</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">Xếp theo số ô lỗi · chạm hoặc rê chuột để xem</p>
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
                <Bar dataKey="huHong1Phan" name="Hư hỏng 1 phần" stackId="loi" fill={TONE_COLOR.watch} radius={[3, 0, 0, 3]} isAnimationActive={false} />
                <Bar dataKey="huHongHoanToan" name="Hư hỏng hoàn toàn" stackId="loi" fill={TONE_COLOR.bad} radius={[0, 3, 3, 0]} isAnimationActive={false} />
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

        {/* CUỘN VÒI — danh mục CON của tủ, nên nằm trong chính mục này thay vì có số
            La Mã riêng (giữ đúng bảy mục của sheet TỔNG QUAN gốc). Từ 2026-08-18 hai
            nhóm CUỘN ỐNG / LĂNG PHUN đã chuyển hẳn xuống đây, nên số liệu tủ phía trên
            KHÔNG còn tính hai nhóm đó nữa — xem TCC_ABSORBED_GROUPS. */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="mb-2.5 flex flex-wrap items-baseline gap-2">
            <h4 className="text-[13px] font-bold uppercase tracking-wide text-navy">Cuộn vòi chữa cháy (CVCC)</h4>
            <span className="text-[11px] text-muted-foreground">danh mục con của tủ · cuộn ống + lăng phun</span>
          </div>
          <div className="grid min-w-0 gap-3 xl:grid-cols-[240px_minmax(0,1fr)]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <StatCard
                label="Đạt"
                value={summary.cvcc.dat}
                hint={`trên ${summary.cvcc.tongSo} cuộn vòi`}
                tone="ok"
                icon={ShieldCheck}
                onClick={drill({ bang: "CVCC", tinhTrang: "Đạt" })}
              />
              {/* Cuộn vòi chỉ HAI mức theo TB 5100/TB-NĐDH, khác tủ vẫn ba mức. */}
              <StatCard
                label="Không đạt"
                value={summary.cvcc.khongDat}
                hint="cần xử lý"
                tone="bad"
                icon={AlertTriangle}
                onClick={drill({ bang: "CVCC", tinhTrang: "Không đạt" })}
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
                {summary.cvcc.theoNhom.length === 0 && (
                  <tr>
                    <td className={`${TD_CLASS} text-muted-foreground`} colSpan={4}>
                      Chưa có ô nào được tích trong kỳ này.
                    </td>
                  </tr>
                )}
                {summary.cvcc.theoNhom.map((g) => (
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
            <div key={b.ten} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
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
        <div className="grid min-w-0 gap-3 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <StatCard
              label="Đạt"
              value={summary.nnbc.dat}
              hint={`trên ${summary.nnbc.tongSo} nút nhấn`}
              tone="ok"
              icon={ShieldCheck}
              onClick={drill({ bang: "NNBC", tinhTrang: "Đạt" })}
            />
            <StatCard
              label="Không đạt"
              value={summary.nnbc.khongDat}
              hint="cần xử lý"
              tone="bad"
              icon={AlertTriangle}
              onClick={drill({ bang: "NNBC", tinhTrang: "Không đạt" })}
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
        <div className="grid min-w-0 gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-100/70 p-5" aria-label="Tổng hợp van chữa cháy">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Van khả dụng</p>
            <p className="mt-3 text-[40px] font-bold leading-none tracking-tight tabular-nums text-navy">{summary.van.total.khaDung}<span className="ml-2 text-lg font-medium text-slate-500">/ {summary.van.total.tongSo}</span></p>
            <p className="mt-2 text-xs text-slate-600">Tổng số van được quản lý</p>
          </div>
          <div className="mt-5 space-y-2.5 border-t border-slate-200 pt-4 text-xs">
            <p className="flex items-center justify-between gap-2"><span className="text-slate-600">Suy giảm, vẫn dùng được</span><b className="tabular-nums text-amber-700">{summary.van.total.suyGiam}</b></p>
            <p className="flex items-center justify-between gap-2"><span className="text-slate-600">Không khả dụng</span><b className="tabular-nums text-rose-700">{summary.van.total.khongKhaDung}</b></p>
            <p className="flex items-center justify-between gap-2"><span className="text-slate-600">Chưa cập nhật</span><b className="tabular-nums text-slate-600">{summary.van.total.chuaCapNhat}</b></p>
          </div>
        </aside>
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
        </div>
      </section>

      <PcccLightingOverview rows={summary.den} onDrill={onDrill} />
    </div>
  );
}
