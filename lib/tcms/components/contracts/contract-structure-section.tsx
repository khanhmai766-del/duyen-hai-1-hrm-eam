"use client";
import { useTcmsTransport } from "@/hooks/use-tcms";

import { useCallback, useEffect, useState } from "react";
import type {
  ContractTimeRule, ContractTimeRuleInput, DurationUnit, TimeRuleScopeType,
  WorkScope, WorkScopeInput, WorkScopeNode, WorkScopeType,
} from "@/lib/tcms/types/contract-structure";

const timeScopeLabels: Record<TimeRuleScopeType, string> = {
  CONTRACT:"Hợp đồng",WORK_SCOPE:"Phạm vi công việc",SERVICE:"Dịch vụ",GOODS:"Hàng hóa",ITEM:"Hạng mục",UNIT:"Đơn vị",OTHER:"Khác",
};
const workScopeLabels: Record<WorkScopeType, string> = {
  LOT:"Lô",PACKAGE:"Gói",SYSTEM:"Hệ thống",SUBSYSTEM:"Phân hệ",EQUIPMENT:"Thiết bị",LOCATION:"Vị trí",WORK_GROUP:"Nhóm việc",OTHER:"Khác",
};
const unitLabels: Record<DurationUnit, string> = { DAY:"ngày",HOUR:"giờ",MONTH:"tháng",OTHER:"đơn vị khác" };
const emptyRule: ContractTimeRuleInput = { scopeType:"CONTRACT" };
const emptyScope: WorkScopeInput = { scopeType:"LOT", name:"" };
const control = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] outline-none focus:border-blue-500";

async function json<T>(response: Response): Promise<T> {
  const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { message?: string }).message ?? `Yêu cầu thất bại (${response.status}).`);
  return body as T;
}

async function fetchContractStructure(contractId: string, request: ReturnType<typeof useTcmsTransport>) {
  const [ruleData, scopeData] = await Promise.all([
    json<{rules:ContractTimeRule[];capabilities:{canUpdate:boolean}}>(await request(`/api/tcms/contracts/${encodeURIComponent(contractId)}/time-rules`,{cache:"no-store"})),
    json<{scopes:WorkScope[];tree:WorkScopeNode[];capabilities:{canUpdate:boolean}}>(await request(`/api/tcms/contracts/${encodeURIComponent(contractId)}/scopes`,{cache:"no-store"})),
  ]);
  return { ruleData, scopeData };
}

function ScopeTree({ nodes, onEdit, onDelete, editable }: {
  nodes: WorkScopeNode[]; onEdit: (scope: WorkScope) => void; onDelete: (scope: WorkScope) => void; editable: boolean;
}) {
  return <ul className="space-y-1">
    {nodes.map((node) => <li key={node.id}>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px]">
        <span className="rounded bg-slate-200 px-1.5 py-0.5 font-bold text-slate-600">{workScopeLabels[node.scopeType]}</span>
        <span className="font-semibold text-slate-800">{node.code ? `${node.code} - ` : ""}{node.name}</span>
        {editable && <span className="ml-auto flex gap-2"><button onClick={() => onEdit(node)} className="font-semibold text-blue-700">Sửa</button><button onClick={() => onDelete(node)} className="font-semibold text-red-600">Xóa</button></span>}
      </div>
      {node.children.length > 0 && <div className="ml-5 mt-1 border-l border-slate-200 pl-3"><ScopeTree nodes={node.children} onEdit={onEdit} onDelete={onDelete} editable={editable} /></div>}
    </li>)}
  </ul>;
}

