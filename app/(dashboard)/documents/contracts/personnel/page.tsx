"use client";
import { useTcmsTransport } from "@/hooks/use-tcms";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import type {
  CreatePersonnelInput,
  Personnel,
  PersonnelContractOption,
  PersonnelOption,
  PersonnelRoleAssignmentInput,
  PersonnelRoleOption,
  RoleScopeType,
  UpdatePersonnelInput,
} from "@/lib/tcms/types/personnel";

type PageData = {
  personnel: Personnel[];
  options: { websiteUsers: { id: string; name: string; email: string }[]; roles: PersonnelRoleOption[]; departments: PersonnelOption[]; contracts: PersonnelContractOption[] };
  capabilities: { canManage: boolean; currentUserId: string };
};

const inputClass = "mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-500";
const emptyAssignment = (): PersonnelRoleAssignmentInput => ({ roleCode: "VIEWER", scopeType: "DEPARTMENT", departmentId: null, contractId: null, validFrom: null, validUntil: null });
const emptyForm = (): CreatePersonnelInput => ({ identitySubject: "", username: "", displayName: "", primaryDepartmentId: null, active: true, roleAssignments: [emptyAssignment()] });

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Yêu cầu thất bại (${response.status}).`);
  return body as T;
}

function assignmentLabel(item: Personnel["roleAssignments"][number]) {
  const scope = item.scopeType === "GLOBAL" ? "Toàn hệ thống" : item.scopeType === "DEPARTMENT" ? item.departmentName : item.contractNumber;
  return `${item.roleName} · ${scope ?? "Chưa xác định"}`;
}

export default function PersonnelPage() {
  const request = useTcmsTransport();

  const [data, setData] = useState<PageData>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<Personnel>();
  const [form, setForm] = useState<CreatePersonnelInput>(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const result = await readJson<PageData>(await request("/api/tcms/personnel", { cache: "no-store" }));
    setData(result); setError(undefined); setLoading(false);
  }, [request]);

  useEffect(() => { let active = true; const timer = window.setTimeout(() => { void load().catch((reason) => { if (active) { setError(reason instanceof Error ? reason.message : "Không thể tải nhân sự."); setLoading(false); } }); }, 0); return () => { active = false; window.clearTimeout(timer); }; }, [load]);

  function openCreate() { setEditing(undefined); setForm(emptyForm()); setShowForm(true); setError(undefined); }
  function openEdit(item: Personnel) {
    setEditing(item);
    setForm({
      identitySubject: item.identitySubject, username: item.username, displayName: item.displayName,
      primaryDepartmentId: item.primaryDepartmentId, active: item.active,
      roleAssignments: item.roleAssignments.map((role) => ({ roleCode:role.roleCode, scopeType:role.scopeType, departmentId:role.departmentId, contractId:role.contractId, validFrom:role.validFrom, validUntil:role.validUntil })),
    });
    setShowForm(true); setError(undefined);
  }

  function updateAssignment(index: number, change: Partial<PersonnelRoleAssignmentInput>) {
    setForm((current) => ({ ...current, roleAssignments: current.roleAssignments.map((item, itemIndex) => itemIndex === index ? { ...item, ...change } : item) }));
  }

  function changeScope(index: number, scopeType: RoleScopeType) {
    updateAssignment(index, { scopeType, departmentId: null, contractId: null });
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(undefined);
    try {
      if (editing) {
        const personnel: UpdatePersonnelInput = { username:form.username, displayName:form.displayName, primaryDepartmentId:form.primaryDepartmentId, active:form.active, roleAssignments:form.roleAssignments };
        await readJson(await request(`/api/tcms/personnel/${encodeURIComponent(editing.id)}`, { method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify({ personnel, expectedVersion:editing.version }) }));
      } else {
        await readJson(await request("/api/tcms/personnel", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(form) }));
      }
      setShowForm(false); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể lưu người dùng."); }
    finally { setSaving(false); }
  }

  const personnel = data?.personnel ?? [];
  const options = data?.options;
  return <div className="min-h-full bg-slate-100"><div className="flex"><main className="min-w-0 flex-1 p-4"><div className="mx-auto max-w-7xl">
    <div className="flex items-start justify-between gap-3"><div><h1 className="text-xl font-bold text-slate-900">Nhân sự và phân quyền</h1><p className="mt-1 text-xs text-slate-500">Chọn tài khoản trên website và phân quyền theo đơn vị hoặc hợp đồng.</p></div>{data?.capabilities.canManage&&<button onClick={openCreate} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white">+ Thêm người dùng</button>}</div>
    {error&&<p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    <div className="mt-4 grid grid-cols-3 gap-3"><div className="rounded-xl border bg-white p-4"><p className="text-[10px] text-slate-500">Tổng người dùng</p><p className="text-2xl font-bold">{personnel.length}</p></div><div className="rounded-xl border bg-white p-4"><p className="text-[10px] text-slate-500">Đang hoạt động</p><p className="text-2xl font-bold text-emerald-700">{personnel.filter((item)=>item.active).length}</p></div><div className="rounded-xl border bg-white p-4"><p className="text-[10px] text-slate-500">Ngừng hoạt động</p><p className="text-2xl font-bold text-slate-500">{personnel.filter((item)=>!item.active).length}</p></div></div>
    {showForm&&options&&<form onSubmit={save} className="mt-4 rounded-xl border border-blue-100 bg-white p-4"><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <label className="text-[11px] font-semibold">Tài khoản website *<select required disabled={Boolean(editing)} className={`${inputClass} disabled:bg-slate-100`} value={form.identitySubject} onChange={(event)=>{const account=options.websiteUsers.find((u)=>`vh1:${u.id}`===event.target.value);setForm((value)=>({...value,identitySubject:event.target.value,username:account?.email??"",displayName:account?.name??""}));}}><option value="">Chọn tài khoản</option>{options.websiteUsers.filter((u)=>Boolean(editing)||!personnel.some((p)=>p.identitySubject===`vh1:${u.id}`)).map((u)=><option key={u.id} value={`vh1:${u.id}`}>{u.name} — {u.email}</option>)}</select></label>
      <label className="text-[11px] font-semibold">Tên đăng nhập / email *<input required maxLength={200} className={inputClass} readOnly value={form.username} onChange={(event)=>setForm((value)=>({...value,username:event.target.value}))}/></label>
      <label className="text-[11px] font-semibold">Họ và tên *<input required maxLength={200} className={inputClass} readOnly value={form.displayName} onChange={(event)=>setForm((value)=>({...value,displayName:event.target.value}))}/></label>
      <label className="text-[11px] font-semibold">Đơn vị chính<select className={inputClass} value={form.primaryDepartmentId??""} onChange={(event)=>setForm((value)=>({...value,primaryDepartmentId:event.target.value||null}))}><option value="">Chưa chọn</option>{options.departments.map((item)=><option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></label>
    </div><div className="mt-4 border-t pt-4"><div className="flex items-center justify-between"><h2 className="text-xs font-bold">Vai trò và phạm vi</h2><button type="button" onClick={()=>setForm((value)=>({...value,roleAssignments:[...value.roleAssignments,emptyAssignment()]}))} className="text-xs font-semibold text-blue-700">+ Thêm vai trò</button></div>
      <p className="mt-1 text-[10px] text-slate-500">Vai trò quản trị/kiểm toán phải áp dụng toàn hệ thống. Các vai trò giới hạn chỉ nên dùng cùng một loại vai trò trên nhiều phạm vi.</p>
      <div className="mt-2 space-y-2">{form.roleAssignments.map((assignment,index)=><div key={index} className="grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_150px_1.5fr_130px_auto]">
        <select className={inputClass} value={assignment.roleCode} onChange={(event)=>updateAssignment(index,{roleCode:event.target.value as PersonnelRoleAssignmentInput["roleCode"]})}>{options.roles.map((role)=><option key={role.code} value={role.code}>{role.name}</option>)}</select>
        <select className={inputClass} value={assignment.scopeType} onChange={(event)=>changeScope(index,event.target.value as RoleScopeType)}><option value="GLOBAL">Toàn hệ thống</option><option value="DEPARTMENT">Theo đơn vị</option><option value="CONTRACT">Theo hợp đồng</option></select>
        {assignment.scopeType==="GLOBAL"?<div className="mt-1 flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-500">Toàn bộ dữ liệu phù hợp với vai trò</div>:assignment.scopeType==="DEPARTMENT"?<select required className={inputClass} value={assignment.departmentId??""} onChange={(event)=>updateAssignment(index,{departmentId:event.target.value||null})}><option value="">Chọn đơn vị</option>{options.departments.map((item)=><option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select>:<select required className={inputClass} value={assignment.contractId??""} onChange={(event)=>updateAssignment(index,{contractId:event.target.value||null})}><option value="">Chọn hợp đồng</option>{options.contracts.map((item)=><option key={item.id} value={item.id}>{item.contractNumber} - {item.packageName}</option>)}</select>}
        <label className="text-[9px] text-slate-500">Hiệu lực đến<input type="date" className={inputClass} value={assignment.validUntil?.slice(0,10)??""} onChange={(event)=>updateAssignment(index,{validUntil:event.target.value?new Date(`${event.target.value}T23:59:59.999Z`).toISOString():null})}/></label>
        <button type="button" disabled={form.roleAssignments.length===1} onClick={()=>setForm((value)=>({...value,roleAssignments:value.roleAssignments.filter((_,itemIndex)=>itemIndex!==index)}))} className="mt-1 h-9 px-2 text-xs font-semibold text-red-600 disabled:text-slate-300">Xóa</button>
      </div>)}</div>
    </div><div className="mt-4 flex items-center justify-between border-t pt-4"><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={form.active} onChange={(event)=>setForm((value)=>({...value,active:event.target.checked}))}/> Đang hoạt động</label><div className="flex gap-2"><button type="button" onClick={()=>setShowForm(false)} className="h-9 rounded-lg border px-4 text-xs">Hủy</button><button disabled={saving} className="h-9 rounded-lg bg-blue-700 px-4 text-xs font-semibold text-white disabled:opacity-60">{saving?"Đang lưu...":"Lưu"}</button></div></div></form>}
    <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b px-4 py-3"><h2 className="text-sm font-bold">Danh sách nhân sự</h2><p className="mt-1 text-[10px] text-slate-500">Chỉ người có quyền quản trị phân hệ được thay đổi phân công. Quyền này chỉ áp dụng trong quản lý hợp đồng.</p></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-4 py-3">Người dùng</th><th className="px-4 py-3">Đơn vị</th><th className="px-4 py-3">Vai trò / phạm vi</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3 text-right">Thao tác</th></tr></thead><tbody className="divide-y">{personnel.map((item)=><tr key={item.id}><td className="px-4 py-3"><p className="font-bold text-slate-800">{item.displayName}</p><p className="mt-1 text-[10px] text-slate-500">{item.username}</p></td><td className="px-4 py-3">{item.primaryDepartmentName??"—"}</td><td className="max-w-md px-4 py-3"><div className="flex flex-wrap gap-1">{item.roleAssignments.map((role)=><span key={role.id} className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">{assignmentLabel(role)}</span>)}</div></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${item.active?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600"}`}>{item.active?"Hoạt động":"Ngừng hoạt động"}</span></td><td className="px-4 py-3 text-right"><button disabled={item.id===data?.capabilities.currentUserId} title={item.id===data?.capabilities.currentUserId?"Không tự sửa tài khoản đang đăng nhập":"Sửa"} onClick={()=>openEdit(item)} className="font-semibold text-blue-700 disabled:text-slate-300">Sửa</button></td></tr>)}{!loading&&personnel.length===0&&<tr><td colSpan={5} className="p-8 text-center text-slate-500">Chưa có người dùng.</td></tr>}</tbody></table>{loading&&<p className="p-8 text-center text-xs text-slate-500">Đang tải danh sách...</p>}</div></section>
  </div></main></div></div>;
}
