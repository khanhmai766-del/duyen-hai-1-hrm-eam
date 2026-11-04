"use client";

// Bảng tra cứu tĩnh, chép nguyên số liệu đã tính sẵn (giá trị công thức đã "đóng băng" tại thời điểm
// mở file) từ sheet "Standard Line" trong file DH1- Tinh SHN PPA theo cong suat thuc te.xlsm.
// Đây chính là dữ liệu gốc mà lib/ppa-heat-rate.ts dùng để dựng đường cong PPA (CAPACITY_KW,
// BASE_PPA_2016, ANNUAL_DEGRADATION) — xem phần giải thích bên dưới bảng.

const loadLevels = { mw: [622.5, 591.375, 560.25, 529.125, 498, 466.875], factor: [1.0136, 1.009, 1.0045, 1, 0.9955, 0.9911] };

type BaseRow = { stt: number | null; label: string; p100: number; p75: number; p50: number; p40: number; p30: number; note: string | null };
const baseYearTable: BaseRow[] = [
  { stt: 1, label: "Công suất thô tổ máy", p100: 622500, p75: 466875, p50: 311266, p40: 249021, p30: 186785, note: "Lấy theo Heat Balance" },
  { stt: 2, label: "Suất hao nhiệt thô của Turbine", p100: 7988, p75: 8140, p50: 8496, p40: 8786, p30: 9113, note: "Tính theo Heat Balance" },
  { stt: 3, label: "Hiệu suất lò hơi", p100: 87.6, p75: 87.6, p50: 87.6, p40: 87.6, p30: 87.6, note: "Số liệu theo hợp đồng EPC (ADDENDUM No.2)" },
  { stt: 4, label: "Điện tự dùng + tổn thất máy biến áp", p100: 50519, p75: 39019, p50: 27520.18, p40: 22920.55, p30: 18321.59, note: "Số liệu theo hợp đồng EPC (ADDENDUM No.2)" },
  { stt: null, label: "Tự dùng cảng", p100: 3204, p75: 3204, p50: 3204, p40: 3204, p30: 3204, note: null },
  { stt: null, label: "Tổng tự dùng tính cả cảng cho 1 tổ máy", p100: 52121, p75: 40621, p50: 29122.18, p40: 24522.55, p30: 19923.59, note: null },
  { stt: null, label: "Phần trăm điện tự dùng", p100: 8.37, p75: 8.7, p50: 9.36, p40: 9.85, p30: 10.67, note: null },
  { stt: 5, label: "Hiệu suất truyền tải đường ống", p100: 99.5, p75: 99.5, p50: 99.5, p40: 99.5, p30: 99.5, note: null },
  { stt: 6, label: "Suất hao nhiệt thô của tổ máy", p100: 9164.54, p75: 9338.93, p50: 9747.37, p40: 10080.08, p30: 10455.24, note: "Lò hơi, tuabin, truyền tải" },
  { stt: 7, label: "Suất tiêu hao nhiệt tinh của tổ máy", p100: 10002, p75: 10228.91, p50: 10753.47, p40: 11181.15, p30: 11703.62, note: null },
  { stt: 8, label: "Tổng tổn thất SHN do tổn thất hơi thổi bụi, sấy dầu, dùng hơi phụ tải khác và giảm hiệu suất lò lúc thí nghiệm", p100: 1.2, p75: 1.2, p50: 1.2, p40: 1.2, p30: 1.2, note: null },
  { stt: 9, label: "Tỷ lệ hao hụt than do tự cháy tại kho + hao hụt bốc dỡ, lưu kho", p100: 0, p75: 0, p50: 0, p40: 0, p30: 0, note: null },
  { stt: 10, label: "SHN có tính đến các tổn thất theo điều kiện vận hành thực tế tại năm cơ sở", p100: 10122.02, p75: 10351.66, p50: 10882.51, p40: 11315.33, p30: 11844.06, note: null },
  { stt: 11, label: "SHN có tính đến các tổn thất theo điều kiện vận hành thực tế tại năm cơ sở (dòng lặp lại trong file gốc)", p100: 10122.02, p75: 10351.66, p50: 10882.51, p40: 11315.33, p30: 11844.06, note: null },
  { stt: 12, label: "Nhiệt trị than", p100: 4479.84, p75: 4479.84, p50: 4479.84, p40: 4479.84, p30: 4479.84, note: "Than tối thiểu nhiệt khô 4800, hợp đồng mua bán điện tăng 2%, độ ẩm than 8,5 theo TCVN" },
  { stt: 13, label: "Suất hao than", p100: 539.77, p75: 552.01, p50: 580.32, p40: 603.4, p30: 631.6, note: "Hệ số chuyển đổi cal/g sang j/g là 4,186 (theo hợp đồng)" },
];

