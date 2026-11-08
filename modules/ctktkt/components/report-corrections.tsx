"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowRight,CheckCircle2,Clock3,FilePenLine,Inbox,Plus,RefreshCw,Send,Trash2,X,XCircle} from "lucide-react";
import {useCtktktRequest} from "@/hooks/useCtktkt";
import {Dialog,DialogClose,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/modules/ctktkt/components/ui/dialog";
import {canProposeCtktktCorrection} from "../lib/ctktkt-permissions";
import {useSessionUser} from "./session-context";
import {REPORT_WRITABLE_FIELDS,REPORT_WRITABLE_CELLS} from "../lib/report-writable-fields";

type Status="pending"|"approved"|"rejected";
type Row={id:string;operatingDate:string;requesterName:string;reason:string;status:Status;createdAt?:string;reviewerName:string|null;reviewNote:string;entries:Array<{cell:string;oldValue:string|null;value:string}>};
type Draft={cell:string;value:string};

const fields=REPORT_WRITABLE_FIELDS;
const fieldLabel=new Map<string,string>(fields.map(f=>[f.cell,f.label]));
const STATUS:Record<Status,{label:string;tone:string}>={
 pending:{label:"Chờ duyệt",tone:"border-amber-200 bg-amber-50 text-amber-800"},
 approved:{label:"Đã duyệt",tone:"border-emerald-200 bg-emerald-50 text-emerald-800"},
 rejected:{label:"Từ chối",tone:"border-rose-200 bg-rose-50 text-rose-700"},
};
const dmy=(iso:string)=>iso.slice(0,10).split("-").reverse().join("/");
const stamp=(iso?:string)=>iso?new Date(iso).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit"}):"";
const shown=(value:string|null)=>value===null||value===""?<span className="italic text-slate-400">trống</span>:<span className="font-semibold tabular-nums text-slate-900">{value}</span>;

/**
 * Yêu cầu chỉnh sửa số liệu Báo cáo Chỉ tiêu KTKT (quy tắc sửa theo ca, quản trị duyệt).
 * Trên trang chỉ là MỘT nút trên hàng "Ngày báo cáo" (kèm số yêu cầu chờ duyệt); bấm mở hộp thoại.
 * Gọi API giữ nguyên như bản gốc: gửi qua /api/ctktkt/ctktkt-report kèm correctionReason; duyệt/từ chối PATCH /api/ctktkt/correction-requests.
 */
export function ReportCorrections({date,onUpdated,getStaged}:{date:string;onUpdated:()=>void;getStaged?:()=>Draft[]}){
 const request=useCtktktRequest(),user=useSessionUser();const admin=user.role==="admin";
 const [open,setOpen]=useState(false);
 const [rows,setRows]=useState<Row[]>([]),[loaded,setLoaded]=useState(false);
 const [error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const [reason,setReason]=useState(""),[cell,setCell]=useState(""),[value,setValue]=useState(""),[draft,setDraft]=useState<Draft[]>([]);
 const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
 const [filter,setFilter]=useState<"pending"|"all">("pending");
 const [stagedCount,setStagedCount]=useState(0);

 const load=useCallback(async()=>{
  try{const r=await request("/api/ctktkt/correction-requests",{cache:"no-store"});const b=await r.json();if(!r.ok)throw Error(b.error);setRows(b.entries||[]);setError("");}
  catch(e){setError(e instanceof Error?e.message:"Chưa tải được yêu cầu.");}
  finally{setLoaded(true);}
 },[request]);
 // Tải ngay để nút hiện số yêu cầu chờ duyệt.
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);

 useEffect(()=>{const show=()=>{setOpen(true);setMessage("");setStagedCount(getStaged?.().length||0);void load();};window.addEventListener("ktkt-open-correction",show);return()=>window.removeEventListener("ktkt-open-correction",show);},[getStaged,load]);
 const pending=rows.filter(r=>r.status==="pending").length;
 const visible=filter==="pending"?rows.filter(r=>r.status==="pending"):rows;
 const editable=useMemo(()=>fields.filter(f=>canProposeCtktktCorrection(user,f.cell)),[user]);

 function openDialog(){setOpen(true);setMessage("");setStagedCount(getStaged?.().length||0);void load();}
 function addDraft(){if(!cell)return;setDraft(old=>[...old.filter(e=>e.cell!==cell),{cell,value:value.trim()}]);setCell("");setValue("");}

 async function send(){
  setBusy(true);setError("");setMessage("");
  try{
   const r=await request("/api/ctktkt/ctktkt-report",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operatingDate:date,entries:draft,correctionReason:reason})});
   const b=await r.json();if(!r.ok)throw Error(b.error);if(!b.requested)throw Error("Không có số liệu thay đổi để gửi.");
   setMessage("Đã gửi yêu cầu. Số liệu chưa thay đổi; chờ quản trị duyệt.");setDraft([]);setReason("");setFilter("pending");await load();
  }catch(e){setError(e instanceof Error?e.message:"Chưa gửi được yêu cầu.");}
  finally{setBusy(false);}
 }
 async function review(id:string,action:"approve"|"reject"){
  if(action==="approve"&&(getStaged?.().length||0)>0){setError("Hãy lưu hoặc bỏ các ô đang sửa trên báo cáo trước khi duyệt yêu cầu.");return;}
  setBusy(true);setError("");setMessage("");
  try{
   const r=await request("/api/ctktkt/correction-requests",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,action,note:reviewNotes[id]||""})});
   const b=await r.json();if(!r.ok)throw Error(b.error);
   setMessage(action==="approve"?"Đã duyệt và cập nhật số liệu.":"Đã từ chối; số liệu giữ nguyên.");await load();if(action==="approve")onUpdated();
  }catch(e){setError(e instanceof Error?e.message:"Chưa xử lý được yêu cầu.");}
  finally{setBusy(false);}
 }

 return <>
  <button type="button" onClick={openDialog} title={admin?"Duyệt yêu cầu chỉnh sửa số liệu sau ca":"Đề nghị sửa số liệu đã nhập ở ca trước"}
   className="relative flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 text-xs font-bold text-indigo-800 shadow-xs hover:bg-indigo-100">
   <FilePenLine className="size-3.5" aria-hidden/>Yêu cầu sửa
   {loaded&&pending>0&&<span aria-label={`${pending} yêu cầu chờ duyệt`} className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold leading-5 text-white">{pending}</span>}
  </button>

  <Dialog open={open} onOpenChange={setOpen}>
   <DialogContent showCloseButton={false} className="flex max-h-[88vh] w-[calc(100%-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
    <DialogHeader className="relative border-b border-slate-200 px-5 py-4 pr-14 text-left">
     <DialogClose aria-label="Đóng" className="absolute right-3 top-3 grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="size-5" aria-hidden/></DialogClose>
     <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900"><FilePenLine className="size-5 text-indigo-600" aria-hidden/>Yêu cầu chỉnh sửa số liệu</DialogTitle>
     <DialogDescription className="text-sm text-slate-500">{admin?"Quản trị xem và duyệt các đề nghị sửa số liệu sau ca.":`Đề nghị sửa số liệu ngày ${dmy(date)} đã nhập ở ca trước; số liệu chỉ đổi khi quản trị duyệt.`}</DialogDescription>
    </DialogHeader>

    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
     {/* Quy tắc ca */}
     <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
      <Clock3 className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden/>
      <div className="space-y-1.5">
       <p>Ca <strong>22h ngày D–06h ngày D+1</strong> được chốt toàn bộ số liệu ngày D trong nhóm được phân quyền, kể cả ca trước/người khác nhập.</p>
       <div className="flex flex-wrap gap-1.5">{["06h – 14h","14h – 22h","22h – 06h hôm sau"].map(s=><span key={s} className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">{s}</span>)}</div>
       <p>Ngoài thời gian chốt ngày, chỉ tự sửa số liệu của mình trong cùng ca; trường hợp khác gửi quản trị duyệt. Ô liên kết BCSX (ví dụ O4) phải sửa tại báo cáo sản xuất nguồn.</p>
      </div>
     </div>

     {error&&<p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
     {message&&<p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><CheckCircle2 className="size-4 shrink-0" aria-hidden/>{message}</p>}

     {/* Đề nghị sửa (người dùng thường; quản trị sửa trực tiếp trên báo cáo) */}
     {!admin&&<section className="space-y-3 rounded-xl border border-indigo-100 p-4" aria-label="Đề nghị sửa">
      <div className="flex flex-wrap items-center justify-between gap-2">
       <h3 className="text-sm font-bold text-slate-900">Đề nghị sửa ngày {dmy(date)}</h3>
       {getStaged&&<button type="button" disabled={busy||!stagedCount} onClick={()=>{const staged=getStaged?.()||[];const allowed=staged.filter(e=>REPORT_WRITABLE_CELLS.has(e.cell)&&canProposeCtktktCorrection(user,e.cell));setDraft(allowed);const skipped=staged.filter(e=>!allowed.includes(e));setError(skipped.length?`Không đưa các ô liên kết/không có quyền vào yêu cầu: ${skipped.map(e=>e.cell).join(", ")}. Ô BCSX phải sửa tại nguồn.`:"");}}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        Lấy {stagedCount} ô đang sửa trên báo cáo</button>}
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end">
       <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600">Chỉ tiêu cần sửa
        <select className="h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900" value={cell} onChange={e=>setCell(e.target.value)}>
         <option value="">Chọn chỉ tiêu…</option>{editable.map(f=><option key={f.cell} value={f.cell}>{f.label} ({f.cell})</option>)}
        </select></label>
       <label className="grid gap-1 text-xs font-semibold text-slate-600">Giá trị mới
        <input className="h-9 rounded-lg border border-slate-200 px-2 text-sm tabular-nums text-slate-900" placeholder="Để trống = xóa" value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addDraft();}}}/></label>
       <button type="button" disabled={busy||!cell} onClick={addDraft} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Plus className="size-4" aria-hidden/>Thêm</button>
      </div>
      {draft.length>0&&<ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
       {draft.map(e=><li key={e.cell} className="flex items-center gap-3 px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate text-slate-700">{fieldLabel.get(e.cell)||e.cell} <span className="text-xs text-slate-400">({e.cell})</span></span>
        <span className="flex shrink-0 items-center gap-1.5"><ArrowRight className="size-3.5 text-slate-400" aria-hidden/>{shown(e.value)}</span>
        <button type="button" aria-label={`Bỏ ${e.cell}`} onClick={()=>setDraft(old=>old.filter(x=>x.cell!==e.cell))} className="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="size-4" aria-hidden/></button>
       </li>)}
      </ul>}
      <label className="grid gap-1 text-xs font-semibold text-slate-600">Lý do chỉnh sửa
       <textarea rows={2} maxLength={1000} className="rounded-lg border border-slate-200 p-2 text-sm text-slate-900" placeholder="Ví dụ: nhập nhầm chỉ số công tơ ca trước (tối thiểu 5 ký tự)" value={reason} onChange={e=>setReason(e.target.value)}/>
       <span className="text-right font-normal text-slate-400">{reason.length}/1000</span></label>
      <div className="flex justify-end">
       <button type="button" disabled={busy||!draft.length||reason.trim().length<5} onClick={()=>void send()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"><Send className="size-4" aria-hidden/>Gửi quản trị duyệt</button>
      </div>
     </section>}

     {/* Danh sách yêu cầu */}
     <section className="space-y-3" aria-label="Danh sách yêu cầu">
      <div className="flex flex-wrap items-center justify-between gap-2">
       <h3 className="text-sm font-bold text-slate-900">{admin?"Yêu cầu của các cương vị":"Yêu cầu của tôi"}</h3>
       <div className="flex items-center gap-2">
        <div role="group" aria-label="Lọc yêu cầu" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
         {([["pending",`Chờ duyệt (${pending})`],["all",`Tất cả (${rows.length})`]] as const).map(([key,label])=><button key={key} type="button" aria-pressed={filter===key} onClick={()=>setFilter(key)} className={`h-8 rounded-md px-2.5 font-semibold ${filter===key?"bg-white text-slate-900 shadow-sm":"text-slate-500"}`}>{label}</button>)}
        </div>
        <button type="button" aria-label="Tải lại danh sách" title="Tải lại danh sách" disabled={busy} onClick={()=>void load()} className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCw className="size-4" aria-hidden/></button>
       </div>
      </div>

      {!loaded?<p className="py-6 text-center text-sm text-slate-400">Đang tải yêu cầu…</p>
      :!visible.length?<div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-8 text-sm text-slate-400"><Inbox className="size-6" aria-hidden/>{filter==="pending"?"Không có yêu cầu chờ duyệt.":"Chưa có yêu cầu nào."}</div>
      :visible.map(r=><article key={r.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
       <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${STATUS[r.status]?.tone||""}`}>{STATUS[r.status]?.label||r.status}</span>
        <span className="text-sm font-semibold text-slate-900">Ngày {dmy(r.operatingDate)}</span>
        <span className="text-sm text-slate-500">· {r.requesterName}</span>
        {r.createdAt&&<span className="ml-auto text-xs text-slate-400">Gửi {stamp(r.createdAt)}</span>}
       </header>
       <p className="text-sm text-slate-600"><span className="font-semibold text-slate-700">Lý do:</span> {r.reason}</p>
       <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-1.5 pr-2 font-semibold">Chỉ tiêu</th><th className="py-1.5 pr-2 text-right font-semibold">Hiện tại</th><th className="w-6"/><th className="py-1.5 text-right font-semibold">Đề nghị</th></tr></thead>
        <tbody>{r.entries.map(e=><tr key={e.cell} className="border-b border-slate-100 last:border-0">
         <td className="py-1.5 pr-2 text-slate-700">{fieldLabel.get(e.cell)||e.cell} <span className="text-xs text-slate-400">({e.cell})</span></td>
         <td className="py-1.5 pr-2 text-right">{shown(e.oldValue)}</td>
         <td className="text-center"><ArrowRight className="inline size-3.5 text-slate-400" aria-hidden/></td>
         <td className="py-1.5 text-right">{shown(e.value)}</td>
        </tr>)}</tbody>
       </table>
       {r.reviewerName&&<p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><span className="font-semibold">{r.status==="approved"?"Duyệt bởi":"Xử lý bởi"} {r.reviewerName}</span>{r.reviewNote?` · ${r.reviewNote}`:""}</p>}
       {admin&&r.status==="pending"&&<div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <input aria-label={`Ý kiến duyệt yêu cầu của ${r.requesterName}`} maxLength={1000} placeholder="Ý kiến quản trị (không bắt buộc)" value={reviewNotes[r.id]||""} onChange={e=>setReviewNotes(old=>({...old,[r.id]:e.target.value}))} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-sm"/>
        <button type="button" disabled={busy} onClick={()=>void review(r.id,"reject")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><XCircle className="size-4" aria-hidden/>Từ chối</button>
        <button type="button" disabled={busy} onClick={()=>void review(r.id,"approve")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><CheckCircle2 className="size-4" aria-hidden/>Duyệt và cập nhật</button>
       </div>}
      </article>)}
      <p className="text-xs text-slate-400">Hiển thị tối đa 100 yêu cầu mới nhất, ưu tiên yêu cầu chờ duyệt.</p>
     </section>
    </div>
   </DialogContent>
  </Dialog>
 </>;
}
