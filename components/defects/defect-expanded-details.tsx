"use client";

import { useDefect, type DefectItem } from "@/hooks/useDefects";
import { DEFECT_CONDITION, DEFECT_SEVERITY } from "@/lib/constants";
import { parseScope, scopeCode } from "@/lib/equipment-units";
import { cn, formatDate } from "@/lib/utils";

/**
 * Khối chi tiết 3 bảng của một phiếu khiếm khuyết: Thông tin Vận hành, Theo dõi
 * Vận hành và Nội dung Sửa chữa.
 *
 * Dùng chung cho bảng Khiếm khuyết và bảng Lịch sử sửa chữa: phiếu đã xác nhận
 * lưu lịch sử rời khỏi bảng Khiếm khuyết nhưng trong lúc CHỜ CHỐT vẫn phải tra
 * cứu được đúng ba bảng này ở trang Lịch sử.
 */
export function DefectExpandedDetails({ defect }: { defect: DefectItem }) {
  const detailCardClass = "w-full space-y-2 rounded-xl border border-border/70 bg-white/70 p-4 shadow-sm";

  return (
    <div className="grid gap-4 px-1 py-1 text-[13px] leading-5 lg:grid-cols-2 xl:grid-cols-3">
      <div className={detailCardClass}>
        <div className="mb-3 border-b border-blue-100 pb-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-blue-800">Thông tin Vận hành</h3>
          <p className="text-xs text-muted-foreground">Thông tin bổ sung của phiếu Vận hành</p>
        </div>
        <DetailLine label="Yêu cầu" value={defect.requestType || "—"} />
        <DetailLine label="Trưởng ca" value={defect.shiftLeaderName || "—"} />
        {defect.sourceType === "GOOGLE_SHEETS" && (
          <DetailLine label="Thiết bị theo nguồn" value={defect.sourceDeviceRaw || "—"} multiline />
        )}
        <DetailLine
          label="Thiết bị đã gắn"
          value={defect.device
            ? `${scopeCode(defect.device, parseScope(defect.mappedDeviceUnit ?? defect.unit))} · ${defect.mappedDeviceUnit ?? defect.unit}`
            : "—"}
        />
        <DetailLine
          label="Thiết bị liên quan"
          value={defect.relatedDevices.length > 0
            ? defect.relatedDevices
                .map((item) => {
                  const mappedUnit = item.mappedUnit ?? defect.mappedDeviceUnit ?? defect.unit;
                  return `${item.device.name} (${scopeCode(item.deviceSeq, parseScope(mappedUnit))} · ${mappedUnit})`;
                })
                .join("\n")
            : "—"}
          multiline
        />
        <div className="mt-4 border-t border-red-100 pt-3">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-red-800">BGĐ chỉ đạo</h4>
          <div className="space-y-2">
            <DetailLine label="KTAT rà soát" value={defect.ktatReviewRaw || "—"} multiline />
            <DetailLine label="BGĐ chỉ đạo" value={defect.boardDirectionRaw || "—"} multiline />
          </div>
        </div>
      </div>
      <div className={detailCardClass}>
        <div className="mb-3 border-b border-sky-100 pb-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-sky-800">Theo dõi Vận hành</h3>
          <p className="text-xs text-muted-foreground">Ảnh hưởng, lịch sử nhắc lại và ghi chú</p>
        </div>
        <DetailLine
          label="Mức độ"
          value={DEFECT_SEVERITY[defect.severity as keyof typeof DEFECT_SEVERITY] || defect.severity || "—"}
        />
        <DetailLine
          label="Điều kiện thực hiện"
          value={DEFECT_CONDITION[defect.condition as keyof typeof DEFECT_CONDITION] || defect.condition || "—"}
        />
        <DetailLine label="Ảnh hưởng PCCC" value={defect.fireSafetyImpact || "—"} />
        <DetailLine label="Môi trường, ATVSLĐ" value={defect.environmentSafetyImpact || "—"} />
        <DetailLine label="Ngày nhắc gần nhất" value={defect.lastRemindedAt ? formatDate(defect.lastRemindedAt) : "—"} />
        {defect.sourceType === "GOOGLE_SHEETS" && (
          <>
            <DetailLine label="Nội dung nhắc lại" value={defect.reminderRaw || "—"} multiline />
            <DetailLine label="Sửa chữa lặp lại" value={defect.repeatedRepairRaw || "—"} multiline />
          </>
        )}
        <DetailLine label="Ghi chú Vận hành" value={defect.note || "—"} multiline />
        <DetailLine label="Người cập nhật cuối" value={defect.createdBy?.name || "—"} />
        {defect.images.length > 0 && (
          <div className="pt-1">
            <div className="mb-2 font-semibold text-ink">Hình ảnh:</div>
            <div className="flex flex-wrap gap-2">
              {defect.images.map((src, index) => (
                <a key={src} href={src} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Ảnh khiếm khuyết ${index + 1}`} className="h-20 w-20 rounded-lg border border-border object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className={detailCardClass}>
        <div className="mb-3 border-b border-emerald-100 pb-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-800">Nội dung Sửa chữa</h3>
          <p className="text-xs text-muted-foreground">Kế hoạch, thực hiện và dữ liệu đồng bộ</p>
        </div>
        <DetailLine label="Số PCT/LCT" value={defect.repairOrderNumberRaw || "—"} />
        <DetailLine label="Giải pháp sửa chữa" value={defect.repairSolutionRaw || "—"} multiline />
        <DetailLine label="Kế hoạch thực hiện" value={defect.repairPlanRaw || "—"} multiline />
        <DetailLine label="Đơn vị sửa chữa" value={defect.repairUnitRaw || "—"} multiline />
        <DetailLine label="Kết quả thực hiện" value={defect.repairResultRaw || "—"} multiline />
        <DetailLine label="Người thực hiện" value={defect.repairPerformedByRaw || "—"} multiline />
        <DetailLine label="Ngày thực hiện" value={formatDate(defect.repairStartedAt)} />
        <DetailLine label="Ngày hoàn thành" value={formatDate(defect.sourceCompletedAt)} />
        <DetailLine label="Nội dung đã thực hiện" value={defect.repairPerformedContentRaw || "—"} multiline />
        <DetailLine label="Ghi chú Sửa chữa" value={defect.repairNoteRaw || "—"} multiline />
        {defect.sourceType === "GOOGLE_SHEETS" && (
          <>
            <DetailLine
              label="Trạng thái đồng bộ"
              value={defect.syncState === "MISSING" ? "⚠ Không còn trên Google Sheet" : "Đang có trên Google Sheet"}
            />
            {defect.pendingHistory && (
              <>
                <DetailLine label="Xác nhận chờ lịch sử" value={formatDate(defect.pendingHistory.startedAt)} />
                <DetailLine label="Dự kiến chốt lịch sử" value={formatDate(defect.pendingHistory.finalizeAt)} />
              </>
            )}
            <DetailLine label="Đồng bộ gần nhất" value={formatDate(defect.sourceSyncedAt)} />
          </>
        )}
      </div>
    </div>
  );
}

/** Tự tải chi tiết phiếu theo id rồi dựng khối 3 bảng ở trên. */
export function DefectExpandedDetailsById({ id }: { id: string }) {
  const detail = useDefect(id);
  if (detail.isLoading) {
    return <div className="py-6 text-center text-sm text-muted-foreground">Đang tải chi tiết…</div>;
  }
  if (detail.isError || !detail.data?.data) {
    return <div className="py-6 text-center text-sm font-medium text-rose-700">Không tải được chi tiết khiếm khuyết</div>;
  }
  return <DefectExpandedDetails defect={detail.data.data} />;
}

function DetailLine({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="grid grid-cols-[132px_minmax(0,1fr)] items-start gap-3">
      <div className="whitespace-nowrap font-semibold text-ink">{label}:</div>
      <div className={cn("min-w-0 text-ink", multiline ? "whitespace-pre-wrap break-words" : "truncate")} title={!multiline ? value : undefined}>
        {value}
      </div>
    </div>
  );
}
