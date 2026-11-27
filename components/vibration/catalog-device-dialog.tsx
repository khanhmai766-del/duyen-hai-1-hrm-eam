"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { VcModal } from "@/components/vibration/vc-modal";
import { CatalogMachineForm, formToMachine, machineToForm, type MachineForm } from "@/components/vibration/catalog-machine-form";
import { ScopeAreaControl, SCOPE_LABEL } from "@/components/vibration/config-scope-table";
import { useCreateVibrationDevice, useDeleteVibrationDevice, useUpdateVibrationDevice, useVibrationDevice } from "@/hooks/useVibrationCatalog";
import { ALERT_FIELDS, SCOPE_KEYS, alertError, normalizeAlertConfig, normalizeMeasurementConfig, type AlertKey, type DevicePatch, type ScopeCfg, type ScopeKey } from "@/lib/vibration/catalog";
import { DEFAULT_MEASURE_GROUP, MEASURE_GROUPS } from "@/lib/vibration/constants";
import type { VibrationDeviceDto } from "@/lib/vibration/types";


interface FormState {
  area: string; system: string; name: string; active: boolean; sortOrder: string;
  groups: string[];
  scopes: Record<ScopeKey, ScopeCfg>;
  alertEnabled: boolean; alertText: Record<AlertKey, string>;
  machine: MachineForm; machineTouched: boolean;
}

function initial(d: VibrationDeviceDto | null, defaultArea: string): FormState {
  const alert = normalizeAlertConfig(d?.alertConfig);
  return {
    area: d?.area ?? defaultArea, system: d?.system ?? "", name: d?.name ?? "", active: d?.active ?? true,
    sortOrder: String(d?.sortOrder ?? 0),
    // Chưa khai báo ⇒ mặc định Thứ 5 hàng tuần (hiển thị, không ghi nếu người dùng không đổi).
    groups: d?.measureGroups.length ? [...d.measureGroups] : d ? [DEFAULT_MEASURE_GROUP] : [],
    scopes: normalizeMeasurementConfig(d?.measurementConfig),
    alertEnabled: alert.enabled,
    alertText: Object.fromEntries(ALERT_FIELDS.map((f) => [f.key, String(alert[f.key])])) as Record<AlertKey, string>,
    machine: machineToForm(d?.machine), machineTouched: false,
  };
}

