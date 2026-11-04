"use client";

import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/modules/ctktkt/components/ui/popover";

export function PpaNotePreview({ date, noteS1, noteS2, unit }: { date:string; noteS1:string; noteS2:string; unit:"s1"|"s2" }) {
  const [open,setOpen]=useState(false);
  const [side,setSide]=useState<"left"|"top">("left");
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const cancelClose=()=>{ if(timer.current) clearTimeout(timer.current); timer.current=null; };
  const show=()=>{ cancelClose(); setSide(window.innerWidth<768?"top":"left"); setOpen(true); };
  const hideLater=()=>{ cancelClose(); timer.current=setTimeout(()=>setOpen(false),180); };
  useEffect(()=>()=>{if(timer.current) clearTimeout(timer.current);},[]);
  const note=unit==="s1"?noteS1:noteS2;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" onMouseEnter={show} onMouseLeave={hideLater} onFocus={show} onBlur={hideLater} onClick={event=>{event.preventDefault();show();}}
      aria-label={`Xem đầy đủ nhận xét S1 và S2 ngày ${date.split("-").reverse().join("/")}`}
      className="block w-full min-w-0 truncate rounded px-1 py-1 text-left text-inherit hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-blue-500">
      {note.trim()||"—"}
    </button></PopoverTrigger>
    <PopoverContent side={side} align="start" sideOffset={10} collisionPadding={12} onOpenAutoFocus={event=>event.preventDefault()}
      onCloseAutoFocus={event=>event.preventDefault()}
      onMouseEnter={cancelClose} onMouseLeave={hideLater} onFocusCapture={cancelClose} onBlurCapture={hideLater}
      className="w-[min(460px,calc(100vw-24px))] max-h-[min(480px,70vh)] overflow-auto border-slate-200 bg-white p-0 text-slate-800 shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div><p className="text-sm font-semibold">Nhận xét vận hành</p><p className="mt-1 text-xs text-slate-500">Ngày {date.split("-").reverse().join("/")}</p></div><button type="button" onClick={()=>{cancelClose();setOpen(false);}} className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-200" aria-label="Đóng bảng nhận xét">×</button></div>
      <table className="w-full table-fixed border-collapse text-sm"><colgroup><col className="w-16"/><col/></colgroup><thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="px-4 py-2">Tổ máy</th><th className="px-4 py-2">Nhận xét đầy đủ</th></tr></thead><tbody>{(["s1","s2"] as const).map(key=><tr key={key} className={`border-b border-slate-100 ${key===unit?"bg-blue-50/40":""}`}><th scope="row" className="px-4 py-3 align-top text-left font-semibold">{key.toUpperCase()}</th><td className="whitespace-pre-wrap break-words px-4 py-3 leading-6 [overflow-wrap:anywhere]">{(key==="s1"?noteS1:noteS2).trim()||"Chưa có nhận xét"}</td></tr>)}</tbody></table>
    </PopoverContent>
  </Popover>;
}
