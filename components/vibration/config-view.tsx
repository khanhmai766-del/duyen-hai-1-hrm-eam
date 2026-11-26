"use client";

import * as React from "react";
import { toast } from "sonner";
import { CatalogDeviceDialog } from "@/components/vibration/catalog-device-dialog";
import { ConfigMachineTable } from "@/components/vibration/config-machine-table";
import { ConfigScopeTable, SCOPE_LABEL, ScopeAreaControl, type ConfigDraft } from "@/components/vibration/config-scope-table";
import { useBulkUpdateVibrationDevices } from "@/hooks/useVibrationCatalog";
import { useVibrationDevices } from "@/hooks/useVibration";
import {
  ALERT_FIELDS, SCOPE_KEYS, alertError, machineMissing, normalizeAlertConfig, normalizeMeasurementConfig,
  type AlertCfg, type AlertKey, type ScopeCfg, type ScopeKey,
} from "@/lib/vibration/catalog";
import { foldVn } from "@/lib/vibration/parse";
import type { VibrationDeviceDto } from "@/lib/vibration/types";

const PAGE_SIZE = 40;

const baseDraft = (d: VibrationDeviceDto): ConfigDraft => ({ scopes: normalizeMeasurementConfig(d.measurementConfig), alert: normalizeAlertConfig(d.alertConfig), alertText: {} });

