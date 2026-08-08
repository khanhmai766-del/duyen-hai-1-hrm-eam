"use client";
// TAB "FOAM · CO2 · DIESEL · FM200".
// Hai khối: bảng bồn/mức (% còn lại, ngưỡng 90/70 theo công thức sheet nguồn) và các
// bảng FM200 bố cục NGANG — mỗi bình là 1 cột, KÝ 1 LẦN cho cả bảng.
import { useState } from "react";
import { toast } from "sonner";
import { Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMeProfile } from "@/hooks/useUsers";
import { PcccSignConfirmDialog } from "@/components/pccc/pccc-sign-dialog";
import {
  EditableCell,
  PercentBar,
  SignCell,
  StatusBadge,
  TD_CLASS,
  TH_CLASS,
  TableShell,
  fmtDate,
} from "@/components/pccc/pccc-shared";
import {
  canEditPcccAdminField,
  canEditPcccRow,
  usePcccSign,
  type BulkRow,
  type Fm200Panel,
  type PcccWriteScopeMeta,
  type PositionOption,
} from "@/hooks/usePccc";

/**
 * Ba bảng ở tab này chỉ vài dòng mỗi bảng (3 bồn, 2 dòng chỉ số FM200) nên hàng để
 * THOÁNG hơn hai tab kia: dễ đọc và dễ bấm vào ô nhập, không sợ tốn màn hình. Hai tab
 * Bình/Tủ chữa cháy hàng trăm dòng nên vẫn giữ hàng sát.
 */
/** Mục tiêu của một lượt ký ở tab này: một bồn hoặc một bảng FM200. */
type SignTarget = {
  targetType: "BULK" | "FM200_PANEL";
  targetId: string;
  name: string;
  remove?: boolean;
};

const TD_ROOMY = cn(TD_CLASS, "py-4");
const TH_ROOMY = cn(TH_CLASS, "py-3");

/** % theo dải đo, dùng lại đúng công thức của lib/pccc-summary. */
function rangePercent(value: number | null, min: number | null, max: number | null) {
  if (value === null || min === null || max === null || max === min) return null;
  return (value - min) / (max - min);
}

function fm200Tone(pct: number | null) {
  if (pct === null) return "none" as const;
  if (pct >= 0.75) return "ok" as const;
  if (pct >= 0.5) return "watch" as const;
  return "bad" as const;
}