type YearRow = { label: string; year: number; growthPct: number; p100: number; p95: number; p90: number; p85: number; p80: number; p75: number; p70: number; p50: number; sht100: number; sht85: number; sht75: number };
const yearTable: YearRow[] = [
  { label: "Năm cơ sở", year: 2016, growthPct: 0, p100: 10122.02, p95: 10167.95, p90: 10213.88, p85: 10259.8, p80: 10305.73, p75: 10351.66, p70: 10457.83, p50: 10882.51, sht100: 539.77, sht85: 547.11, sht75: 552.01 },
  { label: "Năm thứ 2", year: 2017, growthPct: 0.0897, p100: 10131.1, p95: 10177.06, p90: 10223.03, p85: 10269, p80: 10314.97, p75: 10360.94, p70: 10467.2, p50: 10892.26, sht100: 540.25, sht85: 547.6, sht75: 552.51 },
  { label: "Năm thứ 3", year: 2018, growthPct: 0.1793, p100: 10140.17, p95: 10186.18, p90: 10232.19, p85: 10278.2, p80: 10324.21, p75: 10370.22, p70: 10476.58, p50: 10902.02, sht100: 540.73, sht85: 548.09, sht75: 553 },
  { label: "Năm thứ 4", year: 2019, growthPct: 0.269, p100: 10149.25, p95: 10195.3, p90: 10241.35, p85: 10287.4, p80: 10333.45, p75: 10379.5, p70: 10485.96, p50: 10911.78, sht100: 541.22, sht85: 548.58, sht75: 553.5 },
  { label: "Năm thứ 5", year: 2020, growthPct: 0.3586, p100: 10158.32, p95: 10204.41, p90: 10250.5, p85: 10296.6, p80: 10342.69, p75: 10388.78, p70: 10495.33, p50: 10921.53, sht100: 541.7, sht85: 549.08, sht75: 553.99 },
  { label: "Năm thứ 6", year: 2021, growthPct: 0.4483, p100: 10167.4, p95: 10213.53, p90: 10259.66, p85: 10305.79, p80: 10351.93, p75: 10398.06, p70: 10504.71, p50: 10931.29, sht100: 542.19, sht85: 549.57, sht75: 554.49 },
  { label: "Năm thứ 7", year: 2022, growthPct: 0.5379, p100: 10176.47, p95: 10222.64, p90: 10268.82, p85: 10314.99, p80: 10361.17, p75: 10407.34, p70: 10514.08, p50: 10941.05, sht100: 542.67, sht85: 550.06, sht75: 554.98 },
  { label: "Năm thứ 8", year: 2023, growthPct: 0.6276, p100: 10185.54, p95: 10231.76, p90: 10277.98, p85: 10324.19, p80: 10370.41, p75: 10416.62, p70: 10523.46, p50: 10950.8, sht100: 543.15, sht85: 550.55, sht75: 555.48 },
  { label: "Năm thứ 9", year: 2024, growthPct: 0.7172, p100: 10194.62, p95: 10240.88, p90: 10287.13, p85: 10333.39, p80: 10379.65, p75: 10425.9, p70: 10532.84, p50: 10960.56, sht100: 543.64, sht85: 551.04, sht75: 555.97 },
  { label: "Năm thứ 10", year: 2025, growthPct: 0.8069, p100: 10203.69, p95: 10249.99, p90: 10296.29, p85: 10342.59, p80: 10388.89, p75: 10435.18, p70: 10542.21, p50: 10970.32, sht100: 544.12, sht85: 551.53, sht75: 556.47 },
  { label: "Năm thứ 11", year: 2026, growthPct: 0.8966, p100: 10212.77, p95: 10259.11, p90: 10305.45, p85: 10351.79, p80: 10398.13, p75: 10444.47, p70: 10551.59, p50: 10980.07, sht100: 544.61, sht85: 552.02, sht75: 556.96 },
  { label: "Năm thứ 12", year: 2027, growthPct: 0.9862, p100: 10221.84, p95: 10268.22, p90: 10314.61, p85: 10360.99, p80: 10407.37, p75: 10453.75, p70: 10560.96, p50: 10989.83, sht100: 545.09, sht85: 552.51, sht75: 557.46 },
  { label: "Năm thứ 13", year: 2028, growthPct: 1.0759, p100: 10230.92, p95: 10277.34, p90: 10323.76, p85: 10370.18, p80: 10416.61, p75: 10463.03, p70: 10570.34, p50: 10999.59, sht100: 545.57, sht85: 553, sht75: 557.95 },
  { label: "Năm thứ 14", year: 2029, growthPct: 1.1655, p100: 10239.99, p95: 10286.46, p90: 10332.92, p85: 10379.38, p80: 10425.84, p75: 10472.31, p70: 10579.72, p50: 11009.35, sht100: 546.06, sht85: 553.49, sht75: 558.45 },
  { label: "Năm thứ 15", year: 2030, growthPct: 1.2552, p100: 10249.07, p95: 10295.57, p90: 10342.08, p85: 10388.58, p80: 10435.08, p75: 10481.59, p70: 10589.09, p50: 11019.1, sht100: 546.54, sht85: 553.98, sht75: 558.94 },
  { label: "Năm thứ 16", year: 2031, growthPct: 1.3448, p100: 10258.14, p95: 10304.69, p90: 10351.23, p85: 10397.78, p80: 10444.32, p75: 10490.87, p70: 10598.47, p50: 11028.86, sht100: 547.02, sht85: 554.47, sht75: 559.44 },
  { label: "Năm thứ 17", year: 2032, growthPct: 1.4345, p100: 10267.22, p95: 10313.81, p90: 10360.39, p85: 10406.98, p80: 10453.56, p75: 10500.15, p70: 10607.84, p50: 11038.62, sht100: 547.51, sht85: 554.96, sht75: 559.93 },
  { label: "Năm thứ 18", year: 2033, growthPct: 1.5241, p100: 10276.29, p95: 10322.92, p90: 10369.55, p85: 10416.18, p80: 10462.8, p75: 10509.43, p70: 10617.22, p50: 11048.37, sht100: 547.99, sht85: 555.45, sht75: 560.42 },
  { label: "Năm thứ 19", year: 2034, growthPct: 1.6138, p100: 10285.37, p95: 10332.04, p90: 10378.71, p85: 10425.37, p80: 10472.04, p75: 10518.71, p70: 10626.59, p50: 11058.13, sht100: 548.48, sht85: 555.94, sht75: 560.92 },
  { label: "Năm thứ 20", year: 2035, growthPct: 1.7034, p100: 10294.44, p95: 10341.15, p90: 10387.86, p85: 10434.57, p80: 10481.28, p75: 10527.99, p70: 10635.97, p50: 11067.89, sht100: 548.96, sht85: 556.43, sht75: 561.41 },
  { label: "Năm thứ 21", year: 2036, growthPct: 1.7931, p100: 10303.52, p95: 10350.27, p90: 10397.02, p85: 10443.77, p80: 10490.52, p75: 10537.27, p70: 10645.35, p50: 11077.64, sht100: 549.44, sht85: 556.92, sht75: 561.91 },
  { label: "Năm thứ 22", year: 2037, growthPct: 1.8828, p100: 10312.59, p95: 10359.39, p90: 10406.18, p85: 10452.97, p80: 10499.76, p75: 10546.55, p70: 10654.72, p50: 11087.4, sht100: 549.93, sht85: 557.41, sht75: 562.4 },
  { label: "Năm thứ 23", year: 2038, growthPct: 1.9724, p100: 10321.67, p95: 10368.5, p90: 10415.34, p85: 10462.17, p80: 10509, p75: 10555.83, p70: 10664.1, p50: 11097.16, sht100: 550.41, sht85: 557.9, sht75: 562.9 },
  { label: "Năm thứ 24", year: 2039, growthPct: 2.0621, p100: 10330.74, p95: 10377.62, p90: 10424.49, p85: 10471.37, p80: 10518.24, p75: 10565.12, p70: 10673.47, p50: 11106.91, sht100: 550.9, sht85: 558.4, sht75: 563.39 },
  { label: "Năm thứ 25", year: 2040, growthPct: 2.1517, p100: 10339.82, p95: 10386.73, p90: 10433.65, p85: 10480.57, p80: 10527.48, p75: 10574.4, p70: 10682.85, p50: 11116.67, sht100: 551.38, sht85: 558.89, sht75: 563.89 },
  { label: "Năm thứ 26", year: 2041, growthPct: 2.2414, p100: 10348.89, p95: 10395.85, p90: 10442.81, p85: 10489.76, p80: 10536.72, p75: 10583.68, p70: 10692.23, p50: 11126.43, sht100: 551.86, sht85: 559.38, sht75: 564.38 },
  { label: "Năm thứ 27", year: 2042, growthPct: 2.331, p100: 10357.97, p95: 10404.97, p90: 10451.96, p85: 10498.96, p80: 10545.96, p75: 10592.96, p70: 10701.6, p50: 11136.18, sht100: 552.35, sht85: 559.87, sht75: 564.88 },
  { label: "Năm thứ 28", year: 2043, growthPct: 2.4207, p100: 10367.04, p95: 10414.08, p90: 10461.12, p85: 10508.16, p80: 10555.2, p75: 10602.24, p70: 10710.98, p50: 11145.94, sht100: 552.83, sht85: 560.36, sht75: 565.37 },
  { label: "Năm thứ 29", year: 2044, growthPct: 2.5103, p100: 10376.12, p95: 10423.2, p90: 10470.28, p85: 10517.36, p80: 10564.44, p75: 10611.52, p70: 10720.35, p50: 11155.7, sht100: 553.32, sht85: 560.85, sht75: 565.87 },
  { label: "Năm thứ 30", year: 2045, growthPct: 2.6, p100: 10385.19, p95: 10432.31, p90: 10479.44, p85: 10526.56, p80: 10573.68, p75: 10620.8, p70: 10729.73, p50: 11165.45, sht100: 553.8, sht85: 561.34, sht75: 566.36 },
];

