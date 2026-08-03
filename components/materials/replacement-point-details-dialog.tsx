"use client";

import Link from "next/link";
import { Cpu, Repeat } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReplacementBadge, SamplingOnlyChip } from "@/components/materials/replacement-badge";
import { replacementIntervalLabel } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";
import type { ReplacementItem } from "@/hooks/useReplacements";

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
 * Xem chi tiết một điểm đang theo dõi thay thế. THUẦN ĐỌC.
 *
 * Lịch sử thay thế chỉ được sinh từ số yêu cầu thay thế vật tư (khi phiếu khiếm
 * khuyết hoàn thành), nên ở đây không có thao tác ghi nhận nào — tránh tạo ra
 * đường ghi thứ hai không đi qua phiếu và không có số yêu cầu để đối chiếu.
 */
export function ReplacementPointDetailsDialog({
  point,
  onClose,
}: {
  point: ReplacementItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!point} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-5 w-5 text-accent" />
            Chi tiết điểm thay thế
          </DialogTitle>
        </DialogHeader>

        {point && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-ink">{point.material.name}</div>
                  <div className="font-mono text-[11.5px] text-navy">{point.material.code}</div>
                </div>
                <ReplacementBadge nextDueAt={point.nextDueAt} withText samplingOnly={point.samplingOnly} />
              </div>
              {point.samplingOnly && <SamplingOnlyChip className="mt-2" />}
            </div>

            <div className="grid gap-x-7 gap-y-3.5 sm:grid-cols-2">
              <Field
                label="Thiết bị"
                value={
                  point.device ? (
                    <Link href={`/devices/${point.device.id}`} className="text-accent hover:underline">
                      {point.device.name}
                    </Link>
                  ) : (
                    point.location
                  )
                }
              />
              <Field label="Mã thiết bị" value={point.device?.code ?? point.deviceSeq} mono />
              <Field label="Hệ thống" value={point.device?.system ?? point.system} />
              <Field label="Cương vị quản lý" value={point.managingPosition} />
              <Field label="Tổ máy" value={point.machine} />
              <Field label="Chu kỳ thay thế" value={replacementIntervalLabel(point.intervalMonths, point.intervalNote)} />
              <Field label="Lần thay gần nhất" value={formatDate(point.lastReplacedAt)} mono />
              <Field label="Đến hạn kế tiếp" value={formatDate(point.nextDueAt)} mono />
              <Field
                label="Số lượng cần thay"
                value={`${(point.quantity * Math.max(1, point.deviceCount)).toLocaleString("vi-VN")} ${point.material.unit}`}
              />
              <Field label="Số lượng thiết bị" value={point.deviceCount} />
            </div>

            {point.note && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ghi chú</div>
                <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/50 px-3 py-2 text-[13px] text-ink">
                  {point.note}
                </p>
              </div>
            )}

            <p className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2.5 text-[12px] leading-relaxed text-sky-900">
              <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />
              <span>
                Lịch sử thay thế được ghi khi hoàn thành <b>số yêu cầu thay thế vật tư</b> của điểm này.
                Ra số yêu cầu tại Danh mục vật tư → Chi tiết điểm thay thế.
              </span>
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
