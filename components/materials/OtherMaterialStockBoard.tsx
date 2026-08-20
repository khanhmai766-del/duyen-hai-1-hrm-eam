"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, CalendarDays, History, ListTree, Loader2, MapPin, PackageCheck, Pencil, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiMutate } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type StockMaterial = {
  id: string; code: string; erpCodes: string[]; name: string; unit: string; category: string | null; machine: string;
  quantity: number; location: string | null; scope: "COMMON" | "POSITION"; positions: string[];
  canUse: boolean; allowedUsePositions: string[];
  devices: Array<{ seq: string; name: string; kks: string | null; managingPosition: string | null }>;
};
type StockMovement = {
  id: string; type: "RECEIPT" | "ISSUE" | "USE"; erpCodes: string[]; quantity: number; stockBefore: number; stockAfter: number;
  occurredAt: string; assignedPosition: string | null; unit: string | null; deviceSeq: string | null;
  receiverName: string | null; issuerName: string | null; createdByName: string; note: string | null;
  material: { id: string; code: string; name: string; unit: string; category: string | null; machine: string };
};
type StockData = {
  materials: StockMaterial[];
  movements: StockMovement[];
  users: Array<{ id: string; name: string; position: string | null; currentPosition: string | null }>;
  canIssue: boolean;
  canEditLocation: boolean;
  movementPagination: { page: number; pageSize: number; total: number; totalPages: number; search: string };
};

