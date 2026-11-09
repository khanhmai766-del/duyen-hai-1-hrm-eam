"use client";
// Trang Chỉ tiêu KTKT: khung trang + dải tab. Mỗi nhóm chỉ tiêu ở ctktkt-report/tab-*.tsx, khối KPI Cụm 1 ở kpi-section.tsx,
// state/logic ở ctktkt-report/use-ctktkt-report.tsx (ctx truyền xuống), hằng/hàm chung ở ctktkt-report/shared.tsx.
import { ReportCorrections } from "./report-corrections";
import { fetchStoredCtktktReport } from "@/hooks/useKtktReport";
import { Download, Save, Search, Zap, Flame, Droplets, Boxes, Power, FileText, UserCheck, RefreshCw, Mail, FileSpreadsheet } from "lucide-react";
import { DateField } from "@/modules/ctktkt/components/ui/date-field";
import { saveReviewedCoalEntries } from "@/modules/ctktkt/lib/coal-photo-save";
import { canEditOperatingDate, vietnamDateIso } from "@/modules/ctktkt/lib/operating-date";
import { isAdminUser } from "@/modules/ctktkt/lib/auth/session";
import { canEditCtktktField } from "@/modules/ctktkt/lib/ctktkt-permissions";
import { ExportMissingDialog } from "@/modules/ctktkt/components/export-missing-dialog";
import { GoogleMirrorLinks } from "@/modules/ctktkt/components/google-mirror-links";
import { CtktktEmailModal, CoalMeterPhotoImport, CoalMeterPhotoReview, editableFields, reportTabClass } from "./ctktkt-report/shared";
import { useCtktktReport } from "./ctktkt-report/use-ctktkt-report";
import { CtktktTkdDcsTab } from "./ctktkt-report/tab-tkd-dcs";
import { CtktktUnitMetersTab } from "./ctktkt-report/tab-unit-meters";
import { CtktktSteamNh3Tab } from "./ctktkt-report/tab-steam-nh3";
import { CtktktTd21CoalBlendTab } from "./ctktkt-report/tab-td21-coal-blend";
import { CtktktStartupShutdownTab } from "./ctktkt-report/tab-startup-shutdown";
import { CtktktPmisReportsTab } from "./ctktkt-report/tab-pmis-reports";
import { CtktktAllFieldsTab } from "./ctktkt-report/tab-all-fields";
import { CtktktKpiSection } from "./ctktkt-report/kpi-section";

