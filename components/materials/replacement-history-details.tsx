"use client";

import { Clock3, CheckCircle2, PenLine } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { replacementIntervalLabel } from "@/lib/constants";
import type { ReplacementLogItem } from "@/hooks/useReplacements";

function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 break-words text-[13px] text-ink", mono && "font-mono text-[12.5px]")}>
        {value || "—"}
      </div>
    </div>
  );
}

/**
 * Panel chi tiết một dòng lịch sử thay thế, bố cục theo đúng bảng Lịch sử sửa chữa.
 *
 * Ba dạng nội dung tách bạch:
 *  - Ghi thủ công: không có phiếu, chỉ có ghi chú người ghi nhận tự nhập.
 *  - SYC đang CHỜ CHỐT: bản nháp Vận hành vừa xác nhận, còn nhận thêm dữ liệu sửa
 *    chữa từ Google Sheet cho tới hạn chốt — phải nói rõ để không ai tưởng là số cuối.
 *  - SYC ĐÃ CHỐT: bản chính thức, không đổi nữa.
 */
export function ReplacementHistoryDetails({ log }: { log: ReplacementLogItem }) {
  const point = log.replacement;
  const device = point?.device;
  const history = log.defectHistory;
  const pending = history?.status === "PENDING";

  return (
    <div className="space-y-4 text-[13px] leading-5">
      <div className="grid gap-x-7 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Field label="Tên vật tư" value={point?.material.name} />
        <Field label="Mã vật tư" value={point?.material.code} mono />
        <Field label="Tên thiết bị" value={device?.name ?? log.deviceLabel} />
        <Field label="Mã thiết bị" value={device?.code ?? log.deviceSeq} mono />
        <Field label="Hệ thống" value={device?.system ?? log.systemLabel} />
        <Field label="Cương vị quản lý" value={point?.managingPosition ?? log.managingPosition} />
        <Field
          label="Chu kỳ thay thế"
          value={
            log.intervalMonths
              ? replacementIntervalLabel(log.intervalMonths, log.intervalNote)
              : point
                ? replacementIntervalLabel(point.intervalMonths, point.intervalNote)
                : null
          }
        />
        <Field
          label="Khối lượng thực dùng"
          value={(log.usedQuantity ?? log.quantity) != null ? `${(log.usedQuantity ?? log.quantity)!.toLocaleString("vi-VN")} ${log.unitLabel ?? point?.material.unit ?? ""}` : null}
        />
        {log.usedQuantity != null && (
          <Field
            label="Khối lượng kế hoạch"
            value={log.quantity != null ? `${log.quantity.toLocaleString("vi-VN")} ${log.unitLabel ?? point?.material.unit ?? ""}` : null}
          />
        )}
        <Field label="Ngày thay" value={formatDate(log.replacedAt)} mono />
        <Field label="Người ghi nhận" value={log.doneBy.name} />
        <Field label="Số yêu cầu" value={log.requestNumber} mono />
        <Field label="Số PCT/LCT" value={log.pctNumber} mono />
        <Field label="Số BBNT DO" value={log.bbntDoNumber} mono />
        <Field label="Số phiếu ĐXVT" value={log.proposalNumber} mono />
        <Field label="Phiếu giao hàng" value={log.deliveryNoteNumber} mono />
        <Field label="Loại yêu cầu" value={history?.requestType} />
      </div>

      {log.pointRemoved && (
        <p className="rounded-lg border border-dashed border-border bg-white/70 px-3 py-2 text-[12px] text-muted-foreground">
          Điểm theo dõi của lần thay này đã được gỡ khỏi danh sách theo dõi. Thông tin trên
          lấy từ bản chụp lúc ghi nhận nên vẫn nguyên vẹn.
        </p>
      )}

      {!history ? (
        // Ghi nhận thủ công — không gắn với phiếu khiếm khuyết nào.
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <PenLine className="h-4 w-4 text-slate-500" />
            <span className="font-semibold text-ink">Ghi nhận thủ công</span>
          </div>
          <div className="mt-3 grid gap-x-7 gap-y-3.5 sm:grid-cols-2">
            <Field label="Nội dung sử dụng vật tư" value={log.note} />
            <Field label="Ghi chú (BBNT DO / hình thức lãnh)" value={log.sourceNote} />
          </div>
        </div>
      ) : pending ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/70 pb-2">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-amber-600" />
              <span className="font-semibold text-amber-950">Nội dung sửa chữa — bản nháp chờ chốt</span>
            </div>
            {history.finalizeAt && (
              <span className="font-mono text-[11.5px] text-amber-800">
                tự chốt ngày {formatDate(history.finalizeAt)}
              </span>
            )}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-amber-800/80">
            Đây là nội dung Vận hành vừa xác nhận. Phiếu vẫn tiếp tục nhận dữ liệu sửa chữa
            từ Google Sheet cho tới hạn chốt, nên các trường dưới đây còn có thể thay đổi.
          </p>
          <div className="mt-3 grid gap-x-7 gap-y-3.5 sm:grid-cols-2">
            <Field label="Số phiếu công tác" value={history.workOrderNumber} mono />
            <Field label="Ngày thực hiện" value={formatDate(history.performedAt)} mono />
            <Field label="Nội dung thực hiện" value={history.content} />
            <Field label="Kết quả thực hiện" value={history.result} />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex items-center gap-2 border-b border-emerald-200/70 pb-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold text-emerald-950">Nội dung sửa chữa — đã chốt lịch sử</span>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-emerald-800/80">
            Bản chính thức đã chốt vào Lịch sử sửa chữa, không còn thay đổi.
          </p>
          <div className="mt-3 grid gap-x-7 gap-y-3.5 sm:grid-cols-2">
            <Field label="Số phiếu công tác" value={history.workOrderNumber} mono />
            <Field label="Ngày thực hiện" value={formatDate(history.performedAt)} mono />
            <Field label="Nội dung thực hiện" value={history.content} />
            <Field label="Kết quả thực hiện" value={history.result} />
          </div>
        </div>
      )}
    </div>
  );
}
