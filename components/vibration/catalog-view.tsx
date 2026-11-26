"use client";

import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CatalogDeviceDialog } from "@/components/vibration/catalog-device-dialog";
import { useBulkUpdateVibrationDevices, useUpdateVibrationDevice, useVibrationRecordCounts } from "@/hooks/useVibrationCatalog";
import { useVibrationDevices } from "@/hooks/useVibration";
import { groupsOf } from "@/lib/vibration/catalog";
import { MEASURE_GROUPS } from "@/lib/vibration/constants";
import { foldVn } from "@/lib/vibration/parse";
import type { VibrationDeviceDto } from "@/lib/vibration/types";
import { cn } from "@/lib/utils";
import { DeviceAnalysisLink, deviceAnalysisHref } from "./analysis-links";

const PAGE_SIZE = 50;
const SHORT_GROUP: Record<string, string> = { tuan1: "Th5·T1", tuan2: "Th5·T2", tuan3: "Th5·T3", tuan4: "Th5·T4", thu2: "Th2·HT", thu3: "Th3·HT", thu4: "Th4·HT", thu5: "Th5·HT", thu6: "Th6·HT", thu7: "Th7·HT", chunhat: "CN·HT", hangngay: "HN" };

export function CatalogView({ canManage, isAdmin }: { canManage: boolean; isAdmin: boolean }) {
  const [search, setSearch] = React.useState("");
  const [area, setArea] = React.useState("");
  const [system, setSystem] = React.useState("");
  const [group, setGroup] = React.useState("");
  const [status, setStatus] = React.useState<"active" | "inactive" | "all">("active");
  const [page, setPage] = React.useState(0);
  const [dialog, setDialog] = React.useState<{ device: VibrationDeviceDto | null } | null>(null);
  const [bulk, setBulk] = React.useState<"add" | "remove" | null>(null);

  const { data, isLoading } = useVibrationDevices({ active: "all" });
  const counts = useVibrationRecordCounts();
  const update = useUpdateVibrationDevice();
  const bulkUpdate = useBulkUpdateVibrationDevices();

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
        (status === "all" || (status === "active") === d.active) &&
        (!area || d.area === area) &&
        (!system || d.system === system) &&
        (!group || groupsOf(d.measureGroups).includes(group)) &&
        (!q || foldVn(`${d.name} ${d.system} ${d.area} ${d.legacyId} ${d.equipmentName ?? ""}`).includes(q))
    );
  }, [devices, search, area, system, group, status]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const activeCount = devices.filter((d) => d.active).length;
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };

  async function toggleGroup(d: VibrationDeviceDto, g: string) {
    const cur = new Set(groupsOf(d.measureGroups));
    if (cur.has(g)) cur.delete(g); else cur.add(g);
    try {
      await update.mutateAsync({ id: d.id, patch: { measureGroups: MEASURE_GROUPS.map((x) => x.id).filter((x) => cur.has(x)) } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được kỳ đo");
    }
  }

  async function runBulk() {
    if (!bulk || !group) return;
    const add = bulk === "add";
    const items = filtered.map((d) => {
      const cur = new Set(groupsOf(d.measureGroups));
      if (add) cur.add(group); else cur.delete(group);
      return { id: d.id, measureGroups: MEASURE_GROUPS.map((x) => x.id).filter((x) => cur.has(x)) };
    });
    try {
      const r = await bulkUpdate.mutateAsync(items);
      toast.success(`Đã ${add ? "thêm" : "bỏ"} ${r.updated} thiết bị ${add ? "vào" : "khỏi"} kỳ ${groupName(group)}`);
      setBulk(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được");
    }
  }

  const scopeDevs = devices.filter((d) => (status === "all" || d.active) && (!area || d.area === area));
  const scopeText = area ? `cương vị «${area}»` : "tất cả cương vị";

  return (
    <>
      <div className="page-title-row"><h1 id="title">Danh mục thiết bị</h1></div>
      <div id="content">
        <section className="device-catalog-intro">
          <div>
            <span className="device-catalog-kicker">DANH MỤC QUẢN LÝ</span>
            <h2>Thiết bị cần đo</h2>
            <p>Quản lý tên, hệ thống, cương vị và trạng thái thiết bị. Số liệu đo được nhập và tra cứu tại các menu riêng.</p>
          </div>
          <strong>{activeCount}<small>thiết bị đang theo dõi</small></strong>
        </section>
        <div className="table-toolbar device-catalog-toolbar">
          <input id="search" type="search" aria-label="Tìm thiết bị" placeholder="Tìm mã, tên thiết bị hoặc hệ thống" value={search} onChange={(e) => reset(setSearch)(e.target.value)} />
          <select id="areaFilter" aria-label="Lọc theo cương vị" value={area} onChange={(e) => { setArea(e.target.value); setSystem(""); setPage(0); }}>
            <option value="">Tất cả cương vị</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select aria-label="Lọc theo hệ thống" value={system} onChange={(e) => reset(setSystem)(e.target.value)}>
            <option value="">Tất cả hệ thống</option>
            {systems.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label><input id="archived" type="checkbox" checked={status === "all"} onChange={(e) => reset(setStatus)(e.target.checked ? "all" : "active")} /> Hiện thiết bị lịch sử</label>
          {canManage && <button type="button" className="primary-button" data-add="device" onClick={() => setDialog({ device: null })}>＋ Thêm thiết bị</button>}
        </div>
        <div className="mg-bar">
          <div className="mg-bar-head"><strong>Kỳ đo</strong><small>Thiết bị chưa đặt kỳ mặc định thuộc Thứ 5 hằng tuần. Bấm nút kỳ trên từng dòng để thêm / bỏ thiết bị; Nhập thông số lọc theo kỳ này.</small></div>
          <div className="mg-filters">
            <button type="button" className="mg-filter" aria-pressed={group === ""} onClick={() => reset(setGroup)("")}>Tất cả kỳ<span>{scopeDevs.length}</span></button>
            {MEASURE_GROUPS.map((g) => (
              <button key={g.id} type="button" className="mg-filter" aria-pressed={group === g.id} onClick={() => reset(setGroup)(g.id)}>{g.label}<span>{scopeDevs.filter((d) => groupsOf(d.measureGroups).includes(g.id)).length}</span></button>
            ))}
          </div>
          {canManage && group && (
            <div className="mg-bulk">
              <span>Với {scopeText} ({filtered.length} thiết bị):</span>
              <button type="button" className="secondary-button small" disabled={!filtered.length || bulkUpdate.isPending} onClick={() => setBulk("add")}>Thêm tất cả vào {groupName(group)}</button>
              <button type="button" className="secondary-button small" disabled={!filtered.length || bulkUpdate.isPending} onClick={() => setBulk("remove")}>Bỏ tất cả khỏi {groupName(group)}</button>
            </div>
          )}
        </div>

        <ConfirmDialog
          open={!!bulk}
          onOpenChange={(o) => !o && setBulk(null)}
          title={bulk === "add" ? "Thêm hàng loạt vào kỳ đo?" : "Bỏ hàng loạt khỏi kỳ đo?"}
          description={`${bulk === "add" ? "Thêm" : "Bỏ"} ${filtered.length} thiết bị của ${scopeText} ${bulk === "add" ? "vào" : "khỏi"} kỳ ${groupName(group)}?`}
          confirmLabel="Đồng ý"
          destructive={false}
          loading={bulkUpdate.isPending}
          onConfirm={runBulk}
        />

        <div className="panel device-catalog-panel" id="list">
          {isLoading ? <p className="rs-empty vc-loading">Đang tải danh sách thiết bị…</p> : (
            <div className="device-table-wrap device-inventory-wrap">
              <table className="device-inventory">
                <thead><tr><th>Mã thiết bị</th><th>Tên thiết bị</th><th>Hệ thống</th><th>Cương vị</th><th>Trạng thái</th><th>Kỳ đo</th><th className="device-inventory-action">Thao tác</th></tr></thead>
                <tbody>
                  {rows.map((d) => {
                    const groups = groupsOf(d.measureGroups);
                    return (
                      <tr key={d.id}>
                        <td><span className="device-code">{d.legacyId}</span></td>
                        <td>
                          <strong className="device-inventory-name"><DeviceAnalysisLink href={deviceAnalysisHref(d)} className="ovd-link">{d.name}</DeviceAnalysisLink></strong>
                          <small>{counts.data?.[d.id] ?? 0} lần đo đã lưu</small>
                        </td>
                        <td>{d.system}</td>
                        <td>{d.area}</td>
                        <td><span className={cn("device-state", d.active ? "is-active" : "is-archived")}>{d.active ? "Cần đo" : "Chỉ lưu lịch sử"}</span></td>
                        <td><div className="mg-chips" role="group" aria-label={`Kỳ đo của ${d.name}`}>
  {MEASURE_GROUPS.map((g) => {
    const on = groups.includes(g.id);
    if (!canManage && !on) return null;
    return <button key={g.id} type="button" className="mg-chip" title={g.label} aria-pressed={on} disabled={!canManage || update.isPending} onClick={() => toggleGroup(d, g.id)}>{SHORT_GROUP[g.id]}</button>;
  })}
</div></td>
                        <td className="device-inventory-action"><button type="button" className="secondary-button small" data-device={d.id} aria-label={`${canManage ? "Sửa" : "Xem"} thiết bị ${d.name}`} onClick={() => setDialog({ device: d })}>{canManage ? "Sửa thiết bị" : "Xem thiết bị"}</button></td>
                      </tr>
                    );
                  })}
                  {!rows.length && <tr><td colSpan={7} className="device-inventory-empty">Không có thiết bị phù hợp bộ lọc.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="an-foot">{filtered.length} / {devices.length} thiết bị · {activeCount} đang theo dõi. Thiết bị chưa đặt kỳ mặc định thuộc Thứ 5 hàng tuần.</p>

        {pages > 1 && (
          <div className="table-toolbar">
            <button type="button" className="secondary-button small" disabled={current === 0} onClick={() => setPage(current - 1)}>Trước</button>
            <span>Trang {current + 1} / {pages}</span>
            <button type="button" className="secondary-button small" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Sau</button>
          </div>
        )}
      </div>

      {dialog && (
        <CatalogDeviceDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          device={dialog.device ? devices.find((x) => x.id === dialog.device!.id) ?? dialog.device : null}
          areas={areas}
          allDevices={devices}
          canManage={canManage}
          isAdmin={isAdmin}
        />
      )}
    </>
  );
}

const groupName = (g: string) => MEASURE_GROUPS.find((x) => x.id === g)?.label ?? g;