export function ConfigView({ canManage, isAdmin }: { canManage: boolean; isAdmin: boolean }) {
  const [tab, setTab] = React.useState<"scope" | "machine">("scope");
  const [search, setSearch] = React.useState("");
  const [area, setArea] = React.useState("");
  const [system, setSystem] = React.useState("");
  const [archived, setArchived] = React.useState(false);
  const [onlyMissing, setOnlyMissing] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [drafts, setDrafts] = React.useState<Map<string, ConfigDraft>>(new Map());
  const [editing, setEditing] = React.useState<VibrationDeviceDto | null>(null);
  // Thao tác hàng loạt (áp lên bản nháp của mọi thiết bị đang lọc, chưa ghi cho tới khi bấm Lưu).
  const [bulkScope, setBulkScope] = React.useState<ScopeKey>("current");
  const [bulkArea, setBulkArea] = React.useState("");
  const [bulkAlert, setBulkAlert] = React.useState<Record<AlertKey, string>>({ vibration: "", vibrationDanger: "", temperature: "", temperatureDanger: "" });

  const { data, isLoading } = useVibrationDevices({ active: "all" });
  const save = useBulkUpdateVibrationDevices();
  const devices = React.useMemo(() => data ?? [], [data]);

  const areas = React.useMemo(() => [...new Set(devices.map((d) => d.area))].sort((a, b) => a.localeCompare(b, "vi")), [devices]);
  const systems = React.useMemo(
    () => [...new Set(devices.filter((d) => !area || d.area === area).map((d) => d.system).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")),
    [devices, area]
  );
  const filtered = React.useMemo(() => {
    const q = foldVn(search.trim());
    return devices.filter(
      (d) =>
        (archived || d.active) &&
        (!area || d.area === area) &&
        (!system || d.system === system) &&
        (tab !== "machine" || !onlyMissing || machineMissing(d.machine) > 0) &&
        (!q || foldVn(`${d.name} ${d.system}`).includes(q))
    );
  }, [devices, search, area, system, archived, onlyMissing, tab]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const dirtyIds = React.useMemo(() => new Set(drafts.keys()), [drafts]);
  const getDraft = React.useCallback((d: VibrationDeviceDto) => drafts.get(d.id) ?? baseDraft(d), [drafts]);
  const byId = React.useMemo(() => new Map(devices.map((d) => [d.id, d])), [devices]);

  const edit = React.useCallback((d: VibrationDeviceDto, fn: (x: ConfigDraft) => ConfigDraft) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(d.id, fn(prev.get(d.id) ?? baseDraft(d)));
      return next;
    });
  }, []);
  const onScope = React.useCallback((id: string, k: ScopeKey, p: Partial<ScopeCfg>) => {
    const d = byId.get(id);
    if (d) edit(d, (x) => ({ ...x, scopes: { ...x.scopes, [k]: { ...x.scopes[k], ...p } } }));
  }, [byId, edit]);
  const onAlert = React.useCallback((id: string, p: Partial<AlertCfg>, text?: Partial<Record<AlertKey, string>>) => {
    const d = byId.get(id);
    if (d) edit(d, (x) => ({ ...x, alert: { ...x.alert, ...p }, alertText: { ...x.alertText, ...text } }));
  }, [byId, edit]);

  function applyBulk(p: { enabled?: boolean; area?: string; alert?: Partial<AlertCfg>; alertEnabled?: boolean }) {
    if (!filtered.length) return;
    setDrafts((prev) => {
      const next = new Map(prev);
      for (const d of filtered) {
        const x = prev.get(d.id) ?? baseDraft(d);
        const scopes = { ...x.scopes };
        if (p.enabled !== undefined) scopes[bulkScope] = { ...scopes[bulkScope], enabled: p.enabled };
        if (p.area !== undefined) scopes[bulkScope] = { ...scopes[bulkScope], area: p.area };
        const alertText = { ...x.alertText };
        for (const k of Object.keys(p.alert ?? {}) as AlertKey[]) delete alertText[k];
        next.set(d.id, { scopes, alert: { ...x.alert, ...(p.alert ?? {}), ...(p.alertEnabled !== undefined ? { enabled: p.alertEnabled } : {}) }, alertText });
      }
      return next;
    });
  }

  function applyBulkAlert() {
    const alert: Partial<AlertCfg> = {};
    for (const f of ALERT_FIELDS) {
      const raw = bulkAlert[f.key].trim();
      if (raw === "") continue;
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) { toast.error(`${f.label}: nhập số không âm`); return; }
      alert[f.key] = n;
    }
    if (!Object.keys(alert).length) { toast.error("Nhập ít nhất một ngưỡng"); return; }
    applyBulk({ alert });
  }

  async function saveAll() {
    const items = [];
    for (const [id, dr] of drafts) {
      const d = byId.get(id);
      if (!d) continue;
      for (const f of ALERT_FIELDS) {
        const raw = dr.alertText[f.key];
        if (raw !== undefined && !(raw.trim() !== "" && Number.isFinite(Number(raw.replace(",", "."))))) { toast.error(`${d.name}: ${f.label} nhập số không âm`); return; }
      }
      const err = alertError(dr.alert);
      if (err) { toast.error(`${d.name}: ${err}`); return; }
      items.push({
        id,
        measurementConfig: Object.fromEntries(SCOPE_KEYS.map((k) => [k, { enabled: dr.scopes[k].enabled, area: dr.scopes[k].area.trim() || undefined }])),
        alertConfig: dr.alert,
      });
    }
    if (!items.length) return;
    try {
      const r = await save.mutateAsync(items);
      setDrafts(new Map());
      toast.success(`Đã lưu cấu hình đo của ${r.updated} thiết bị`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được");
    }
  }

  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };

  return (
    <>
      <div className="page-title-row"><h1 id="title">Cấu hình vùng đo</h1></div>
      <div id="content">
        <div className="view-switch" role="group" aria-label="Chế độ xem">
          {([["scope", "Vùng đo & cảnh báo"], ["machine", "Thông số máy (phân tích rung)"]] as const).map(([v, l]) => (
            <button key={v} type="button" data-measurement-view={v} aria-pressed={tab === v} onClick={() => { setTab(v); setPage(0); }}>{l}</button>
          ))}
        </div>
        <div className="table-toolbar measurement-tools">
          <input id="measurementSearch" type="search" aria-label="Tìm thiết bị" placeholder="Tìm theo tên thiết bị hoặc hệ thống" value={search} onChange={(e) => reset(setSearch)(e.target.value)} />
          <select id="measurementArea" aria-label="Lọc theo cương vị" value={area} onChange={(e) => { setArea(e.target.value); setSystem(""); setPage(0); }}>
            <option value="">Tất cả cương vị</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select aria-label="Lọc theo hệ thống" value={system} onChange={(e) => reset(setSystem)(e.target.value)}>
            <option value="">Tất cả hệ thống</option>
            {systems.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label><input id="measurementArchived" type="checkbox" checked={archived} onChange={(e) => reset(setArchived)(e.target.checked)} /> Cả thiết bị lịch sử</label>
          {tab === "machine" && <label><input type="checkbox" checked={onlyMissing} onChange={(e) => reset(setOnlyMissing)(e.target.checked)} /> Chỉ thiếu thông số</label>}
          {canManage && dirtyIds.size > 0 && <button type="button" className="secondary-button" disabled={save.isPending} onClick={() => setDrafts(new Map())}>Bỏ thay đổi</button>}
          {canManage && tab === "scope" && <button id="saveMeasurementConfig" type="button" className="primary-button" disabled={!dirtyIds.size || save.isPending} onClick={saveAll}>{save.isPending ? "Đang lưu…" : "Lưu cấu hình đo"}{dirtyIds.size ? ` (${dirtyIds.size})` : ""}</button>}
        </div>

        {canManage && tab === "scope" && (
          <div className="mg-bulk">
            <strong>Áp cho {filtered.length} thiết bị đang lọc</strong>
            <select aria-label="Nhóm cột đo" value={bulkScope} onChange={(e) => setBulkScope(e.target.value as ScopeKey)}>
              {SCOPE_KEYS.map((k) => <option key={k} value={k}>{SCOPE_LABEL[k]}</option>)}
            </select>
            <button type="button" className="secondary-button small" disabled={!filtered.length} onClick={() => applyBulk({ enabled: true })}>Bật nhóm</button>
            <button type="button" className="secondary-button small" disabled={!filtered.length} onClick={() => applyBulk({ enabled: false })}>Tắt nhóm</button>
            <ScopeAreaControl k={bulkScope} value={bulkArea} label="Vùng đo áp hàng loạt" onChange={setBulkArea} />
            <button type="button" className="secondary-button small" disabled={!filtered.length || !bulkArea.trim()} onClick={() => applyBulk({ area: bulkArea.trim() })}>Đặt vùng đo</button>
            {ALERT_FIELDS.map((f) => (
              <input key={f.key} inputMode="decimal" placeholder={`${f.label.replace(" (tạm)", "")} (${f.unit})`} aria-label={`${f.label} áp hàng loạt`}
                value={bulkAlert[f.key]} onChange={(e) => setBulkAlert({ ...bulkAlert, [f.key]: e.target.value })} />
            ))}
            <button type="button" className="secondary-button small" disabled={!filtered.length} onClick={applyBulkAlert}>Đặt ngưỡng</button>
            <button type="button" className="secondary-button small" disabled={!filtered.length} onClick={() => applyBulk({ alertEnabled: true })}>Bật cảnh báo</button>
            <button type="button" className="secondary-button small" disabled={!filtered.length} onClick={() => applyBulk({ alertEnabled: false })}>Tắt cảnh báo</button>
          </div>
        )}

        <div id="measurementList">
          {isLoading ? <p className="rs-empty vc-loading">Đang tải cấu hình vùng đo…</p>
            : tab === "scope"
              ? <ConfigScopeTable rows={rows} drafts={getDraft} dirtyIds={dirtyIds} disabled={!canManage} onScope={onScope} onAlert={onAlert} onEdit={setEditing} />
              : <ConfigMachineTable rows={rows} all={devices} disabled={!canManage} onEdit={setEditing} />}
        </div>

        {pages > 1 && (
          <div className="table-toolbar">
            <button type="button" className="secondary-button small" disabled={current === 0} onClick={() => setPage(current - 1)}>Trước</button>
            <span>Trang {current + 1} / {pages}</span>
            <button type="button" className="secondary-button small" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Sau</button>
          </div>
        )}
      </div>

      {editing && (
        <CatalogDeviceDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          device={byId.get(editing.id) ?? editing}
          areas={areas}
          allDevices={devices}
          canManage={canManage}
          isAdmin={isAdmin}
        />
      )}
    </>
  );
}
