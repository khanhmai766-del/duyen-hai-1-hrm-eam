"use client";

import * as React from "react";
import {
  useDefect,
  useDefectRequestNumberControl,
  useSetDefectRequestNumber,
  type DefectItem,
} from "@/hooks/useDefects";
import {
  DEFECT_CONDITION,
  DEFECT_SEVERITY,
  defectSeverityCriteriaLabels,
} from "@/lib/constants";
import { ImageLightbox } from "@/components/shared/image-lightbox";
import { parseScope, scopeCode } from "@/lib/equipment-units";
import { cn, formatDate } from "@/lib/utils";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Khối chi tiết 3 bảng của một phiếu khiếm khuyết: Thông tin Vận hành, Theo dõi
 * Vận hành và Nội dung Sửa chữa.
 *
 * Dùng chung cho bảng Khiếm khuyết và bảng Lịch sử sửa chữa: phiếu đã xác nhận
 * lưu lịch sử rời khỏi bảng Khiếm khuyết nhưng trong lúc CHỜ CHỐT vẫn phải tra
 * cứu được đúng ba bảng này ở trang Lịch sử.
 */
export function DefectExpandedDetails({ defect }: { defect: DefectItem }) {
  // Ảnh nào đang mở trong khung xem; null = đóng.
  const [viewerIndex, setViewerIndex] = React.useState<number | null>(null);
  const detailCardClass = "w-full space-y-2 rounded-xl border border-border/70 bg-white/70 p-4 shadow-sm";
  const severityCriteria = defectSeverityCriteriaLabels(defect.severity, defect.severityCriteria);
  const severityDisplay = severityCriteria.length > 0
    ? severityCriteria.map((criterion) => `Mức ${defect.severity} · ${criterion}`).join("\n")
    : DEFECT_SEVERITY[defect.severity as keyof typeof DEFECT_SEVERITY] || defect.severity || "—";

  return (
    <div className="grid gap-4 px-1 py-1 text-[13px] leading-5 lg:grid-cols-2 xl:grid-cols-3">
      <div className={detailCardClass}>
        <div className="mb-3 border-b border-blue-100 pb-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-blue-800">Thông tin Vận hành</h3>
          <p className="text-xs text-muted-foreground">Thông tin bổ sung của phiếu Vận hành</p>
        </div>
        <RequestNumberControl defect={defect} />
        <DetailLine label="Nội dung khiếm khuyết" value={defect.content || "—"} multiline />
        <DetailLine label="Yêu cầu" value={defect.requestType || "—"} />
        <DetailLine label="Trưởng ca" value={defect.shiftLeaderName || "—"} />
        {defect.sourceType === "GOOGLE_SHEETS" && (
          <DetailLine label="Thiết bị theo nguồn" value={defect.sourceDeviceRaw || "—"} multiline />
        )}
        <DetailLine
          label="Thiết bị đã gắn"
          value={defect.node
            ? `${defect.node.name} (${scopeCode(defect.node.seq, parseScope(defect.mappedDeviceUnit ?? defect.unit))} · ${defect.mappedDeviceUnit ?? defect.unit})`
            : defect.device
              ? `${defect.device} · ${defect.mappedDeviceUnit ?? defect.unit}`
            : "—"}
          multiline
        />
        <RelatedDevicesLine defect={defect} />
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
          value={severityDisplay}
          multiline
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
                <button
                  key={src}
                  type="button"
                  onClick={() => setViewerIndex(index)}
                  aria-label={`Xem ảnh khiếm khuyết ${index + 1}`}
                  className="block rounded-lg transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Ảnh khiếm khuyết ${index + 1}`} className="h-20 w-20 cursor-zoom-in rounded-lg border border-border object-cover" />
                </button>
              ))}
            </div>
            <ImageLightbox
              images={defect.images}
              index={viewerIndex}
              onIndexChange={setViewerIndex}
              onClose={() => setViewerIndex(null)}
              alt="Ảnh khiếm khuyết"
            />
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