export function CtktktReport() {
  const ctx = useCtktktReport();
  const { saveReport, user, date, setDate, canEditSelectedDate, userCanEditAny, setByDate, activeTab, setActiveTab, unitView, loading, setLoading, extrasState, setReloadVersion, saving, setSaving, dirty, setDirty, message, setMessage, error, setError, showEmailModal, setShowEmailModal, exportMissingOpen, setExportMissingOpen, exportMissingItems, setPendingReportOutput, coalPhotoOpen, coalReviewUnit, setCoalReviewUnit, coalPhotoMounted, setCoalPhotoOpen, canEditCoalCell, syncingPmis, dirtyCellsRef, draftWarning, acknowledgeSaved, previousDate, previous, current, selectedWarnings, hasPreviousManualData, beginCtktktOutput, continueCtktktOutput, returnToCtktktMissingInput, update, save, userRoleDescription } = ctx;

  return (
    <section className="module-report mx-auto grid w-full min-w-0 max-w-full gap-3">
      <ExportMissingDialog
        open={exportMissingOpen}
        items={exportMissingItems}
        title={`Báo cáo Chỉ tiêu KTKT ngày ${date.split("-").reverse().join("/")}`}
        onClose={() => { setExportMissingOpen(false); setPendingReportOutput(null); }}
        onItemClick={returnToCtktktMissingInput}
        onFillMissing={returnToCtktktMissingInput}
        onExportAnyway={continueCtktktOutput}
      />
      {/* 1. THANH TIÊU ĐỀ, CHỌN NGÀY VÀ ĐIỀU HÀNH */}
      <div className="module-hero ktkt-dark-hero min-w-0 rounded-2xl p-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Nhãn mục (cùng nền với khối "Bảng theo dõi lượng nước sử dụng"); nhóm ngày + nút canh phải. */}
          <div className="module-heading-copy ktkt-section-title"><h2><FileSpreadsheet className="size-5" aria-hidden />CHỈ TIÊU KTKT</h2></div>
          <div className="ml-auto flex flex-[1_1_360px] flex-wrap content-center items-center justify-end gap-2">
            <label className="flex items-center gap-2 text-xs font-bold">
              <span className="ktkt-hero-label">Ngày báo cáo:</span>
              <DateField
                value={date}
                max={vietnamDateIso()}
                disabled={saving || syncingPmis}
                onChange={value => {
                  if (value === date) return;
                  if (dirtyCellsRef.current.size > 0 || saving) {
                    setError("Hãy lưu số liệu ngày đang nhập trước khi chuyển sang ngày khác.");
                    return;
                  }
                  setLoading(true);
                  setDate(value);
                  dirtyCellsRef.current.clear();
                  setDirty(false);
                  setMessage("");
                  setError("");
                }}
                className="w-36"
              />
            </label>

            <button
              type="button"
              onClick={save}
              disabled={!userCanEditAny || saving || loading || !dirty}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-[#4057b5] px-4 text-xs font-bold text-white shadow-xs transition-all hover:bg-[#334694] disabled:opacity-45"
            >
              <Save className="size-3.5" />
              {saving ? "Đang lưu…" : "Lưu số liệu"}
            </button>

            <button
              type="button"
              onClick={() => beginCtktktOutput("excel")}
              disabled={loading||extrasState!=="ready"}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-emerald-800"
            >
              <Download className="size-3.5" />
              Xuất Excel tháng
            </button>

            <button
              type="button"
              onClick={() => beginCtktktOutput("email")}
              disabled={loading||extrasState!=="ready"}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-blue-700 active:scale-95"
              title="Mở mẫu báo cáo gửi mail hàng ngày font Times New Roman theo file chỉ tiêu"
            >
              <Mail className="size-3.5" />
              Báo cáo gửi mail
            </button>

            {/* Yêu cầu chỉnh sửa sau ca (quản trị duyệt): một nút, bấm mở hộp thoại. */}
            <ReportCorrections key={date} date={date} getStaged={()=>[...dirtyCellsRef.current].filter(cell=>canEditCtktktField(user,cell)).map(cell=>({cell,value:current[cell]||""}))} onUpdated={()=>setReloadVersion(v=>v+1)}/>

            {/* Nút xem Google Sheets của báo cáo (thay khung xanh riêng trên trang này). */}
            <GoogleMirrorLinks module="ctktkt" variant="inline" />

            {/* Trạng thái tải số liệu tổng hợp nằm trong chú thích của nút (thay dải xám riêng phía trên). */}
            {extrasState!=="ready"&&(()=>{
              const busy=loading||extrasState==="loading";
              const note=loading?"Đang tải số liệu ngày…":extrasState==="loading"?"Số liệu ngày đã sẵn sàng. Đang tải tiếp tồn kho và giờ lũy kế…":"Chưa tải đủ số liệu tổng hợp. Hãy lưu ô đang nhập rồi tải lại trước khi xuất báo cáo.";
              return <button type="button" title={note} aria-label={busy?note:`Tải lại dữ liệu — ${note}`} disabled={busy||dirty||saving||syncingPmis} onClick={()=>{setError("");setReloadVersion(v=>v+1);}}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-60">
                <RefreshCw className={`size-3.5 ${busy?"animate-spin":""}`} />{busy?"Đang tải…":"Tải lại dữ liệu"}
              </button>;
            })()}
          </div>
        </div>

        {/* Banner thông tin cương vị & phân quyền */}
        {/* Một hàng: quyền của tài khoản + chú thích màu ô / phím tắt. Tên và cương vị đã có ở góc trên trang nên bỏ. */}
        <div className="ktkt-role-banner mt-3 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-indigo-100 bg-[#f5f8ff] px-3.5 py-2 text-xs text-[#1e3a8a] min-[1440px]:flex-nowrap">
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <UserCheck className="size-4 text-indigo-700 shrink-0" />
            <span className="font-medium text-slate-600">{userRoleDescription}</span>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-500 min-[1440px]:flex-nowrap min-[1440px]:whitespace-nowrap">
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-blue-500"></span>
              Ô xanh: Lấy từ BCSX
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-indigo-600"></span>
              Ô trắng: Nhập tay
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-slate-300"></span>
              Ô xám/khóa: Tự tính / Cương vị khác
            </span>
            <span title="Phím mũi tên (← ↑ → ↓) / Enter để chuyển ô · Dán Ctrl+V nhiều ô từ Excel"
              className="min-w-0 truncate rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-800">
              ⌨️ ←↑→↓ / Enter chuyển ô · Ctrl+V dán nhiều ô
            </span>
          </div>
        </div>

        {!canEditSelectedDate && !loading && (
          <p role="status" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            {date === vietnamDateIso()
              ? "Ngày D đang khóa nhập. Chỉ nhập số liệu từ ngày D-1 trở về trước."
              : "Ngày trước D-1 chỉ tài khoản quản trị được chỉnh sửa; tài khoản hiện tại chỉ xem."}
          </p>
        )}

        {!hasPreviousManualData && !loading && (
          <p className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            Chưa có chỉ số ngày trước ({previousDate}), các giá trị chênh lệch công tơ tạm
            hiển thị “—”. Hãy nhập ngày trước trước khi chốt báo cáo.
          </p>
        )}
        {selectedWarnings.map(item => (
          <p
            key={`${item.cell}-${item.message}`}
            role="alert"
            className="mt-2 whitespace-pre-line rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800"
          >
            {item.message}
          </p>
        ))}
        {draftWarning && <p role="alert" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">{draftWarning}</p>}
        {error && (
          <p
            role="alert"
            className="mt-2 whitespace-pre-line rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800"
          >
            {error}
            {error.includes("Yêu cầu chỉnh sửa") && <button type="button" className="mt-2 block min-h-10 rounded-lg border border-red-300 bg-white px-3 font-semibold" onClick={() => {
              window.dispatchEvent(new Event("ktkt-open-correction"));
            }}>Mở yêu cầu duyệt — bấm “Lấy … ô đang sửa trên báo cáo”</button>}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900"
          >
            {message}
          </p>
        )}
      </div>

      {/* 2. BẢNG KẾT QUẢ TÍNH TỰ ĐỘNG KPI & Ô NHẬP TAY CỤM 1 (I35, I36, W87) */}
      <CtktktKpiSection ctx={ctx} />

      {/* 3. TABS ĐIỀU HƯỚNG CÁC CỤM VẬN HÀNH (THIẾT KẾ RÕ RÀNG THEO CƯƠNG VỊ) */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {/* Một hàng tab, chữ không xuống dòng; màn hẹp thì cuộn ngang thay vì xếp nhiều hàng. */}
        <div className="flex gap-1 overflow-x-auto max-[1699px]:[&_svg]:hidden border-b bg-[#fbf7f2] p-2">
          <button
            type="button"
            onClick={() => setActiveTab("tkd_dcs")}
            className={reportTabClass(activeTab === "tkd_dcs")}
          >
            <Zap className="size-4 shrink-0" />
            <span>DCS P/Q/U và lượng nước 24h</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("unit_meters")}
            className={reportTabClass(activeTab === "unit_meters")}
          >
            <Power className="size-4 shrink-0" />
            <span>Công tơ điện/than/dầu</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("steam_nh3")}
            className={reportTabClass(activeTab === "steam_nh3")}
          >
            <Droplets className="size-4 shrink-0" />
            <span>Tiêu hao hơi và NH3</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("td21_coal_blend")}
            className={reportTabClass(activeTab === "td21_coal_blend")}
          >
            <Boxes className="size-4 shrink-0" />
            <span>TD21 và tính toán than</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("startup_shutdown")}
            className={reportTabClass(activeTab === "startup_shutdown")}
          >
            <Flame className="size-4 shrink-0" />
            <span>Khởi động/ngừng tổ máy</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pmis_reports")}
            className={reportTabClass(activeTab === "pmis_reports")}
          >
            <FileText className="size-4 shrink-0" />
            <span>Báo cáo từ PMIS</span>
          </button>

          <div className="flex flex-1 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("all_fields")}
              className={`${reportTabClass(activeTab === "all_fields")} w-full`}
            >
              <Search className="size-4 shrink-0" />
              <span>Tra cứu ô ({editableFields.length})</span>
            </button>
          </div>
        </div>

        {/* NỘI DUNG TỪNG CỤM */}
        <div className="p-3">
          {/* ========================================================================= */}
          {activeTab === "tkd_dcs" && <CtktktTkdDcsTab ctx={ctx} />}

          {/* ========================================================================= */}
          {/* TAB 2: CỤM 4 & 5 — CÔNG TƠ TỔ MÁY S1 & S2 (TPD, LÒ PHÓ, MÁY NGHIỀN)        */}
          {/* ========================================================================= */}
          {activeTab === "unit_meters" && <CtktktUnitMetersTab ctx={ctx} />}

          {/* ========================================================================= */}
          {/* TAB 3: CỤM 6 & 8 — LƯU LƯỢNG HƠI & BỒN NH3                                 */}
          {/* ========================================================================= */}
          {activeTab === "steam_nh3" && <CtktktSteamNh3Tab ctx={ctx} />}

          {/* ========================================================================= */}
          {/* TAB 4: CỤM 9 & 14 — ĐIỆN TỰ DÙNG TD21 & THAN TRỘN PMIS                     */}
          {/* ========================================================================= */}
          {activeTab === "td21_coal_blend" && <CtktktTd21CoalBlendTab ctx={ctx} />}

          {/* ========================================================================= */}
          {/* TAB 5: CỤM 11 — BẢNG CÔNG TƠ THEO SỰ KIỆN                                  */}
          {/* ========================================================================= */}
          {activeTab === "startup_shutdown" && <CtktktStartupShutdownTab ctx={ctx} />}

          {/* ========================================================================= */}
          {/* TAB 6: BÁO CÁO PMIS 02-PĐ & ĐỐI CHIẾU NGÀY (SẢN LƯỢNG & CHỈ TIÊU KTKT)     */}
          {/* ========================================================================= */}
          {activeTab === "pmis_reports" && <CtktktPmisReportsTab ctx={ctx} />}

          {/* ========================================================================= */}
          {/* TAB 7: TRA CỨU TOÀN BỘ Ô (LƯỚI / TÌM KIẾM CHO KỸ THUẬT VIÊN)              */}
          {/* ========================================================================= */}
          {activeTab === "all_fields" && <CtktktAllFieldsTab ctx={ctx} />}
        </div>

        {/* Footer ghi chú tổng kết */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-[#fffbeb] px-4 py-2 text-[11px] text-amber-900">
          <span>
            <b>Lưu ý nghiệp vụ:</b> Các cụm phụ (Lò hơi phụ, Nước sử dụng, Mực bồn HFO, Suất hao
            nhiệt) đã được lược bớt trên giao diện web theo quy trình vận hành và giữ đầy đủ trong
            file xuất Excel.
          </span>
          <span className="font-semibold text-amber-800">
            {editableFields.length} ô nhập tay · 42 ô liên kết BCSX
          </span>
        </div>
      </div>

      {showEmailModal && (
        <CtktktEmailModal
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          operatingDate={date}
          currentEntries={current}
          previousEntries={previous}
          initialShiftName="Tổ C"
        />
      )}

      {coalReviewUnit&&<CoalMeterPhotoReview key={`${date}-${coalReviewUnit}`} open onOpenChange={open=>{if(!open)setCoalReviewUnit(null);}} date={date} unit={coalReviewUnit} current={current}/>}
      {coalPhotoMounted&&<CoalMeterPhotoImport
        open={coalPhotoOpen}
        onOpenChange={setCoalPhotoOpen}
        reportDate={date}
        current={current}
        previous={previous}
        canEditCell={canEditCoalCell}
        initialUnit={unitView==="s2"?"S2":"S1"}
        disabled={loading||saving||syncingPmis}
        maxDate={vietnamDateIso()}
        onDateChange={value=>{
          if(dirtyCellsRef.current.size>0||saving||syncingPmis)return "Hãy lưu số liệu ngày đang nhập trước khi chuyển ngày.";
          if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value>vietnamDateIso())return "Ngày ghi chỉ số không hợp lệ hoặc ở tương lai.";
          if(!canEditOperatingDate(value,isAdminUser(user)))return "Bạn chỉ được nhập ngày hôm nay hoặc hôm qua; ngày cũ cần quản trị viên.";
          setLoading(true);
          setDate(value);setError("");setMessage("");
        }}
        onSave={async (values,unit)=>{
          if(loading||saving||!canEditSelectedDate)throw new Error("Ngày này chưa sẵn sàng hoặc bạn không có quyền lưu.");
          setSaving(true);
          try{
            const verified=await saveReviewedCoalEntries({save:saveReport,readStored:(p,d)=>fetchStoredCtktktReport(p,d)},date,values,unit);
            setByDate(old=>({...old,[date]:{...(old[date]||{}),...Object.fromEntries(verified.map(entry=>[entry.cell,entry.value]))}}));
            acknowledgeSaved(values);
            setMessage(`Đã lưu và kiểm tra lại ${verified.length} chỉ số công tơ than ngày ${date.split("-").reverse().join("/")}.`);
          }finally{setSaving(false);}
        }}
        onApply={values => {
          for (const { cell, value } of values) update(cell, value);
          setMessage(`Đã điền ${values.length} chỉ số công tơ than từ ảnh. Kiểm tra bảng rồi bấm “Lưu số liệu”.`);
        }}
      />}
    </section>
  );
}
