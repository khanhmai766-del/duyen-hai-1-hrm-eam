"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, RotateCcw, Save, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { normalizeText } from "@/lib/nav";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCtktktPermissions, useSaveCtktktPermissions, type CtktktPermissionSettings } from "@/hooks/useCtktktPermissions";
import { CTKTKT_PERMISSION_GROUPS, POSITION_PERMISSION_IDS, POSITION_PERMISSION_LABELS, ctktktPositionKey, type PositionGrants, type PositionPermission } from "../lib/auth/position-permissions";

const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50";
export function PositionPermissionsPanel() {
  const query = useCtktktPermissions();
  if (query.isPending) return <p role="status" className="p-4">Đang tải phân quyền KTKT…</p>;
  if (query.isError) return <div role="alert" className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4"><p>{query.error.message}</p><button className={button} onClick={() => void query.refetch()}>Tải lại cấu hình</button></div>;
  return <PermissionEditor key={query.data.version} settings={query.data} reload={() => query.refetch()}/>;
}

function PermissionEditor({ settings, reload }: { settings: CtktktPermissionSettings; reload: () => unknown }) {
  const [grants, setGrants] = useState<PositionGrants>(settings.grants);
  const [groupIndex, setGroupIndex] = useState(0), [search, setSearch] = useState("");
  const [onlyAssigned, setOnlyAssigned] = useState(false), [resetOpen, setResetOpen] = useState(false), [reloadOpen, setReloadOpen] = useState(false);
  const save = useSaveCtktktPermissions(), router = useRouter();
  const viewport = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(grants) !== JSON.stringify(settings.grants);
  const groups = settings.delegatedOnly ? CTKTKT_PERMISSION_GROUPS.map(g => ({...g, ids:g.ids.filter(id => settings.editablePermissionIds?.includes(id))})).filter(g => g.ids.length) : CTKTKT_PERMISSION_GROUPS;
  const group = groups[groupIndex] || groups[0];
  const positions = settings.positions.filter(position => (!settings.delegatedOnly || settings.operatorPositions?.includes(position)) && normalizeText(position).includes(normalizeText(search)) && (!onlyAssigned || POSITION_PERMISSION_IDS.some(id => granted(id, position))));
  function granted(id: PositionPermission, position: string) { return grants[id].some(p => ctktktPositionKey(p) === ctktktPositionKey(position)); }
  function toggle(id: PositionPermission, position: string) {
    setGrants(current => ({ ...current, [id]: granted(id, position) ? current[id].filter(p => ctktktPositionKey(p) !== ctktktPositionKey(position)) : [...current[id], position] }));
  }
  function toggleColumn(id: PositionPermission) {
    const selected = positions.every(position => granted(id, position));
    setGrants(current => ({ ...current, [id]: selected ? current[id].filter(p => !positions.some(position => ctktktPositionKey(position) === ctktktPositionKey(p))) : [...current[id], ...positions.filter(position => !granted(id, position))] }));
  }
  function revealCell(element: HTMLElement) {
    const container = viewport.current, cell = element.closest("td");
    if (!container || !cell) return;
    const bounds = container.getBoundingClientRect(), target = cell.getBoundingClientRect();
    const pinnedWidth = container.querySelector("thead th")?.getBoundingClientRect().width ?? 155;
    const left = bounds.left + pinnedWidth + 1, right = bounds.right - 1;
    // Ô đang thao tác phải nằm ngoài cột cương vị cố định, kể cả khi bàn phím tự cuộn bảng.
    if (target.left < left) container.scrollLeft += target.left - left;
    else if (target.right > right) container.scrollLeft += target.right - right;
  }
  async function submit() {
    try {
      await save.mutateAsync({ grants, expectedVersion: settings.version });
      toast.success("Đã lưu phân quyền KTKT. Quyền được kiểm tra lại ở lần thao tác tiếp theo.");
      router.refresh();
    } catch { /* Lỗi giữ cùng bản nháp để người dùng kiểm tra/tải lại. */ }
  }
  return <section className="min-w-0 space-y-4" aria-label="Phân quyền KTKT">
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><ShieldCheck className="size-5 shrink-0"/>Phân quyền KTKT</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">Tích chọn quyền nhập liệu cho từng cương vị đang làm việc. TKĐ và Trưởng ca chỉ phân công cho VHV trong KTKT; quyền quản trị do quản trị viên cấu hình. Bỏ trống là không cấp quyền.</p>
      <p className="mt-1 text-sm leading-6 text-slate-700"><strong>Toàn quyền KTKT</strong> bao gồm mọi chức năng. Quản trị viên web đang bật chế độ quản trị luôn có toàn quyền.</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <button className={button} disabled={save.isPending} onClick={() => dirty ? setReloadOpen(true) : reload()}><RefreshCw className="size-4"/>Tải lại cấu hình</button>
      <button className={button} disabled={save.isPending || settings.delegatedOnly} onClick={() => setResetOpen(true)}><RotateCcw className="size-4"/>Khôi phục mặc định bản gốc</button>
      <button className={`${button} border-blue-700 bg-blue-700 text-white`} disabled={!dirty || save.isPending} onClick={() => void submit()}><Save className="size-4"/>{save.isPending ? "Đang lưu…" : "Lưu phân quyền"}</button>
    </div>
    <p role="status" className="text-sm text-slate-600">{dirty ? "Có thay đổi chưa lưu." : settings.version ? `Đã lưu phiên bản ${settings.version}.` : "Đang áp dụng mặc định bản gốc; chưa có cấu hình riêng."}</p>
    {save.isError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{save.error.message}</p>}
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-semibold">Nhóm quyền<select aria-label="Nhóm quyền" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base sm:text-sm" value={groupIndex} onChange={event => setGroupIndex(Number(event.target.value))}>{groups.map((item, index) => <option value={index} key={item.label}>{item.label}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-semibold">Tìm cương vị<input aria-label="Tìm cương vị" className="min-h-10 w-full rounded-lg border border-slate-300 px-3 text-base sm:text-sm" placeholder="Ví dụ: Trưởng kíp điện" value={search} onChange={event => setSearch(event.target.value)}/></label>
      <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={onlyAssigned} onChange={event => setOnlyAssigned(event.target.checked)}/>Chỉ hiện cương vị đã cấp quyền</label>
      <span className="flex items-center gap-2 text-sm text-slate-600"><Users className="size-4"/>{positions.length}/{settings.positions.length} cương vị</span>
    </div>
    <p className="text-sm text-slate-600">Cuộn ngang để xem đủ quyền. Nút ở tiêu đề chọn hoặc bỏ toàn bộ cương vị đang hiển thị.</p>
    <div ref={viewport} className="max-h-[65vh] overflow-auto rounded-xl border border-slate-200 bg-white" aria-label={`Bảng quyền ${group.label}`}>
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-20 bg-slate-100"><tr><th className="sticky left-0 z-30 min-w-[155px] border-b border-r border-slate-200 bg-slate-100 p-3 text-left">Cương vị</th>{group.ids.map(id => <th key={id} className="min-w-[145px] border-b border-r border-slate-200 p-2"><button type="button" disabled={!positions.length || save.isPending} className="min-h-10 w-full rounded-lg p-2 text-left hover:bg-blue-100" onClick={() => toggleColumn(id)}><span className="block font-semibold">{POSITION_PERMISSION_LABELS[id]}</span><span className="mt-1 block text-xs font-normal text-slate-600">{grants[id].length} cương vị</span></button></th>)}</tr></thead>
        <tbody>{positions.map(position => <tr key={position}><th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white p-3 text-left font-medium">{position}</th>{group.ids.map(id => <td key={id} className="border-b border-r border-slate-100 p-1 text-center"><label className="mx-auto inline-flex size-10 cursor-pointer items-center justify-center rounded-lg hover:bg-blue-50"><input type="checkbox" aria-label={`${position} — ${POSITION_PERMISSION_LABELS[id]}`} className="size-5 accent-blue-700" checked={granted(id, position)} disabled={save.isPending} onFocus={event => { if (event.currentTarget.matches(":focus-visible")) revealCell(event.currentTarget); }} onChange={event => { toggle(id, position); revealCell(event.currentTarget); }}/></label></td>)}</tr>)}</tbody>
      </table>
      {!positions.length && <p className="p-4 text-sm text-slate-600">Không tìm thấy cương vị phù hợp.</p>}
    </div>
    <Dialog open={resetOpen} onOpenChange={setResetOpen}><DialogContent><DialogHeader><DialogTitle>Khôi phục mặc định bản gốc?</DialogTitle><DialogDescription>Thay toàn bộ lựa chọn trong bản nháp bằng quyền mặc định theo cương vị của bản gốc. Bạn cần bấm Lưu phân quyền để áp dụng.</DialogDescription></DialogHeader><DialogFooter><button className={button} onClick={() => setResetOpen(false)}>Hủy</button><button className={`${button} bg-blue-700 text-white`} onClick={() => { setGrants(settings.defaults); setResetOpen(false); }}>Dùng mặc định cho bản nháp</button></DialogFooter></DialogContent></Dialog>
    <Dialog open={reloadOpen} onOpenChange={setReloadOpen}><DialogContent><DialogHeader><DialogTitle>Bỏ thay đổi chưa lưu?</DialogTitle><DialogDescription>Tải lại bảng phân quyền đang lưu trên máy chủ. Các lựa chọn chưa lưu sẽ bị bỏ.</DialogDescription></DialogHeader><DialogFooter><button className={button} onClick={() => setReloadOpen(false)}>Giữ bản nháp</button><button className={`${button} bg-blue-700 text-white`} onClick={() => { setReloadOpen(false); setGrants(settings.grants); reload(); }}>Bỏ thay đổi và tải lại</button></DialogFooter></DialogContent></Dialog>
  </section>;
}
