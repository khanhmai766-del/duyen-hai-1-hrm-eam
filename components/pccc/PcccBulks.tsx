"use client";
// TAB "FOAM · CO2 · DIESEL · FM200".
// Hai khối: bảng bồn/mức (% còn lại, ngưỡng 90/70 theo công thức sheet nguồn) và các
// bảng FM200 bố cục NGANG — mỗi bình là 1 cột, KÝ 1 LẦN cho cả bảng.
import { toast } from "sonner";
import { Gauge } from "lucide-react";
import {
  EditableCell,
  MachineCell,
  PercentBar,
  SignCell,
  StatusBadge,
  TD_CLASS,
  TH_CLASS,
  TableShell,
  fmtDate,
} from "@/components/pccc/pccc-shared";
import { usePcccSign, usePcccUpdate, type BulkRow, type Fm200Panel, type PositionOption } from "@/hooks/usePccc";

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

function Fm200Table({ panel, canManage }: { panel: Fm200Panel; canManage: boolean }) {
  const update = usePcccUpdate("FM200_PANEL");
  const sign = usePcccSign();

  function saveValue(kind: "mucValues" | "apValues", label: string, raw: string) {
    update.mutate(
      { id: panel.id, patch: { [kind]: { [label]: raw === "" ? null : Number(raw) } } },
      {
        onSuccess: () => toast.success(`Đã lưu bình ${label} — chữ ký bảng đã bị xoá, cần ký lại`),
        onError: (e: Error) => toast.error(e.message),
      }
    );
  }

  function saveField(field: string, raw: string) {
    update.mutate(
      { id: panel.id, patch: { [field]: raw === "" ? null : raw } },
      { onSuccess: () => toast.success("Đã lưu"), onError: (e: Error) => toast.error(e.message) }
    );
  }

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
            <EditableCell value={panel.ngayKiemTra} type="date" disabled={!canManage} onSave={(v) => saveField("ngayKiemTra", v)} />
          </span>
          <span className="text-muted-foreground">Người KT:</span>
          <span className="w-32">
            <EditableCell value={panel.nguoiKiemTra} disabled={!canManage} onSave={(v) => saveField("nguoiKiemTra", v)} />
          </span>
          <SignCell
            signature={panel.signature}
            disabled={!canManage || sign.isPending}
            onToggle={(remove) =>
              sign.mutate(
                { targetType: "FM200_PANEL", targetId: panel.id, remove },
                { onError: (e: Error) => toast.error(e.message) }
              )
            }
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH_CLASS}>Loại đo</th>
              <th className={`${TH_CLASS} text-right`}>Min</th>
              <th className={`${TH_CLASS} text-right`}>Max</th>
              <th className={TH_CLASS}>ĐVT</th>
              {panel.binhLabels.map((b) => (
                <th key={b} className={`${TH_CLASS} min-w-[62px] text-center`}>
                  {b}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.kind}>
                <td className={`${TD_CLASS} whitespace-nowrap font-medium`}>{row.label}</td>
                <td className={`${TD_CLASS} text-right tabular-nums text-muted-foreground`}>{row.min ?? "—"}</td>
                <td className={`${TD_CLASS} text-right tabular-nums text-muted-foreground`}>{row.max ?? "—"}</td>
                <td className={`${TD_CLASS} whitespace-nowrap text-muted-foreground`}>{row.dvt ?? "—"}</td>
                {panel.binhLabels.map((label) => {
                  const value = row.values?.[label] ?? null;
                  const pct = rangePercent(value, row.min, row.max);
                  const tone = fm200Tone(pct);
                  return (
                    <td
                      key={label}
                      className={`${TD_CLASS} text-center ${
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
}: {
  bulks: BulkRow[];
  panels: Fm200Panel[];
  cuongViList: PositionOption[];
  canManage: boolean;
}) {
  const cuongViOptions = cuongViList.map((o) => o.label);
  const update = usePcccUpdate("BULK");
  const sign = usePcccSign();

  function save(row: BulkRow, field: string, value: string) {
    update.mutate(
      { id: row.id, patch: { [field]: value === "" ? null : value } },
      {
        onSuccess: (res) => toast.success(res?.signatureCleared ? `Đã lưu ${row.ten} — chữ ký đã bị xoá` : `Đã lưu ${row.ten}`),
        onError: (e: Error) => toast.error(e.message),
      }
    );
  }

  return (
    <div className="space-y-4">
      <TableShell>
        <thead>
          <tr>
            {["STT", "Tên", "Cương vị quản lý", "Tổ máy", "Vị trí", "ĐVT", "KL thiết kế", "KL hiện tại", "% còn lại", "Tình trạng", "Ngày chốt", "Người chốt", "Ghi chú", "Chữ ký"].map(
              (h) => (
                <th key={h} className={TH_CLASS}>
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {bulks.map((b) => (
            <tr key={b.id} className="hover:bg-slate-50/60">
              <td className={`${TD_CLASS} tabular-nums text-muted-foreground`}>{b.stt ?? ""}</td>
              <td className={`${TD_CLASS} min-w-[200px] font-medium`}>{b.ten}</td>
              <td className={`${TD_CLASS} whitespace-nowrap`}>
                <EditableCell
                  value={b.cuongVi}
                  type="select"
                  options={cuongViOptions}
                  disabled={!canManage}
                  onSave={(v) => save(b, "cuongVi", v)}
                />
              </td>
              <td className={`${TD_CLASS} text-center`}>
                <MachineCell value={b.machine} disabled={!canManage} onSave={(v) => save(b, "machine", v)} />
              </td>
              <td className={`${TD_CLASS} min-w-[120px]`}>
                <EditableCell value={b.viTri} disabled={!canManage} onSave={(v) => save(b, "viTri", v)} />
              </td>
              <td className={TD_CLASS}>{b.dvt}</td>
              <td className={`${TD_CLASS} text-right tabular-nums`}>
                <EditableCell
                  value={b.khoiLuongThietKe}
                  type="number"
                  align="right"
                  disabled={!canManage}
                  onSave={(v) => save(b, "khoiLuongThietKe", v)}
                />
              </td>
              <td className={`${TD_CLASS} text-right tabular-nums`}>
                <EditableCell
                  value={b.khoiLuongHienTai}
                  type="number"
                  align="right"
                  disabled={!canManage}
                  onSave={(v) => save(b, "khoiLuongHienTai", v)}
                />
              </td>
              {/* Dẫn xuất → chỉ đọc */}
              <td className={`${TD_CLASS} w-40`}>
                <PercentBar value={b.phanTramConLai} />
              </td>
              <td className={`${TD_CLASS} whitespace-nowrap`}>
                <StatusBadge status={b.tinhTrang} />
              </td>
              <td className={`${TD_CLASS} whitespace-nowrap`}>
                <EditableCell value={b.ngayChot} type="date" disabled={!canManage} onSave={(v) => save(b, "ngayChot", v)} />
              </td>
              <td className={`${TD_CLASS} whitespace-nowrap`}>
                <EditableCell value={b.nguoiChot} disabled={!canManage} onSave={(v) => save(b, "nguoiChot", v)} />
              </td>
              <td className={`${TD_CLASS} min-w-[140px]`}>
                <EditableCell value={b.ghiChu} disabled={!canManage} onSave={(v) => save(b, "ghiChu", v)} />
              </td>
              <td className={`${TD_CLASS} whitespace-nowrap`}>
                <SignCell
                  signature={b.signature}
                  disabled={!canManage || sign.isPending}
                  onToggle={(remove) =>
                    sign.mutate({ targetType: "BULK", targetId: b.id, remove }, { onError: (e: Error) => toast.error(e.message) })
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>

      {panels.map((p) => (
        <Fm200Table key={p.id} panel={p} canManage={canManage} />
      ))}

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
