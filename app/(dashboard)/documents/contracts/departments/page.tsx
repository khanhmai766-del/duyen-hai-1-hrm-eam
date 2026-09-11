"use client";
import { useTcmsTransport } from "@/hooks/use-tcms";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { Department, DepartmentInput } from "@/lib/tcms/types/department";

const emptyForm: DepartmentInput = { code: "", name: "", active: true };
const inputClass = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-500";

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Yêu cầu thất bại (${response.status}).`);
  return body as T;
}

export default function DepartmentsPage() {
  const request = useTcmsTransport();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<Department>();
  const [form, setForm] = useState<DepartmentInput>(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const result = await readJson<{departments:Department[];capabilities:{canManage:boolean}}>(await request("/api/tcms/departments", { cache: "no-store" }));
    setDepartments(result.departments); setCanManage(result.capabilities.canManage); setError(undefined); setLoading(false);
  }, [request]);

  useEffect(() => {
    let active = true;
    void request("/api/tcms/departments", { cache: "no-store" }).then(readJson<{departments:Department[];capabilities:{canManage:boolean}}>).then((result) => {
      if (!active) return; setDepartments(result.departments); setCanManage(result.capabilities.canManage); setError(undefined);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Không thể tải danh mục đơn vị."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request]);

  function openCreate() { setEditing(undefined); setForm(emptyForm); setShowForm(true); }
  function openEdit(item: Department) { setEditing(item); setForm({ code:item.code, name:item.name, active:item.active }); setShowForm(true); }

  async function save(event: FormEvent) {
    event.preventDefault(); setError(undefined);
    try {
      if (editing) {
        await readJson(await request(`/api/tcms/departments/${encodeURIComponent(editing.id)}`, { method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify({ department:form, expectedVersion:editing.version }) }));
      } else {
        await readJson(await request("/api/tcms/departments", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(form) }));
      }
      setShowForm(false); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể lưu đơn vị."); }
  }

  async function toggleActive(item: Department) {
    try {
      await readJson(await request(`/api/tcms/departments/${encodeURIComponent(item.id)}`, { method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify({ department:{ code:item.code, name:item.name, active:!item.active }, expectedVersion:item.version }) }));
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể đổi trạng thái đơn vị."); }
  }

  return <div className="min-h-full bg-slate-100"><div className="flex"><main className="min-w-0 flex-1 p-4"><div className="mx-auto max-w-6xl">
    <div className="flex items-start justify-between gap-3"><div><h1 className="text-xl font-bold text-slate-900">Danh mục đơn vị</h1><p className="mt-1 text-xs text-slate-500">Quản lý đơn vị chủ trì, tham gia và phạm vi dữ liệu trong TCMS.</p></div>{canManage&&<button onClick={openCreate} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white">+ Thêm đơn vị</button>}</div>
    {error&&<p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    <div className="mt-4 grid grid-cols-3 gap-3"><div className="rounded-xl border bg-white p-4"><p className="text-[10px] text-slate-500">Tổng đơn vị</p><p className="text-2xl font-bold">{departments.length}</p></div><div className="rounded-xl border bg-white p-4"><p className="text-[10px] text-slate-500">Đang hoạt động</p><p className="text-2xl font-bold text-emerald-700">{departments.filter(item=>item.active).length}</p></div><div className="rounded-xl border bg-white p-4"><p className="text-[10px] text-slate-500">Ngừng sử dụng</p><p className="text-2xl font-bold text-slate-500">{departments.filter(item=>!item.active).length}</p></div></div>
    {showForm&&<form onSubmit={save} className="mt-4 grid gap-3 rounded-xl border border-blue-100 bg-white p-4 md:grid-cols-[180px_1fr_auto]"><label className="text-[11px] font-semibold">Mã đơn vị *<input required maxLength={30} className={inputClass} value={form.code} onChange={e=>setForm(v=>({...v,code:e.target.value}))}/></label><label className="text-[11px] font-semibold">Tên đơn vị *<input required maxLength={200} className={inputClass} value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></label><div className="flex items-end gap-2"><button className="h-9 rounded-lg bg-blue-700 px-4 text-xs font-semibold text-white">Lưu</button><button type="button" onClick={()=>setShowForm(false)} className="h-9 rounded-lg border px-4 text-xs">Hủy</button></div></form>}
    <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b px-4 py-3"><h2 className="text-sm font-bold">Danh sách đơn vị</h2>{!canManage&&<p className="mt-1 text-[10px] text-slate-500">Tài khoản hiện tại chỉ được tra cứu. Quản trị hệ thống có MFA mới được thay đổi danh mục.</p>}</div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-4 py-3">Mã</th><th className="px-4 py-3">Tên đơn vị</th><th className="px-4 py-3">Trạng thái</th>{canManage&&<th className="px-4 py-3 text-right">Thao tác</th>}</tr></thead><tbody className="divide-y">{departments.map(item=><tr key={item.id}><td className="px-4 py-3 font-bold text-blue-700">{item.code}</td><td className="px-4 py-3">{item.name}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${item.active?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600"}`}>{item.active?"Hoạt động":"Ngừng sử dụng"}</span></td>{canManage&&<td className="px-4 py-3 text-right"><button onClick={()=>openEdit(item)} className="mr-3 font-semibold text-blue-700">Sửa</button><button onClick={()=>void toggleActive(item)} className="font-semibold text-slate-600">{item.active?"Ngừng dùng":"Kích hoạt"}</button></td>}</tr>)}{!loading&&departments.length===0&&<tr><td colSpan={4} className="p-8 text-center text-slate-500">Chưa có đơn vị.</td></tr>}</tbody></table>{loading&&<p className="p-8 text-center text-xs text-slate-500">Đang tải danh mục...</p>}</div></section>
  </div></main></div></div>;
}