const movementLabel = { RECEIPT: "Nhập từ phiếu", ISSUE: "Cấp vật tư", USE: "Sử dụng" } as const;
const day = (value: string) => new Date(value).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function OtherMaterialStockBoard() {
  const qc = useQueryClient();
  const [historyPage, setHistoryPage] = useState(1);
  const [historySearchInput, setHistorySearchInput] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["other-material-stock", historyPage, historySearch],
    queryFn: () => apiGet<StockData>(`/api/material-stock-movements?page=${historyPage}&pageSize=20&search=${encodeURIComponent(historySearch)}`),
    placeholderData: (previous) => previous,
  });
  const stock = data?.data;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [selected, setSelected] = useState<StockMaterial | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [receiverId, setReceiverId] = useState("");
  const [position, setPosition] = useState("");
  const [deviceSeq, setDeviceSeq] = useState("");
  const [note, setNote] = useState("");
  const [locationMaterial, setLocationMaterial] = useState<StockMaterial | null>(null);
  const [locationInput, setLocationInput] = useState("");
  const [codesMaterial, setCodesMaterial] = useState<StockMaterial | null>(null);

  const categories = useMemo(() => [...new Set((stock?.materials ?? []).map((row) => row.category || "Chưa phân loại"))], [stock?.materials]);
  const materials = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("vi");
    return (stock?.materials ?? []).filter((row) =>
      (category === "ALL" || (row.category || "Chưa phân loại") === category)
      && (!q || `${row.code} ${row.erpCodes.join(" ")} ${row.name} ${row.category ?? ""} ${row.positions.join(" ")}`.toLocaleLowerCase("vi").includes(q))
    );
  }, [category, search, stock?.materials]);
  const matchingDevices = selected?.devices.filter((device) => !position || device.managingPosition === position) ?? [];
  const canOperate = (row: StockMaterial) => row.scope === "COMMON" ? Boolean(stock?.canIssue) : row.canUse;

  const mutation = useMutation({
    mutationFn: () => apiMutate("/api/material-stock-movements", "POST", {
      type: selected?.scope === "COMMON" ? "ISSUE" : "USE",
      materialId: selected?.id,
      quantity,
      occurredAt,
      receiverId: selected?.scope === "COMMON" ? receiverId : undefined,
      assignedPosition: selected?.scope === "POSITION" ? position : undefined,
      deviceSeq: selected?.scope === "POSITION" ? deviceSeq : undefined,
      note,
    }),
    onSuccess: () => {
      toast.success(selected?.scope === "COMMON" ? "Đã cấp vật tư và trừ Hiện có" : "Đã ghi nhận sử dụng và trừ Hiện có");
      setSelected(null); setQuantity(1); setReceiverId(""); setPosition(""); setDeviceSeq(""); setNote("");
      qc.invalidateQueries({ queryKey: ["other-material-stock"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["material-ticket-options"] });
    },
    onError: (reason) => toast.error(reason instanceof Error ? reason.message : "Không thể ghi nhận tồn kho"),
  });
  const locationMutation = useMutation({
    mutationFn: () => apiMutate("/api/material-stock-movements", "PATCH", { materialId: locationMaterial?.id, location: locationInput.trim() }),
    onSuccess: () => {
      toast.success("Đã cập nhật vị trí lưu vật tư");
      setLocationMaterial(null); setLocationInput("");
      qc.invalidateQueries({ queryKey: ["other-material-stock"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
    },
    onError: (reason) => toast.error(reason instanceof Error ? reason.message : "Không thể cập nhật vị trí"),
  });

  const canSubmit = selected && quantity > 0 && quantity <= selected.quantity && occurredAt && note.trim()
    && (selected.scope === "COMMON" ? receiverId : position && (!matchingDevices.length || deviceSeq));

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white shadow-sm">
        <Boxes className="mb-4 h-5 w-5 text-sky-300" /><p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Danh mục đang theo dõi</p><p className="mt-1 text-3xl font-black">{stock?.materials.length ?? 0}</p>
      </div>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
        <PackageCheck className="mb-4 h-5 w-5 text-emerald-600" /><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Vật tư còn hàng</p><p className="mt-1 text-3xl font-black">{stock?.materials.filter((row) => row.quantity > 0).length ?? 0}</p>
      </div>
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-950">
        <History className="mb-4 h-5 w-5 text-blue-600" /><p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Lượt nhập / cấp / dùng</p><p className="mt-1 text-3xl font-black">{stock?.movementPagination.total ?? 0}</p>
      </div>
    </div>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 className="font-bold text-slate-900">Hiện có tại phân xưởng</h2><p className="text-sm text-slate-500">“Chung” được cấp cho người nhận; vật tư có cương vị chỉ ghi nhận sử dụng.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex h-10 items-center rounded-xl border border-slate-200 px-3"><Search className="h-4 w-4 text-slate-400"/><input className="ml-2 w-56 bg-transparent text-sm outline-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã hoặc tên vật tư" /></label>
          <select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">Tất cả loại con</option>{categories.map((value) => <option key={value}>{value}</option>)}</select>
        </div>
      </div>
      {isLoading ? <div className="flex items-center justify-center gap-2 p-12 text-slate-500"><Loader2 className="h-5 w-5 animate-spin"/>Đang tải tồn kho…</div>
        : error ? <div className="p-8 text-center text-red-600">{error instanceof Error ? error.message : "Không tải được dữ liệu"}</div>
        : <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Vật tư</th><th className="px-4 py-3">Nhóm con</th><th className="px-4 py-3">Phạm vi</th><th className="px-4 py-3">Vị trí</th><th className="px-4 py-3 text-right">Hiện có</th><th className="px-4 py-3 text-right">Nghiệp vụ</th></tr></thead><tbody className="divide-y divide-slate-100">{materials.map((row) => <tr key={row.id} className="hover:bg-slate-50/70"><td className="px-4 py-3"><b className="block text-slate-900">{row.name}</b><button type="button" className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline" onClick={() => setCodesMaterial(row)}><ListTree className="h-3.5 w-3.5"/>{row.erpCodes.length > 1 ? `${row.erpCodes.length} mã ERP` : row.erpCodes[0]}</button><span className="text-xs text-slate-400"> · {row.machine}</span></td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{row.category}</span></td><td className="px-4 py-3">{row.scope === "COMMON" ? <span className="font-semibold text-cyan-700">Chung</span> : <span>{row.positions.join(", ")}</span>}</td><td className="px-4 py-3"><div className="flex max-w-[230px] items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-slate-400"/><span className={row.location ? "font-medium text-slate-700" : "italic text-slate-400"}>{row.location || "Chưa cập nhật"}</span>{stock?.canEditLocation && <button type="button" className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-700" title="Sửa vị trí" onClick={() => { setLocationMaterial(row); setLocationInput(row.location ?? ""); }}><Pencil className="h-3.5 w-3.5"/></button>}</div></td><td className="px-4 py-3 text-right"><strong className={row.quantity > 0 ? "text-xl text-emerald-700" : "text-xl text-red-600"}>{row.quantity.toLocaleString("vi-VN")}</strong> <span className="text-slate-500">{row.unit}</span></td><td className="px-4 py-3 text-right"><Button size="sm" variant={row.scope === "COMMON" ? "default" : "soft"} disabled={row.quantity <= 0 || !canOperate(row)} title={!canOperate(row) ? `Bạn chưa được phân quyền ${row.scope === "COMMON" ? "cấp vật tư" : "ghi nhận sử dụng"}` : undefined} onClick={() => { setSelected(row); setPosition(row.allowedUsePositions[0] ?? ""); setDeviceSeq(""); }} >{row.scope === "COMMON" ? <ArrowUpFromLine className="h-4 w-4"/> : <PackageCheck className="h-4 w-4"/>}{row.scope === "COMMON" ? "Cấp vật tư" : "Ghi nhận sử dụng"}</Button></td></tr>)}</tbody></table>{materials.length === 0 && <div className="p-10 text-center text-slate-500">Không có vật tư phù hợp bộ lọc.</div>}</div>}
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">Lịch sử nhập – cấp – sử dụng</h2><p className="text-sm text-slate-500">Tổng {stock?.movementPagination.total ?? 0} bản ghi · 20 dòng mỗi trang.</p></div><form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setHistoryPage(1); setHistorySearch(historySearchInput.trim()); }}><label className="flex h-10 items-center rounded-xl border border-slate-200 px-3"><Search className="h-4 w-4 text-slate-400"/><input className="ml-2 w-full bg-transparent text-sm outline-none sm:w-72" value={historySearchInput} onChange={(event) => setHistorySearchInput(event.target.value)} placeholder="Tìm vật tư, người nhận, ghi chú…" /></label><Button type="submit" variant="outline">Tìm</Button></form></div>
      <div className="max-h-[620px] overflow-auto"><table className="w-full min-w-[1000px] text-sm"><thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Ngày</th><th className="px-4 py-3">Nghiệp vụ</th><th className="px-4 py-3">Vật tư</th><th className="px-4 py-3">Số lượng</th><th className="px-4 py-3">Người nhận / thực hiện</th><th className="px-4 py-3">Hiện có</th><th className="px-4 py-3">Ghi chú</th></tr></thead><tbody className="divide-y divide-slate-100">{(stock?.movements ?? []).map((row) => <tr key={row.id}><td className="px-4 py-3 whitespace-nowrap">{day(row.occurredAt)}</td><td className="px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${row.type === "RECEIPT" ? "bg-emerald-50 text-emerald-700" : row.type === "ISSUE" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{row.type === "RECEIPT" ? <ArrowDownToLine className="h-3.5 w-3.5"/> : <ArrowUpFromLine className="h-3.5 w-3.5"/>}{movementLabel[row.type]}</span></td><td className="px-4 py-3"><b>{row.material.name}</b><small className="block text-slate-500">{row.erpCodes.length ? row.erpCodes.join(" · ") : row.material.code}</small></td><td className="px-4 py-3 font-bold">{row.type === "RECEIPT" ? "+" : "−"}{row.quantity} {row.material.unit}</td><td className="px-4 py-3">{row.receiverName || row.createdByName}<small className="block text-slate-500">{row.type === "ISSUE" ? `Người phát: ${row.issuerName}` : row.assignedPosition}</small></td><td className="px-4 py-3 font-semibold">{row.stockBefore} → {row.stockAfter}</td><td className="max-w-[260px] px-4 py-3 text-slate-600">{row.note || "—"}</td></tr>)}</tbody></table>{(stock?.movements.length ?? 0) === 0 && <div className="p-10 text-center text-slate-500">Không tìm thấy lịch sử phù hợp.</div>}</div>
      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3"><span className="text-sm text-slate-500">Trang {stock?.movementPagination.page ?? 1}/{stock?.movementPagination.totalPages ?? 1}</span><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={(stock?.movementPagination.page ?? 1) <= 1} onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}>Trang trước</Button><Button type="button" size="sm" variant="outline" disabled={(stock?.movementPagination.page ?? 1) >= (stock?.movementPagination.totalPages ?? 1)} onClick={() => setHistoryPage((page) => page + 1)}>Trang sau</Button></div></div>
    </section>

    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{selected?.scope === "COMMON" ? "Cấp vật tư từ Hiện có" : "Ghi nhận sử dụng vật tư"}</DialogTitle><DialogDescription>{selected?.name} · Hiện có {selected?.quantity} {selected?.unit}</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3"><div><Label>Số lượng *</Label><Input className="mt-1.5" type="number" min={1} max={selected?.quantity} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.trunc(Number(event.target.value)) || 1))}/></div><div><Label>{selected?.scope === "COMMON" ? "Ngày cấp" : "Ngày sử dụng"} *</Label><Input className="mt-1.5" type="date" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)}/></div></div>
          {selected?.scope === "COMMON" ? <div><Label>Người lấy vật tư *</Label><select className="mt-1.5 h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={receiverId} onChange={(event) => setReceiverId(event.target.value)}><option value="">— Chọn người nhận —</option>{stock?.users.map((user) => <option key={user.id} value={user.id}>{user.name}{user.currentPosition || user.position ? ` · ${user.currentPosition || user.position}` : ""}</option>)}</select></div> : <><div><Label>Cương vị sử dụng *</Label><select className="mt-1.5 h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={position} onChange={(event) => { setPosition(event.target.value); setDeviceSeq(""); }}><option value="">— Chọn cương vị —</option>{selected?.allowedUsePositions.map((value) => <option key={value}>{value}</option>)}</select></div>{matchingDevices.length > 0 && <div><Label>Thiết bị *</Label><select className="mt-1.5 h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={deviceSeq} onChange={(event) => setDeviceSeq(event.target.value)}><option value="">— Chọn thiết bị —</option>{matchingDevices.map((device) => <option key={device.seq} value={device.seq}>{device.name}{device.kks ? ` · ${device.kks}` : ""}</option>)}</select></div>}</>}
          <div><Label>Ghi chú *</Label><Textarea className="mt-1.5" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder={selected?.scope === "COMMON" ? "Mục đích cấp vật tư" : "Nội dung sử dụng"}/></div>
          {quantity > (selected?.quantity ?? 0) && <p className="text-sm font-semibold text-red-600">Số lượng vượt quá Hiện có.</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>Hủy</Button><Button disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin"/> : selected?.scope === "COMMON" ? <UserRound className="h-4 w-4"/> : <CalendarDays className="h-4 w-4"/>}{selected?.scope === "COMMON" ? "Xác nhận cấp" : "Xác nhận sử dụng"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(locationMaterial)} onOpenChange={(open) => { if (!open) setLocationMaterial(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Cập nhật vị trí vật tư</DialogTitle><DialogDescription>{locationMaterial?.name}</DialogDescription></DialogHeader>
        <div><Label>Vị trí hiện tại *</Label><Input className="mt-1.5" autoFocus value={locationInput} onChange={(event) => setLocationInput(event.target.value)} placeholder="Ví dụ: Kho PXVH1 – Kệ A2" maxLength={200}/></div>
        <DialogFooter><Button variant="outline" onClick={() => setLocationMaterial(null)}>Hủy</Button><Button disabled={!locationInput.trim() || locationMutation.isPending} onClick={() => locationMutation.mutate()}>{locationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin"/> : <MapPin className="h-4 w-4"/>}Lưu vị trí</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(codesMaterial)} onOpenChange={(open) => { if (!open) setCodesMaterial(null); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Mã ERP của vật tư</DialogTitle><DialogDescription>{codesMaterial?.name} · {codesMaterial?.machine}</DialogDescription></DialogHeader>
        <div className="grid gap-2">{codesMaterial?.erpCodes.map((code, index) => <div key={code} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{index + 1}</span><code className="text-sm font-semibold text-slate-800">{code}</code></div>)}</div>
        <DialogFooter><Button onClick={() => setCodesMaterial(null)}>Đóng</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