export function ContractStructureSection({ contractId }: { contractId: string }) {
  const request = useTcmsTransport();

  const [rules,setRules]=useState<ContractTimeRule[]>([]); const [scopes,setScopes]=useState<WorkScope[]>([]); const [tree,setTree]=useState<WorkScopeNode[]>([]);
  const [canUpdate,setCanUpdate]=useState(false); const [error,setError]=useState<string>(); const [loading,setLoading]=useState(true);
  const [ruleForm,setRuleForm]=useState<ContractTimeRuleInput>(emptyRule); const [editingRule,setEditingRule]=useState<ContractTimeRule>(); const [showRuleForm,setShowRuleForm]=useState(false);
  const [scopeForm,setScopeForm]=useState<WorkScopeInput>(emptyScope); const [editingScope,setEditingScope]=useState<WorkScope>(); const [showScopeForm,setShowScopeForm]=useState(false);

  const load=useCallback(async()=>{
    try { const {ruleData,scopeData}=await fetchContractStructure(contractId, request); setError(undefined); setRules(ruleData.rules); setScopes(scopeData.scopes); setTree(scopeData.tree); setCanUpdate(ruleData.capabilities.canUpdate && scopeData.capabilities.canUpdate);
    } catch(e) { setError(e instanceof Error?e.message:"Không thể tải cấu trúc hợp đồng."); } finally { setLoading(false); }
  },[request, contractId]);
  useEffect(()=>{
    let active=true;
    void fetchContractStructure(contractId, request)
      .then(({ruleData,scopeData})=>{if(!active)return;setError(undefined);setRules(ruleData.rules);setScopes(scopeData.scopes);setTree(scopeData.tree);setCanUpdate(ruleData.capabilities.canUpdate&&scopeData.capabilities.canUpdate);})
      .catch((e)=>{if(active)setError(e instanceof Error?e.message:"Không thể tải cấu trúc hợp đồng.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[request, contractId]);

  async function saveRule(event:React.FormEvent){event.preventDefault();try{setError(undefined);const url=editingRule?`/api/tcms/contracts/${contractId}/time-rules/${editingRule.id}`:`/api/tcms/contracts/${contractId}/time-rules`;await json(await request(url,{method:editingRule?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(editingRule?{rule:ruleForm,expectedVersion:editingRule.version}:ruleForm)}));setShowRuleForm(false);setEditingRule(undefined);setRuleForm(emptyRule);await load();}catch(e){setError(e instanceof Error?e.message:"Không thể lưu quy tắc.");}}
  async function saveScope(event:React.FormEvent){event.preventDefault();try{setError(undefined);const url=editingScope?`/api/tcms/contracts/${contractId}/scopes/${editingScope.id}`:`/api/tcms/contracts/${contractId}/scopes`;await json(await request(url,{method:editingScope?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(editingScope?{scope:scopeForm,expectedVersion:editingScope.version}:scopeForm)}));setShowScopeForm(false);setEditingScope(undefined);setScopeForm(emptyScope);await load();}catch(e){setError(e instanceof Error?e.message:"Không thể lưu phạm vi.");}}
  async function remove(kind:"time-rules"|"scopes",value:ContractTimeRule|WorkScope){if(!window.confirm("Xóa nội dung này? Các liên kết con cũng có thể bị ảnh hưởng."))return;try{await json(await request(`/api/tcms/contracts/${contractId}/${kind}/${value.id}`,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({expectedVersion:value.version})}));await load();}catch(e){setError(e instanceof Error?e.message:"Không thể xóa.");}}

  return <div className="grid gap-3 xl:grid-cols-2">
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h2 className="text-sm font-bold text-slate-900">Quy tắc thời gian</h2><p className="text-[10px] text-slate-500">Thời lượng theo từng phạm vi, không ép theo một cấu trúc cố định.</p></div>{canUpdate&&<button onClick={()=>{setEditingRule(undefined);setRuleForm(emptyRule);setShowRuleForm(true);}} className="h-8 rounded-lg bg-blue-700 px-3 text-[10px] font-semibold text-white">+ Thêm</button>}</div>
      <div className="p-4">{error&&<p className="mb-2 rounded bg-red-50 p-2 text-[10px] text-red-700">{error}</p>}{loading?<p className="text-[10px] text-slate-500">Đang tải...</p>:rules.length===0?<p className="text-[10px] text-slate-500">Chưa có quy tắc thời gian. Các trường thời gian P0 vẫn được giữ nguyên.</p>:<div className="overflow-x-auto"><table className="w-full text-left text-[10px]"><thead><tr className="border-b text-slate-500"><th className="p-2">Phạm vi</th><th className="p-2">Thời lượng</th><th className="p-2">Liên tục</th><th className="p-2">Mốc bắt đầu</th><th className="p-2">Căn cứ</th>{canUpdate&&<th className="p-2">Thao tác</th>}</tr></thead><tbody>{rules.map(rule=><tr key={rule.id} className="border-b border-slate-100"><td className="p-2 font-semibold">{timeScopeLabels[rule.scopeType]}{rule.workScopeId?` - ${scopes.find(s=>s.id===rule.workScopeId)?.name??"Phạm vi"}`:""}</td><td className="p-2">{rule.durationValue===undefined?"-":`${rule.durationValue} ${rule.durationUnit?unitLabels[rule.durationUnit]:""}`}</td><td className="p-2">{rule.isContinuous===undefined?"-":rule.isContinuous?"Có":"Không"}</td><td className="p-2">{rule.startTriggerType??rule.startTriggerDescription??"-"}</td><td className="max-w-44 p-2">{rule.evidence??rule.rawClause??"-"}{rule.sourcePage?` (trang ${rule.sourcePage})`:""}</td>{canUpdate&&<td className="whitespace-nowrap p-2"><button onClick={()=>{setEditingRule(rule);const {id:_,contractId:__,sequence:___,version:____,...input}=rule;void _;void __;void ___;void ____;setRuleForm(input);setShowRuleForm(true);}} className="mr-2 font-semibold text-blue-700">Sửa</button><button onClick={()=>void remove("time-rules",rule)} className="font-semibold text-red-600">Xóa</button></td>}</tr>)}</tbody></table></div>}
      {showRuleForm&&<form onSubmit={saveRule} className="mt-3 grid gap-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3 sm:grid-cols-2"><select className={control} value={ruleForm.scopeType} onChange={e=>setRuleForm(v=>({...v,scopeType:e.target.value as TimeRuleScopeType,workScopeId:undefined}))}>{Object.entries(timeScopeLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>{ruleForm.scopeType==="WORK_SCOPE"?<select required className={control} value={ruleForm.workScopeId??""} onChange={e=>setRuleForm(v=>({...v,workScopeId:e.target.value||undefined}))}><option value="">Chọn WorkScope</option>{scopes.map(s=><option key={s.id} value={s.id}>{s.code?`${s.code} - `:""}{s.name}</option>)}</select>:<div/>}<input type="number" min="0" step="any" className={control} placeholder="Thời lượng (có thể để trống)" value={ruleForm.durationValue??""} onChange={e=>setRuleForm(v=>({...v,durationValue:e.target.value?Number(e.target.value):undefined,durationUnit:e.target.value?(v.durationUnit??"DAY"):undefined}))}/><select className={control} value={ruleForm.durationUnit??""} onChange={e=>setRuleForm(v=>({...v,durationUnit:e.target.value?e.target.value as DurationUnit:undefined,durationValue:e.target.value?v.durationValue:undefined}))}><option value="">Không có đơn vị</option>{Object.entries(unitLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><input className={control} placeholder="Loại mốc, ví dụ SITE_HANDOVER" value={ruleForm.startTriggerType??""} onChange={e=>setRuleForm(v=>({...v,startTriggerType:e.target.value||undefined}))}/><input className={control} placeholder="Mô tả mốc bắt đầu" value={ruleForm.startTriggerDescription??""} onChange={e=>setRuleForm(v=>({...v,startTriggerDescription:e.target.value||undefined}))}/><label className="flex items-center gap-2 text-[10px]"><input type="checkbox" checked={ruleForm.isContinuous===true} onChange={e=>setRuleForm(v=>({...v,isContinuous:e.target.checked}))}/> Thực hiện liên tục</label><input type="number" min="1" className={control} placeholder="Trang nguồn" value={ruleForm.sourcePage??""} onChange={e=>setRuleForm(v=>({...v,sourcePage:e.target.value?Number(e.target.value):undefined}))}/><textarea className="rounded-lg border border-slate-200 p-2 text-[11px] sm:col-span-2" placeholder="Evidence / nguyên văn điều khoản" value={ruleForm.evidence??""} onChange={e=>setRuleForm(v=>({...v,evidence:e.target.value||undefined,rawClause:e.target.value||undefined}))}/><div className="flex gap-2 sm:col-span-2"><button className="h-8 rounded bg-blue-700 px-3 text-[10px] font-semibold text-white">Lưu</button><button type="button" onClick={()=>setShowRuleForm(false)} className="h-8 rounded border px-3 text-[10px]">Hủy</button></div></form>}
      </div>
    </section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h2 className="text-sm font-bold text-slate-900">Phạm vi công việc</h2><p className="text-[10px] text-slate-500">Cây lô, hệ thống, thiết bị, vị trí hoặc nhóm việc.</p></div>{canUpdate&&<button onClick={()=>{setEditingScope(undefined);setScopeForm(emptyScope);setShowScopeForm(true);}} className="h-8 rounded-lg bg-blue-700 px-3 text-[10px] font-semibold text-white">+ Thêm</button>}</div>
      <div className="p-4">{tree.length?<ScopeTree nodes={tree} editable={canUpdate} onEdit={scope=>{setEditingScope(scope);const{id:_,contractId:__,sequence:___,version:____,...input}=scope;void _;void __;void ___;void ____;setScopeForm(input);setShowScopeForm(true);}} onDelete={scope=>void remove("scopes",scope)}/>:<p className="text-[10px] text-slate-500">Chưa khai báo phạm vi công việc.</p>}
      {showScopeForm&&<form onSubmit={saveScope} className="mt-3 grid gap-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3 sm:grid-cols-2"><select className={control} value={scopeForm.scopeType} onChange={e=>setScopeForm(v=>({...v,scopeType:e.target.value as WorkScopeType}))}>{Object.entries(workScopeLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><select className={control} value={scopeForm.parentScopeId??""} onChange={e=>setScopeForm(v=>({...v,parentScopeId:e.target.value||undefined}))}><option value="">Phạm vi gốc</option>{scopes.filter(s=>s.id!==editingScope?.id).map(s=><option key={s.id} value={s.id}>{s.code?`${s.code} - `:""}{s.name}</option>)}</select><input className={control} placeholder="Mã" value={scopeForm.code??""} onChange={e=>setScopeForm(v=>({...v,code:e.target.value||undefined}))}/><input required className={control} placeholder="Tên phạm vi" value={scopeForm.name} onChange={e=>setScopeForm(v=>({...v,name:e.target.value}))}/><textarea className="rounded-lg border border-slate-200 p-2 text-[11px] sm:col-span-2" placeholder="Mô tả" value={scopeForm.description??""} onChange={e=>setScopeForm(v=>({...v,description:e.target.value||undefined}))}/><div className="flex gap-2 sm:col-span-2"><button className="h-8 rounded bg-blue-700 px-3 text-[10px] font-semibold text-white">Lưu</button><button type="button" onClick={()=>setShowScopeForm(false)} className="h-8 rounded border px-3 text-[10px]">Hủy</button></div></form>}
      </div>
    </section>
  </div>;
}