/** Hộp thêm / sửa thiết bị đo độ rung. `device = null` ⇒ thêm mới. */
export function CatalogDeviceDialog({
  open, onOpenChange, device, areas, allDevices, canManage, isAdmin,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  device: VibrationDeviceDto | null;
  areas: string[];
  allDevices: VibrationDeviceDto[];
  canManage: boolean;
  isAdmin: boolean;
}) {
  const [f, setF] = React.useState<FormState>(() => initial(device, areas[0] ?? ""));
  const [error, setError] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const detail = useVibrationDevice(open && device ? device.id : null);
  const create = useCreateVibrationDevice();
  const update = useUpdateVibrationDevice();
  const remove = useDeleteVibrationDevice();
  const busy = create.isPending || update.isPending || remove.isPending;
  const ro = !canManage;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const recordCount = detail.data?.recordCount;
  const areaChoices = React.useMemo(() => [...new Set([...areas, f.area].filter(Boolean))], [areas, f.area]);
  const pairOptions = React.useMemo(
    () => allDevices.filter((x) => x.id !== device?.id && x.area === f.area && x.system === f.system).map((x) => ({ value: x.legacyId, label: `${x.name} · ${x.legacyId.slice(0, 12)}` })),
    [allDevices, device?.id, f.area, f.system]
  );

  /** Thiết bị chưa khai báo kỳ đo mà người dùng không đổi ⇒ giữ rỗng (hiểu là Thứ 5 hàng tuần). */
  function groupsPatch() {
    const ids = MEASURE_GROUPS.map((g) => g.id).filter((g) => f.groups.includes(g));
    return device && !device.measureGroups.length && ids.length === 1 && ids[0] === DEFAULT_MEASURE_GROUP ? [] : ids;
  }

  function buildPatch(): DevicePatch | null {
    const name = f.name.trim(), area = f.area.trim();
    if (!area || !name) { setError("Điền đủ cương vị và tên thiết bị."); return null; }
    const alertNums = Object.fromEntries(ALERT_FIELDS.map((x) => [x.key, Number(f.alertText[x.key].trim().replace(",", "."))])) as Record<AlertKey, number>;
    if (ALERT_FIELDS.some((x) => f.alertText[x.key].trim() === "")) { setError("Nhập đủ 4 ngưỡng cảnh báo."); return null; }
    const alert = { enabled: f.alertEnabled, ...alertNums };
    const ae = alertError(alert);
    if (ae) { setError(ae); return null; }
    const sortOrder = Number(f.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) { setError("Thứ tự phải là số nguyên không âm."); return null; }
    const patch: DevicePatch = {
      area, system: f.system.trim(), name, active: f.active, sortOrder,
      measureGroups: groupsPatch(),
      measurementConfig: Object.fromEntries(SCOPE_KEYS.map((k) => [k, { enabled: f.scopes[k].enabled, area: f.scopes[k].area.trim() || undefined }])),
      alertConfig: alert,
    };
    if (f.machineTouched || !device) {
      const m = formToMachine(f.machine);
      if (m.error) { setError(m.error); return null; }
      if (f.machineTouched) patch.machine = m.patch;
    }
    return patch;
  }

  async function save() {
    setError("");
    const patch = buildPatch();
    if (!patch) return;
    try {
      if (device) await update.mutateAsync({ id: device.id, patch });
      else await create.mutateAsync({ ...patch, area: patch.area!, name: patch.name! });
      toast.success(device ? "Đã lưu thiết bị" : "Đã thêm thiết bị");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được");
    }
  }

  async function doDelete() {
    if (!device) return;
    try {
      await remove.mutateAsync(device.id);
      toast.success(`Đã xoá “${device.name}”`);
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xoá được");
    }
  }

  const toggleGroup = (g: string) => set("groups", f.groups.includes(g) ? f.groups.filter((x) => x !== g) : [...f.groups, g]);

  return (
    <>
      <VcModal onClose={() => { if (!confirmDelete) onOpenChange(false); }}>
        <form className="modal vc-modal-wide" onSubmit={(e) => { e.preventDefault(); if (!ro) save(); }}>
          <div className="modal-header">
            <h2>{device ? (ro ? "Thiết bị đo độ rung" : "Sửa thiết bị đo") : "Thêm thiết bị đo độ rung"}</h2>
            <button type="button" className="close-button" aria-label="Đóng" onClick={() => onOpenChange(false)}>×</button>
          </div>
          <div className="modal-body">
          <p className="device-edit-note">
            {device ? `Mã ${device.legacyId}. Các lần đo đã lưu được giữ nguyên. Nếu đổi cương vị, hãy kiểm tra cấu hình vùng đo của thiết bị.` : "Thiết bị mới có mã NEW-… và cấu hình vùng đo / ngưỡng mặc định."}
          </p>

          <div className="form-grid">
            <label>Cương vị
              <select disabled={ro} value={f.area} onChange={(e) => set("area", e.target.value)}>
                {areaChoices.map((a) => <option key={a}>{a}</option>)}
              </select>
            </label>
            <label>Hệ thống
              <input disabled={ro} value={f.system} onChange={(e) => set("system", e.target.value)} />
            </label>
            <label className="full-field">Tên thiết bị
              <input disabled={ro} value={f.name} onChange={(e) => set("name", e.target.value)} />
            </label>
            <label>Trạng thái
              <select disabled={ro} value={f.active ? "1" : "0"} onChange={(e) => set("active", e.target.value === "1")}>
                <option value="1">Cần đo</option>
                <option value="0">Chỉ lưu lịch sử</option>
              </select>
            </label>
            <label>Thứ tự hiển thị
              <input inputMode="numeric" disabled={ro} value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
            </label>

            <div className="full-field">
              <h3>Kỳ đo</h3>
              <p className="machine-hint">Thiết bị chưa đặt kỳ mặc định thuộc Thứ 5 hàng tuần. Nhập thông số lọc theo kỳ này.</p>
              <div className="mg-chips">
                {MEASURE_GROUPS.map((g) => (
                  <button key={g.id} type="button" className="mg-chip" disabled={ro} aria-pressed={f.groups.includes(g.id)} onClick={() => toggleGroup(g.id)}>{g.label}</button>
                ))}
              </div>
            </div>

            <div className="full-field">
              <h3>Khai báo vùng đo &amp; cảnh báo</h3>
              <div className="scope-options">
                {SCOPE_KEYS.map((k) => (
                  <div key={k} className="scope-card">
                    <label className="scope-toggle">
                      <input type="checkbox" disabled={ro} checked={f.scopes[k].enabled} onChange={(e) => set("scopes", { ...f.scopes, [k]: { ...f.scopes[k], enabled: e.target.checked } })} />
                      {SCOPE_LABEL[k]}
                    </label>
                    <ScopeAreaControl k={k} value={f.scopes[k].area} disabled={ro} label={`Vùng đo ${SCOPE_LABEL[k]}`} onChange={(v) => set("scopes", { ...f.scopes, [k]: { ...f.scopes[k], area: v } })} />
                  </div>
                ))}
              </div>
            </div>
            <div className="full-field">
              <label className="scope-toggle">
                <input type="checkbox" disabled={ro} checked={f.alertEnabled} onChange={(e) => set("alertEnabled", e.target.checked)} /> Cảnh báo
              </label>
              <p className="machine-hint">Ngưỡng rung tạm khi chưa đủ thông số máy. Ngưỡng nhiệt luôn dùng cấu hình này.</p>
            </div>
            {ALERT_FIELDS.map((a) => (
              <label key={a.key}>{a.label} ({a.unit})
                <input inputMode="decimal" disabled={ro} value={f.alertText[a.key]} onChange={(e) => set("alertText", { ...f.alertText, [a.key]: e.target.value })} />
              </label>
            ))}

            <details className="full-field" open={!!device?.machine}>
              <summary>Thông số máy phục vụ phân tích rung</summary>
              <CatalogMachineForm
                value={f.machine}
                disabled={ro}
                nameGuess={`${f.name} ${f.system}`}
                pairOptions={pairOptions}
                onChange={(k, v) => setF((s) => ({ ...s, machine: { ...s.machine, [k]: v }, machineTouched: true }))}
              />
            </details>

            {device && (
              <div className="full-field">
                <h3>Thiết bị trong cây</h3>
                {device.equipmentSeq ? (
                  <p><Link href={`/devices/${device.equipmentSeq}`} className="text-button">{device.equipmentName ?? device.equipmentSeq}</Link> <span className="device-code">{device.equipmentSeq}</span></p>
                ) : <p className="machine-hint">Chưa ánh xạ (gán ở trang Ánh xạ thiết bị độ rung).</p>}
              </div>
            )}
          </div>
          {error && <p className="an-warn" role="alert">{error}</p>}
          </div>

          <div className="form-actions">
            {device && isAdmin && canManage && (
              <button type="button" className="secondary-button" style={{ marginRight: "auto" }} disabled={busy || detail.isLoading || (recordCount ?? 0) > 0} onClick={() => setConfirmDelete(true)}
                title={(recordCount ?? 0) > 0 ? `Có ${recordCount} bản ghi đo — chỉ có thể chuyển sang “Chỉ lưu lịch sử”` : undefined}>Xoá thiết bị</button>
            )}
            <button type="button" className="secondary-button" onClick={() => onOpenChange(false)}>{ro ? "Đóng" : "Huỷ"}</button>
            {!ro && <button type="submit" className="primary-button" disabled={busy}>{create.isPending || update.isPending ? "Đang lưu…" : "Lưu"}</button>}
          </div>
        </form>
      </VcModal>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Xoá thiết bị?"
        description={`Xoá hẳn “${device?.name ?? ""}” tại ${device?.area ?? ""} / ${device?.system ?? ""}. Thiết bị chưa có số đo nào. Không thể hoàn tác.`}
        confirmLabel="Xoá"
        loading={remove.isPending}
        onConfirm={doDelete}
      />
    </>
  );
}