// 5 sơ đồ cân bằng nhiệt gốc (đính kèm trong sheet Excel cạnh Bảng 1), lưu tại public/ppa-standard-line/.
const heatBalanceDiagrams = [
  { load: 100, loadKw: 622510, heatRate: 7988, throttleFlow: 1929260, src: "/ctktkt/ppa-standard-line/heat-balance-100.png" },
  { load: 75, loadKw: 466897, heatRate: 8140, throttleFlow: 1397980, src: "/ctktkt/ppa-standard-line/heat-balance-75.png" },
  { load: 50, loadKw: 311266, heatRate: 8496, throttleFlow: 925100, src: "/ctktkt/ppa-standard-line/heat-balance-50.png" },
  { load: 40, loadKw: 249021, heatRate: 8786, throttleFlow: 761600, src: "/ctktkt/ppa-standard-line/heat-balance-40.png" },
  { load: 30, loadKw: 186785, heatRate: 9113, throttleFlow: 575700, src: "/ctktkt/ppa-standard-line/heat-balance-30.png" },
];

const numberFormat = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmt = (value: number | null) => value === null ? "—" : numberFormat.format(value);
const CURRENT_YEAR = new Date().getFullYear();

export function PpaStandardLineReference() {
  return <section className="space-y-4">
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#557187]">Tài liệu tham khảo</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#18233d]">Sheet &quot;Standard Line&quot; — đường cong Suất hao nhiệt (SHN) theo PPA</h1>
      <p className="mt-1 text-sm text-slate-500">Chép nguyên số liệu đã tính từ file Excel gốc (DH1- Tinh SHN PPA...xlsm, sheet &quot;Standard Line&quot;) để tra cứu khi cần, không cần mở lại file Excel.</p>
    </div>

    <div className="space-y-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-[#1c3a5e]">
      <p className="font-bold">Sheet này dùng để làm gì?</p>
      <p>Đây là bảng gốc xác lập <b>đường cong SHN theo PPA</b> (hợp đồng mua bán điện) của tổ máy DH1 — tức mức tiêu hao nhiệt &quot;chuẩn&quot; mà nhà máy phải đạt được ứng với từng mức tải, dùng làm căn cứ so sánh với SHN thực tế vận hành hằng ngày (mục &quot;So sánh SHN PPA &amp; thực tế&quot;).</p>
      <p>Toàn bộ số liệu web đang dùng để tính &quot;SHN theo PPA&quot; mỗi ngày (nội suy theo tải thực tế của từng chu kỳ 30 phút) đều lấy trực tiếp từ 2 bảng bên dưới — không phải số ước lượng.</p>
    </div>

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-[#f8fafc] px-4 py-3"><h2 className="font-extrabold text-[#20345f]">Mức tải quy đổi (dòng 1–2 đầu sheet)</h2></div>
      <div className="overflow-x-auto p-3">
        <table className="report-data-table w-full min-w-[520px] text-xs">
          <thead><tr className="bg-[#dcebf5] text-[#173b64]"><th className="p-2 text-left">Chỉ tiêu</th>{loadLevels.mw.map((mw, index) => <th key={index} className="p-2 text-center font-bold">{fmt(mw)} MW</th>)}</tr></thead>
          <tbody>
            <tr className="border-t"><td className="p-2 font-semibold text-black">Mức tải (MW)</td>{loadLevels.mw.map((mw, index) => <td key={index} className="p-2 text-center text-black">{fmt(mw)}</td>)}</tr>
            <tr className="border-t"><td className="p-2 font-semibold text-black">Hệ số chuyển đổi</td>{loadLevels.factor.map((factor, index) => <td key={index} className="p-2 text-center text-black">{numberFormat.format(factor)}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <p className="border-t bg-[#fbfcfd] px-4 py-2 text-xs text-slate-500">Hệ số quy đổi giữa các mốc tải phụ, không trực tiếp dùng trong công thức tính SHN theo PPA của web — chép lại để tham khảo đầy đủ theo đúng sheet gốc.</p>
    </div>

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-[#f8fafc] px-4 py-3">
        <h2 className="font-extrabold text-[#20345f]">Bảng 1 — Tính SHN năm cơ sở (theo biên bản họp với các đơn vị)</h2>
        <p className="mt-0.5 text-xs text-slate-500">Năm cơ sở = 2016. Xác lập mức SHN chuẩn tại 5 mốc tải: 100% (622.500 kW), 75% (466.875 kW), 50% (311.266 kW), 40% và 30%.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="report-data-table w-full min-w-[920px] text-xs">
          <thead><tr className="bg-[#dcebf5] text-[#173b64]"><th className="w-10 p-2 text-center">STT</th><th className="p-2 text-left">Chỉ tiêu</th><th className="p-2 text-center">100%</th><th className="p-2 text-center">75%</th><th className="p-2 text-center">50%</th><th className="p-2 text-center">40%</th><th className="p-2 text-center">30%</th><th className="p-2 text-left">Ghi chú</th></tr></thead>
          <tbody>
            {baseYearTable.map((row, index) => <tr key={index} className={`border-t ${row.stt === 10 || row.stt === 11 ? "bg-amber-50" : ""}`}>
              <td className="p-2 text-center text-black">{row.stt ?? ""}</td>
              <td className="p-2 text-black">{row.label}</td>
              <td className="p-2 text-center font-semibold text-black">{fmt(row.p100)}</td>
              <td className="p-2 text-center text-black">{fmt(row.p75)}</td>
              <td className="p-2 text-center text-black">{fmt(row.p50)}</td>
              <td className="p-2 text-center text-black">{fmt(row.p40)}</td>
              <td className="p-2 text-center text-black">{fmt(row.p30)}</td>
              <td className="max-w-[260px] p-2 text-[11px] text-slate-600">{row.note || "—"}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <p className="border-t bg-amber-50 px-4 py-2 text-xs text-amber-900">Hàng tô vàng (STT 10–11) là <b>3 giá trị gốc</b> web dùng làm hằng số <code className="rounded bg-white px-1">BASE_PPA_2016</code> trong code (100% → 10.122,02; 75% → 10.351,66; 50% → 10.882,51 kJ/kWh) — trùng khớp tuyệt đối với file Excel.</p>
    </div>

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-[#f8fafc] px-4 py-3">
        <h2 className="font-extrabold text-[#20345f]">Sơ đồ cân bằng nhiệt (Heat Balance) — 5 mốc tải</h2>
        <p className="mt-0.5 text-xs text-slate-500">Chép nguyên 5 sơ đồ gốc đính kèm bên cạnh Bảng 1 trong file Excel (Duyen Hai 1 Thermal Power Project, Đông Phương chế tạo turbine). Đây là căn cứ kỹ thuật cho các số Công suất/Suất hao nhiệt thô ở Bảng 1.</p>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {heatBalanceDiagrams.map(diagram => <div key={diagram.load} className="overflow-hidden rounded-xl border border-slate-200">
          <div className="border-b bg-slate-50 px-3 py-2">
            <p className="text-sm font-extrabold text-[#20345f]">Tải {diagram.load}% ({fmt(diagram.loadKw)} kW)</p>
            <p className="text-xs text-slate-500">Heat rate: {fmt(diagram.heatRate)} kJ/kWh · Throttle flow: {fmt(diagram.throttleFlow)} kg/h</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={diagram.src} alt={`Sơ đồ cân bằng nhiệt tải ${diagram.load}%`} className="w-full bg-white" loading="lazy"/>
        </div>)}
      </div>
    </div>

    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 shadow-sm">
      <p><b>Tỷ lệ suy giảm hiệu suất theo Thông tư 07/2024/TT-BCT (12/4/2024):</b> bình quân cả đời dự án 1,3% (30 năm), tương đương <b>0,0897%/năm</b> — đây chính là hằng số <code className="rounded bg-slate-100 px-1">ANNUAL_DEGRADATION</code> trong code, dùng để &quot;lão hoá&quot; dần đường cong SHN theo từng năm vận hành so với năm cơ sở 2016.</p>
    </div>

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-[#f8fafc] px-4 py-3">
        <h2 className="font-extrabold text-[#20345f]">Bảng 2 — SHN các năm tiếp theo ở các mức tải (2016–2045)</h2>
        <p className="mt-0.5 text-xs text-slate-500">SHN (kJ/kWh) tại 8 mốc tải và Suất hao than — SHT (g/kWh) tại 3 mốc tải, cho từng năm trong 30 năm đời dự án.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="report-data-table w-full min-w-[1180px] text-xs">
          <thead>
            <tr className="bg-[#dcebf5] text-[#173b64]">
              <th rowSpan={2} className="p-2 text-left align-bottom">Năm</th>
              <th rowSpan={2} className="p-2 text-center align-bottom">Hệ số tăng SHN</th>
              <th colSpan={8} className="border-l border-white/60 p-2 text-center">SHN theo mức tải (kJ/kWh)</th>
              <th colSpan={3} className="border-l border-white/60 p-2 text-center">SHT (g/kWh)</th>
            </tr>
            <tr className="bg-[#eaf3fa] text-[#173b64]">
              {["100%", "95%", "90%", "85%", "80%", "75%", "70%", "50%", "100%", "85%", "75%"].map((label, index) => <th key={index} className="border-l border-white/60 p-1.5 text-center font-semibold">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {yearTable.map(row => <tr key={row.year} className={`border-t ${row.year === CURRENT_YEAR ? "bg-red-50 font-bold" : ""}`}>
              <td className="p-2 text-black">{row.label} ({row.year}){row.year === CURRENT_YEAR && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-extrabold text-red-800">Năm hiện tại</span>}</td>
              <td className="p-1.5 text-center text-black">{numberFormat.format(row.growthPct)}%</td>
              <td className="border-l p-1.5 text-center text-black">{fmt(row.p100)}</td>
              <td className="p-1.5 text-center text-black">{fmt(row.p95)}</td>
              <td className="p-1.5 text-center text-black">{fmt(row.p90)}</td>
              <td className="p-1.5 text-center text-black">{fmt(row.p85)}</td>
              <td className="p-1.5 text-center text-black">{fmt(row.p80)}</td>
              <td className="p-1.5 text-center text-black">{fmt(row.p75)}</td>
              <td className="p-1.5 text-center text-black">{fmt(row.p70)}</td>
              <td className="p-1.5 text-center text-black">{fmt(row.p50)}</td>
              <td className="border-l p-1.5 text-center text-black">{fmt(row.sht100)}</td>
              <td className="p-1.5 text-center text-black">{fmt(row.sht85)}</td>
              <td className="p-1.5 text-center text-black">{fmt(row.sht75)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>

    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 shadow-sm">
      <p className="font-bold text-[#20345f]">Web tính &quot;SHN theo PPA&quot; hằng ngày như thế nào từ bảng này?</p>
      <p>Với mỗi chu kỳ 30 phút, web lấy sản lượng đầu cực (công tơ) của chu kỳ đó, quy ra công suất (kW), rồi <b>nội suy tuyến tính</b> giữa 2 mốc tải gần nhất trên đường cong của năm vận hành: nếu tải trên 75% thì nội suy giữa mốc 100% và 75%; nếu từ 50–75% thì nội suy giữa mốc 75% và 50%. SHN theo PPA của cả ngày là tổng nhiệt lượng quy đổi chia cho tổng sản lượng điểm bán cả ngày.</p>
      <p>Đường cong của từng năm được suy ra bằng cách nhân 3 giá trị gốc năm 2016 (Bảng 1, dòng 10) với hệ số tăng tương ứng của năm đó (Bảng 2, cột &quot;Hệ số tăng SHN&quot;) — đúng bằng cách tính trong sheet Excel.</p>
    </div>
  </section>;
}