function RequestNumberControl({ defect }: { defect: DefectItem }) {
  const rbac = useRbacAccess();
  const canControl = defect.websiteCreated && rbac.can("defect-two-way-sync", ["full"]);
  const control = useDefectRequestNumberControl(defect.id, canControl);
  const setNumber = useSetDefectRequestNumber();
  const [editing, setEditing] = React.useState(false);
  const [requestNumber, setRequestNumber] = React.useState("");
  if (!canControl) return null;

  const data = control.data?.data;
  const sheetNumber = data?.sheetRequestNumber ?? "";
  const currentNumber = data?.currentRequestNumber || defect.requestNumber || "";

  function openEditor() {
    setRequestNumber(sheetNumber || currentNumber);
    setEditing(true);
  }

  async function confirmChange() {
    try {
      await setNumber.mutateAsync({ id: defect.id, requestNumber });
      toast.success(`Đã đổi STT phiếu thành ${requestNumber.trim().toUpperCase()}`);
      setEditing(false);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <>
      <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-blue-800">
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Đối chiếu STT phiếu website
          </div>
          {control.isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-700" />}
        </div>
        {control.isError ? (
          <p className="text-xs text-rose-700">{(control.error as Error).message}</p>
        ) : data ? (
          <div className="space-y-1.5">
            <NumberLine label="Website đã cấp" value={data.issuedRequestNumber || "—"} strong />
            <NumberLine label="Website đang lưu" value={data.currentRequestNumber || "—"} />
            <NumberLine
              label="Dòng Sheet nhận diện"
              value={data.sheetMatchAmbiguous ? "Có nhiều dòng trùng thông tin" : data.sheetRequestNumber || "Chưa phát hiện số khác"}
              warn={Boolean(data.sheetRequestNumber && data.sheetRequestNumber !== data.currentRequestNumber)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full bg-white"
              disabled={data.sheetMatchAmbiguous}
              onClick={openEditor}
            >
              <ArrowRightLeft className="h-4 w-4" />
              Điều chỉnh STT phiếu này
            </Button>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={editing}
        onOpenChange={setEditing}
        title="Điều chỉnh STT phiếu website"
        description={`Website đã cấp phiếu này số ${data?.issuedRequestNumber || defect.requestNumber || "—"}. Chỉ xác nhận sau khi đã kiểm tra STT đang dùng trên Google Sheet.`}
        confirmLabel="Đổi và hợp nhất dữ liệu"
        destructive={false}
        loading={setNumber.isPending}
        onConfirm={() => void confirmChange()}
      >
        <div className="space-y-2">
          <label htmlFor={`request-number-${defect.id}`} className="text-sm font-semibold text-ink">STT đúng trên Sheet</label>
          <Input
            id={`request-number-${defect.id}`}
            value={requestNumber}
            onChange={(event) => setRequestNumber(event.target.value)}
            placeholder="Ví dụ: 1869/2026"
            className="font-bold tabular-nums"
            autoFocus
          />
          <p className="text-xs leading-relaxed text-amber-700">
            Hệ thống sẽ cập nhật khóa đồng bộ và hợp nhất bản ghi Sheet trùng dòng nếu có. STT đã cấp ban đầu vẫn được giữ trong nhật ký đối chiếu.
          </p>
        </div>
      </ConfirmDialog>
    </>
  );
}

function NumberLine({
  label,
  value,
  strong = false,
  warn = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right tabular-nums", strong && "font-bold text-blue-900", warn && "font-bold text-amber-800")}>
        {value}
      </span>
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

function RelatedDevicesLine({ defect }: { defect: DefectItem }) {
  const [expanded, setExpanded] = React.useState(false);
  const visibleDevices = expanded ? defect.relatedDevices : defect.relatedDevices.slice(0, 3);
  const hiddenCount = defect.relatedDevices.length - 3;

  return (
    <div className="grid grid-cols-[132px_minmax(0,1fr)] items-start gap-3">
      <div className="whitespace-nowrap font-semibold text-ink">Thiết bị liên quan:</div>
      <div className="min-w-0 text-ink">
        {visibleDevices.length > 0 ? (
          <div className="space-y-1">
            {visibleDevices.map((item) => {
              const mappedUnit = item.mappedUnit ?? defect.mappedDeviceUnit ?? defect.unit;
              return (
                <div key={item.deviceSeq} className="break-words">
                  {item.device.name} ({scopeCode(item.deviceSeq, parseScope(mappedUnit))} · {mappedUnit})
                </div>
              );
            })}
          </div>
        ) : "—"}
        {hiddenCount > 0 && (
          <button
            type="button"
            className="mt-1.5 rounded-md px-1.5 py-0.5 text-left text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Thu gọn" : `Xem thêm ${hiddenCount} thiết bị`}
          </button>
        )}
      </div>
    </div>
  );
}