function Fm200Table({
  panel,
  canManage,
  onSign,
  rowDraft,
  onDraftChange,
  adminField,
}: {
  panel: Fm200Panel;
  canManage: boolean;
  /** Ngày/Người KT chỉ ADMIN sửa — hai ô này do thao tác ký tự điền. */
  adminField: boolean;
  onSign: (target: SignTarget) => void;
  rowDraft: Record<string, unknown>;
  onDraftChange: (field: string, value: unknown) => void;
}) {
  const sign = usePcccSign();

  /** Ghi vào BẢN NHÁP, không gọi API. Lưu một lượt khi bấm "Lưu" — giống hai tab kia. */
  function saveValue(kind: "mucValues" | "apValues", label: string, raw: string) {
    onDraftChange(`${kind === "mucValues" ? "muc" : "ap"}:${label}`, raw === "" ? null : Number(raw));
  }

  function saveField(field: string, raw: string) {
    onDraftChange(field, raw === "" ? null : raw);
  }

  /** Giá trị đang sửa (nếu có) thay cho giá trị đã lưu. */
  const val = <T,>(field: string, saved: T) => (field in rowDraft ? (rowDraft[field] as T) : saved);

  const rows = [
    { kind: "mucValues" as const, label: "Mức FM 200", min: panel.mucMin, max: panel.mucMax, dvt: panel.mucDvt, values: panel.mucValues },
    { kind: "apValues" as const, label: "Áp suất N2", min: panel.apMin, max: panel.apMax, dvt: panel.apDvt, values: panel.apValues },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold text-navy">
            <Gauge className="size-4" />
            {panel.title}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {panel.binhLabels.length} bình · ký một lần cho cả bảng · ngưỡng 75/50 theo dải đo
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-muted-foreground">Ngày KT:</span>
          <span className="w-28">
            <EditableCell
              value={val("ngayKiemTra", panel.ngayKiemTra)}
              type="date"
              disabled={!canManage || !adminField}
              onSave={(v) => saveField("ngayKiemTra", v)}
            />
          </span>
          <span className="text-muted-foreground">Người KT:</span>
          <span className="w-32">
            <EditableCell
              value={val("nguoiKiemTra", panel.nguoiKiemTra)}
              disabled={!canManage || !adminField}
              onSave={(v) => saveField("nguoiKiemTra", v)}
            />
          </span>
          <SignCell
            signature={panel.signature}
            disabled={!canManage || sign.isPending}
            onToggle={(remove) =>
              onSign({ targetType: "FM200_PANEL", targetId: panel.id, name: panel.title, remove })
            }
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH_ROOMY}>Loại đo</th>
              <th className={`${TH_ROOMY} text-right`}>Min</th>
              <th className={`${TH_ROOMY} text-right`}>Max</th>
              <th className={TH_ROOMY}>ĐVT</th>
              {panel.binhLabels.map((b) => (
                <th key={b} className={`${TH_ROOMY} min-w-[62px] text-center`}>
                  {b}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.kind}>
                <td className={`${TD_ROOMY} whitespace-nowrap font-medium`}>{row.label}</td>
                <td className={`${TD_ROOMY} text-right tabular-nums text-muted-foreground`}>{row.min ?? "—"}</td>
                <td className={`${TD_ROOMY} text-right tabular-nums text-muted-foreground`}>{row.max ?? "—"}</td>
                <td className={`${TD_ROOMY} whitespace-nowrap text-muted-foreground`}>{row.dvt ?? "—"}</td>
                {panel.binhLabels.map((label) => {
                  const key = `${row.kind === "mucValues" ? "muc" : "ap"}:${label}`;
                  const value = (key in rowDraft ? (rowDraft[key] as number | null) : row.values?.[label]) ?? null;
                  const pct = rangePercent(value, row.min, row.max);
                  const tone = fm200Tone(pct);
                  return (
                    <td
                      key={label}
                      className={`${TD_ROOMY} text-center ${
                        tone === "ok" ? "bg-emerald-50/60" : tone === "watch" ? "bg-amber-50/60" : tone === "bad" ? "bg-rose-50/60" : ""
                      }`}
                    >
                      <EditableCell
                        value={value}
                        type="number"
                        align="center"
                        disabled={!canManage}
                        onSave={(v) => saveValue(row.kind, label, v)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PcccBulks({
  bulks,
  panels,
  cuongViList,
  canManage,
  writeScope,
  periodLabel,
  editing,
  draft,
  onDraftChange,
}: {
  bulks: BulkRow[];
  panels: Fm200Panel[];
  cuongViList: PositionOption[];
  canManage: boolean;
  /** Nhãn kỳ đang xem — hộp thoại ký phải nói rõ đang ký cho kỳ nào. */
  periodLabel?: string;
  /** Bảng chỉ mở khoá khi bấm "Sửa bảng", giống hai tab kia. */
  editing?: boolean;
  /** Sửa đổi chưa lưu. Khoá: `bulk:<id>` / `panel:<id>`; ô số FM200 dùng `muc:`/`ap:`. */
  draft?: Record<string, Record<string, unknown>>;
  onDraftChange?: (key: string, field: string, value: unknown) => void;
  /** Phạm vi ghi theo cương vị — dòng ngoài phạm vi vẫn XEM được nhưng khoá ô. */
  writeScope?: PcccWriteScopeMeta;
}) {
  const cuongViOptions = cuongViList.map((o) => o.label);
  const sign = usePcccSign();

  // ---- Ký từng bồn / từng bảng FM200: luôn hỏi xác nhận trước, giống hai tab kia.
  const me = useMeProfile();
  const signatureUrl = me.data?.data?.signatureUrl ?? null;
  const hasSignature = Boolean(me.data?.data?.signatureKey);
  const [signTarget, setSignTarget] = useState<SignTarget | null>(null);
  /** Ô phân công và dấu chốt: chỉ ADMIN sửa (xem lib/pccc-service.ts). */
  const adminField = canEditPcccAdminField(writeScope);

  function openSign(target: SignTarget) {
    // Huỷ ký chỉ xoá chữ ký, không ghi gì thêm — hỏi gọn bằng confirm, khỏi mở hộp thoại.
    if (target.remove) {
      if (!window.confirm(`Huỷ chữ ký của "${target.name}"?`)) return;
      sign.mutate(
        { targetType: target.targetType, targetId: target.targetId, remove: true },
        { onSuccess: () => toast.success(`Đã huỷ ký ${target.name}`), onError: (e: Error) => toast.error(e.message) }
      );
      return;
    }
    setSignTarget(target);
  }

  function confirmSign() {
    if (!signTarget) return;
    sign.mutate(
      { targetType: signTarget.targetType, targetId: signTarget.targetId },
      {
        onSuccess: () => {
          toast.success(
            `Đã ký ${signTarget.name} — người kiểm tra ${me.data?.data?.name ?? ""}, ngày ${new Date().toLocaleDateString("vi-VN")}`
          );
          setSignTarget(null);
        },
        onError: (e: Error) => toast.error(e.message),
      }
    );
  }

  /** Ghi vào BẢN NHÁP, không gọi API. Lưu một lượt khi bấm "Lưu". */
  function save(row: BulkRow, field: string, value: string) {
    onDraftChange?.(`bulk:${row.id}`, field, value === "" ? null : value);
  }

  return (
    <div className="space-y-4">
      <TableShell>
        <thead>
          <tr>
            {/* Tổ máy KHÔNG hiển thị (3 bồn đều là Common) — dữ liệu vẫn lưu trong DB, vẫn
                lọc bằng ô "Tất cả tổ máy" và vẫn xuất ra Excel. Giống hai tab kia. */}
            {["STT", "Tên", "Cương vị quản lý", "ĐVT", "KL thiết kế", "KL hiện tại", "% còn lại", "Tình trạng", "Ngày chốt", "Người chốt", "Ghi chú", "Chữ ký"].map(
              (h) => (
                <th key={h} className={TH_ROOMY}>
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {bulks.map((b) => {
            // Phạm vi ghi theo cương vị — bồn của cương vị khác vẫn xem được, chỉ khoá ô.
            const rowEditable = canManage && Boolean(editing) && canEditPcccRow(writeScope, b);
            const bDraft = draft?.[`bulk:${b.id}`] ?? {};
            const val = <T,>(field: string, saved: T) => (field in bDraft ? (bDraft[field] as T) : saved);
            return (
            <tr key={b.id} className="hover:bg-slate-50/60">
              <td className={`${TD_ROOMY} tabular-nums text-muted-foreground`}>{b.stt ?? ""}</td>
              <td className={`${TD_ROOMY} min-w-[200px] font-medium`}>{b.ten}</td>
              <td className={`${TD_ROOMY} whitespace-nowrap`}>
                <EditableCell
                  value={val("cuongVi", b.cuongVi)}
                  type="select"
                  options={cuongViOptions}
                  disabled={!rowEditable || !adminField}
                  onSave={(v) => save(b, "cuongVi", v)}
                />
              </td>
              <td className={TD_ROOMY}>{b.dvt}</td>
              <td className={`${TD_ROOMY} text-right tabular-nums`}>
                <EditableCell
                  value={val("khoiLuongThietKe", b.khoiLuongThietKe)}
                  type="number"
                  align="right"
                  disabled={!rowEditable}
                  onSave={(v) => save(b, "khoiLuongThietKe", v)}
                />
              </td>
              <td className={`${TD_ROOMY} text-right tabular-nums`}>
                <EditableCell
                  value={val("khoiLuongHienTai", b.khoiLuongHienTai)}
                  type="number"
                  align="right"
                  disabled={!rowEditable}
                  onSave={(v) => save(b, "khoiLuongHienTai", v)}
                />
              </td>
              {/* Dẫn xuất → chỉ đọc */}
              <td className={`${TD_ROOMY} w-40`}>
                <PercentBar value={b.phanTramConLai} />
              </td>
              <td className={`${TD_ROOMY} whitespace-nowrap`}>
                <StatusBadge status={b.tinhTrang} />
              </td>
              <td className={`${TD_ROOMY} whitespace-nowrap`}>
                <EditableCell value={val("ngayChot", b.ngayChot)} type="date" disabled={!rowEditable || !adminField} onSave={(v) => save(b, "ngayChot", v)} />
              </td>
              <td className={`${TD_ROOMY} whitespace-nowrap`}>
                <EditableCell value={val("nguoiChot", b.nguoiChot)} disabled={!rowEditable || !adminField} onSave={(v) => save(b, "nguoiChot", v)} />
              </td>
              <td className={`${TD_ROOMY} min-w-[140px]`}>
                <EditableCell value={val("ghiChu", b.ghiChu)} disabled={!rowEditable} onSave={(v) => save(b, "ghiChu", v)} />
              </td>
              <td className={`${TD_ROOMY} whitespace-nowrap`}>
                <SignCell
                  signature={b.signature}
                  disabled={!rowEditable || sign.isPending}
                  onToggle={(remove) => openSign({ targetType: "BULK", targetId: b.id, name: b.ten, remove })}
                />
              </td>
            </tr>
            );
          })}
        </tbody>
      </TableShell>

      {panels.map((p) => (
        <Fm200Table
          key={p.id}
          panel={p}
          canManage={canManage && Boolean(editing) && canEditPcccRow(writeScope, p)}
          onSign={openSign}
          adminField={adminField}
          rowDraft={draft?.[`panel:${p.id}`] ?? {}}
          onDraftChange={(field, value) => onDraftChange?.(`panel:${p.id}`, field, value)}
        />
      ))}

      <PcccSignConfirmDialog
        open={Boolean(signTarget)}
        onClose={() => setSignTarget(null)}
        title={`Ký xác nhận ${signTarget?.targetType === "FM200_PANEL" ? "bảng FM200" : "bồn"}`}
        rows={[
          { label: signTarget?.targetType === "FM200_PANEL" ? "Bảng" : "Bồn", value: signTarget?.name ?? "", strong: true },
          { label: "Kỳ kiểm tra", value: periodLabel ?? "—" },
          { label: "Người kiểm tra", value: me.data?.data?.name ?? "—" },
          { label: "Ngày kiểm tra", value: new Date().toLocaleDateString("vi-VN") },
        ]}
        hasSignature={hasSignature}
        signatureUrl={signatureUrl}
        pending={sign.isPending}
        onConfirm={confirmSign}
        note={
          signTarget?.targetType === "FM200_PANEL"
            ? "Ký một lần cho cả bảng. Ngày KT và Người KT của bảng sẽ được điền tự động."
            : "Ngày chốt và Người chốt của bồn sẽ được điền tự động theo lượt ký này."
        }
      />

      {panels.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Cập nhật gần nhất của bảng FM200:{" "}
          {panels
            .map((p) => `${p.panelKey === "KICH_TU" ? "Kích từ" : "ĐKTT"} ${fmtDate(p.ngayKiemTra) || "chưa ghi"}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
