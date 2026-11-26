"use client";

import * as React from "react";
import { toast } from "sonner";
import { EquipmentTreePicker } from "@/components/devices/equipment-tree-picker";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useVibrationDevices, useVibrationMapping } from "@/hooks/useVibration";
import { foldVn } from "@/lib/vibration/parse";
import type { MapStatus, VibrationDeviceDto } from "@/lib/vibration/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 40;
const STATUS_LABEL: Record<MapStatus, string> = { none: "Chưa gán", auto: "Tự động", confirmed: "Đã xác nhận" };

export function VibrationMappingView() {
  const [area, setArea] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [showInactive, setShowInactive] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [minScore, setMinScore] = React.useState("0.6");
  const [bulkOpen, setBulkOpen] = React.useState(false);

  const { data, isLoading } = useVibrationDevices({ active: showInactive ? "all" : "true" });
  const mapping = useVibrationMapping();

  const devices = React.useMemo(() => data ?? [], [data]);
  const areas = React.useMemo(() => [...new Set(devices.map((d) => d.area))].sort((a, b) => a.localeCompare(b, "vi")), [devices]);
  const counts = React.useMemo(() => {
    const c = { none: 0, auto: 0, confirmed: 0, suggest: 0 };
    for (const d of devices) {
      c[d.mapStatus]++;
      if (d.mapStatus === "none" && d.suggestSeq) c.suggest++;
    }
    return c;
  }, [devices]);

  const filtered = React.useMemo(() => {
    const q = foldVn(search.trim());
    return devices.filter(
      (d) =>
        (area === "all" || d.area === area) &&
        (status === "all" || (status === "suggest" ? d.mapStatus === "none" && !!d.suggestSeq : d.mapStatus === status)) &&
        (!q || foldVn(`${d.name} ${d.system} ${d.legacyId} ${d.equipmentName ?? ""} ${d.equipmentSeq ?? ""}`).includes(q))
    );
  }, [devices, area, status, search]);

  const minValue = Number(minScore.replace(",", "."));
  const eligible = React.useMemo(
    () => filtered.filter((d) => d.active && d.mapStatus !== "confirmed" && !!d.suggestSeq && (d.suggestScore ?? 0) >= minValue),
    [filtered, minValue]
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  async function run(action: Parameters<typeof mapping.mutateAsync>[0], message: string) {
    try {
      await mapping.mutateAsync(action);
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Thao tác thất bại");
    }
  }

  async function runAuto() {
    try {
      const r = (await mapping.mutateAsync({ action: "auto" })) as { auto: number; none: number; skippedConfirmed: number };
      toast.success(`Đã chạy ánh xạ tự động: ${r.auto} gán tự động, ${r.none} chưa gán (giữ nguyên ${r.skippedConfirmed} đã xác nhận)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không chạy được ánh xạ tự động");
    }
  }

  return (
    <>
      <div className="page-title-row"><h1 id="title">Ánh xạ thiết bị độ rung</h1></div>
      <div id="content">
        <section className="device-catalog-intro">
          <div>
            <span className="device-catalog-kicker">ÁNH XẠ</span>
            <h2>Thiết bị đo độ rung ↔ cây thiết bị</h2>
            <p>Gán thiết bị đo độ rung với thiết bị trong cây thiết bị để xem lịch sử đo ở thẻ thiết bị. Ánh xạ tự động chỉ gán khi rất chắc chắn và không bao giờ ghi đè mục đã xác nhận.</p>
          </div>
          <strong>{counts.confirmed}<small>đã xác nhận</small></strong>
        </section>
        <div className="table-toolbar device-catalog-toolbar">
          <input type="search" aria-label="Tìm thiết bị" placeholder="Tìm theo tên, hệ thống, mã cũ, thiết bị trong cây..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          <select aria-label="Khu vực" value={area} onChange={(e) => { setArea(e.target.value); setPage(0); }}>
            <option value="all">Tất cả khu vực</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select aria-label="Trạng thái" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
            <option value="all">Mọi trạng thái</option>
            <option value="suggest">Có gợi ý ({counts.suggest})</option>
            <option value="none">Chưa gán ({counts.none})</option>
            <option value="auto">Tự động ({counts.auto})</option>
            <option value="confirmed">Đã xác nhận ({counts.confirmed})</option>
          </select>
          <label><input type="checkbox" checked={showInactive} onChange={(e) => { setShowInactive(e.target.checked); setPage(0); }} /> Gồm thiết bị ngừng dùng</label>
          <button type="button" className="primary-button" onClick={runAuto} disabled={mapping.isPending}>{mapping.isPending ? "Đang chạy…" : "Chạy ánh xạ tự động"}</button>
        </div>
        <p className="an-foot">{filtered.length} thiết bị · {counts.confirmed} đã xác nhận · {counts.auto} tự động chờ xác nhận · {counts.none} chưa gán.</p>
        <div className="table-toolbar">
          <span>Xác nhận các gợi ý đang lọc có điểm ≥</span>
          <input value={minScore} onChange={(e) => setMinScore(e.target.value)} inputMode="decimal" style={{ width: 72 }} aria-label="Điểm tối thiểu" />
          <button type="button" className="secondary-button" disabled={mapping.isPending || !eligible.length || !(minValue >= 0 && minValue <= 1)} onClick={() => setBulkOpen(true)}>Xác nhận {eligible.length} gợi ý</button>
        </div>

        <ConfirmDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          title="Xác nhận hàng loạt gợi ý?"
          description={`Gán và xác nhận ${eligible.length} thiết bị đo độ rung (đang lọc) theo gợi ý có điểm ≥ ${minValue}. Có thể bỏ gán từng thiết bị sau đó.`}
          confirmLabel="Xác nhận tất cả"
          loading={mapping.isPending}
          onConfirm={async () => {
            try {
              const r = (await mapping.mutateAsync({ action: "bulkSuggestions", minScore: minValue, deviceIds: eligible.map((d) => d.id) })) as { confirmed: number };
              toast.success(`Đã xác nhận ${r.confirmed} gợi ý`);
              setBulkOpen(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Thao tác thất bại");
            }
          }}
        />

        <div className="panel device-catalog-panel">
          {isLoading ? <p className="rs-empty vc-loading">Đang tải danh sách thiết bị…</p> : (
            <div className="device-table-wrap device-inventory-wrap">
              <table className="device-inventory">
                <thead><tr><th>Khu vực / Hệ thống</th><th>Thiết bị đo độ rung</th><th>Thiết bị trong cây</th><th>Điểm</th><th>Trạng thái</th><th className="device-inventory-action">Thao tác</th></tr></thead>
                <tbody>
                  {rows.map((d) => <MappingRow key={d.id} device={d} busy={mapping.isPending} onAction={run} />)}
                  {!rows.length && <tr><td colSpan={6} className="device-inventory-empty">Không có thiết bị phù hợp bộ lọc.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {pages > 1 && (
          <div className="table-toolbar">
            <button type="button" className="secondary-button small" disabled={current === 0} onClick={() => setPage(current - 1)}>Trước</button>
            <span>Trang {current + 1} / {pages}</span>
            <button type="button" className="secondary-button small" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Sau</button>
          </div>
        )}
      </div>
    </>
  );
}

function MappingRow({
  device: d,
  busy,
  onAction,
}: {
  device: VibrationDeviceDto;
  busy: boolean;
  onAction: (action: Parameters<ReturnType<typeof useVibrationMapping>["mutateAsync"]>[0], message: string) => void;
}) {
  return (
    <tr style={d.active ? undefined : { opacity: 0.6 }}>
      <td><strong className="device-inventory-name">{d.area}</strong><small>{d.system || "—"}</small></td>
      <td><strong className="device-inventory-name">{d.name}</strong><small><span className="device-code">{d.legacyId}</span>{!d.active ? " · ngừng dùng" : ""}</small></td>
      <td>
        <EquipmentTreePicker
          value={d.equipmentSeq ?? ""}
          includeLeaves
          placeholder="Chọn thiết bị trong cây..."
          disabled={busy}
          onChange={(node) =>
            node
              ? onAction({ action: "set", deviceId: d.id, equipmentSeq: node.seq }, `Đã gán “${d.name}” → ${node.name}`)
              : onAction({ action: "clear", deviceId: d.id }, `Đã bỏ gán “${d.name}”`)
          }
        />
        {d.equipmentSeq && <small title={d.equipmentName ?? ""}>{d.equipmentName ?? "(không còn trong cây)"} · {d.equipmentSeq}</small>}
        {d.mapStatus !== "confirmed" && d.suggestSeq && (
          <small className="machine-hint">
            <b>Gợi ý {d.suggestScore?.toFixed(2)}:</b> {d.suggestName ?? "(không còn trong cây)"} · {d.suggestSeq}{" "}
            <button type="button" className="secondary-button small" disabled={busy} onClick={() => onAction({ action: "useSuggestion", deviceId: d.id }, `Đã gán “${d.name}” → ${d.suggestName ?? d.suggestSeq}`)}>Dùng gợi ý</button>
          </small>
        )}
        {d.mapNote && d.mapStatus !== "confirmed" && !d.suggestSeq && <small>{d.mapNote}</small>}
      </td>
      <td>{d.mapScore != null && d.mapStatus !== "confirmed" ? d.mapScore.toFixed(2) : "—"}</td>
      <td><span className={cn("device-state", d.mapStatus === "confirmed" ? "is-active" : "is-archived")}>{STATUS_LABEL[d.mapStatus]}</span></td>
      <td className="device-inventory-action">
        {d.mapStatus === "auto" && d.equipmentSeq && <button type="button" className="secondary-button small" disabled={busy} onClick={() => onAction({ action: "confirm", deviceId: d.id }, `Đã xác nhận “${d.name}”`)}>Xác nhận</button>}{" "}
        {d.equipmentSeq && <button type="button" className="secondary-button small" disabled={busy} title="Bỏ gán" onClick={() => onAction({ action: "clear", deviceId: d.id }, `Đã bỏ gán “${d.name}”`)}>Bỏ gán</button>}
      </td>
    </tr>
  );
}
