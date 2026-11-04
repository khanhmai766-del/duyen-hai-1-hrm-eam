"use client";

export function ReportTablePager({page,pages,start,end,total,onChange,disabled=false}:{page:number;pages:number;start:number;end:number;total:number;onChange:(page:number)=>void;disabled?:boolean}){
  if(pages<=1)return null;
  return <nav aria-label="Phân trang bảng số liệu" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
    <span>Hiển thị {start}–{end} / {total} ngày · Trang {page+1}/{pages}</span>
    <div className="flex gap-2"><button type="button" disabled={disabled||page===0} onClick={()=>onChange(page-1)} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40">Trang trước</button><button type="button" disabled={disabled||page+1>=pages} onClick={()=>onChange(page+1)} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40">Trang sau</button></div>
  </nav>;
}
