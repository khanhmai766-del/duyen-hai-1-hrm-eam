"use client";
import { useCtktktRequest } from "@/hooks/useCtktkt";
import {useEffect,useState} from "react";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/modules/ctktkt/components/ui/dialog";
import {coalPhotoComparison,filterCoalReviewPhotos,type CoalReviewFilter} from "@/modules/ctktkt/lib/coal-photo-review";
import {DateField} from "@/modules/ctktkt/components/ui/date-field";
import {reportReadRange} from "@/modules/ctktkt/lib/report-read-range";
import {vietnamDateIso} from "@/modules/ctktkt/lib/operating-date";
import {ALL_COAL_METER_KEYS,COAL_SLOTS,coalMeterLabel,compareCoalMeterOrder,parseMeterLabel,type CoalMeterKey,type CoalSlot} from "@/modules/ctktkt/lib/coal-meter-ocr";
type Photo={id:string;slot:CoalSlot;expiresAt:number;reading:{meter_label:string|null;total_display:string|null;confidence?:string;note?:string}};
const display=(n:number|null)=>n===null?"—":new Intl.NumberFormat("vi-VN",{maximumFractionDigits:3}).format(n);
const labels={unmapped:"Chưa rõ máy cấp",unreadable:"Chưa đọc được số",empty:"Ô bảng đang trống",match:"Khớp số AI",different:"Khác số — cần kiểm tra"};
export function CoalMeterPhotoReview({open,onOpenChange,date,unit,current}:{open:boolean;onOpenChange:(open:boolean)=>void;date:string;unit:"S1"|"S2";current:Record<string,string>}){
  const ctktktRequest = useCtktktRequest();

  const [photos,setPhotos]=useState<Photo[]>([]),[selected,setSelected]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(false),[reload,setReload]=useState(0);
  const [overrides,setOverrides]=useState<Record<string,{meter:CoalMeterKey|"";slot:CoalSlot}>>({});
  const [missingImage,setMissingImage]=useState("");
  const [filters,setFilters]=useState<CoalReviewFilter>({unit,date,slot:"all",meter:"all"});
  const [applied,setApplied]=useState<CoalReviewFilter|null>(null);
  const [stored,setStored]=useState<Record<string,string>>({});
  const [loadedKey,setLoadedKey]=useState("");
  const appliedKey=applied?JSON.stringify(applied):"";
  useEffect(()=>{
    if(!open||!applied)return;
    const controller=new AbortController();
    const filter=applied;
    async function load(){setLoading(true);setError("");try{
      const [response,valuesResponse]=await Promise.all([
        ctktktRequest(`/api/ctktkt/coal-meter-photos?scope=review&date=${encodeURIComponent(filter.date)}`,{signal:controller.signal,cache:"no-store"}),
        filter.date===date?Promise.resolve(null):ctktktRequest(`/api/ctktkt/ctktkt-report?period=${filter.date.slice(0,7)}&date=${filter.date}&scope=stored`,{signal:controller.signal,cache:"no-store"}),
      ]);
      const body=await response.json() as {photos?:Photo[];error?:string};
      if(!response.ok)throw new Error(body.error||"Chưa tải được ảnh.");
      let values:Record<string,string>={};
      if(valuesResponse){
        const result=await valuesResponse.json() as {entries?:Array<{operatingDate:string;cell:string;value:string}>;error?:string};
        if(!valuesResponse.ok||!Array.isArray(result.entries))throw new Error(result.error||"Chưa đọc được số liệu đúng ngày để đối chiếu.");
        values=Object.fromEntries(result.entries.filter(entry=>entry.operatingDate===filter.date).map(entry=>[entry.cell,entry.value]));
      }
      if(!controller.signal.aborted){setPhotos(body.photos||[]);setStored(values);setLoadedKey(appliedKey);}
    }catch(error){if(!controller.signal.aborted){setPhotos([]);setLoadedKey("");setError(error instanceof Error?error.message:"Chưa tải được ảnh.");}}finally{if(!controller.signal.aborted)setLoading(false);}}
    void load();return ()=>controller.abort();
  },[open,date,reload,applied,appliedKey, ctktktRequest]);
  const visible=(applied&&loadedKey===appliedKey?filterCoalReviewPhotos(photos,applied):[])
    .sort((a,b)=>compareCoalMeterOrder(
      {key:overrides[a.id]?.meter||parseMeterLabel(a.reading.meter_label||""),slot:overrides[a.id]?.slot||a.slot},
      {key:overrides[b.id]?.meter||parseMeterLabel(b.reading.meter_label||""),slot:overrides[b.id]?.slot||b.slot},
    ));
  const photo=visible.find(p=>p.id===selected)||visible[0];
  const selection=photo?overrides[photo.id]||{meter:parseMeterLabel(photo.reading.meter_label||"")||"",slot:photo.slot}:null;
  const comparison=photo&&selection&&applied?coalPhotoComparison(photo.reading,selection.slot,applied.date===date?current:stored,selection.meter||null):null;
  const reviewUnit=applied?.unit||filters.unit;
  function applyFilters(){
    if(!reportReadRange(filters.date.slice(0,7),filters.date)||filters.date>vietnamDateIso()){setError("Ngày đối chiếu không hợp lệ hoặc ở tương lai.");return;}
    setPhotos([]);setStored({});setLoadedKey("");setSelected("");setOverrides({});setMissingImage("");setError("");setLoading(true);
    setApplied({...filters});
  }
  function change(patch:Partial<{meter:CoalMeterKey|"";slot:CoalSlot}>){if(photo&&selection){setSelected(photo.id);setOverrides(old=>({...old,[photo.id]:{...selection,...patch}}));}}
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] max-w-[calc(100%-1rem)] gap-3 overflow-y-auto p-4 sm:max-w-6xl">
    <DialogHeader><DialogTitle>Đối chiếu ảnh & số liệu công tơ than</DialogTitle><DialogDescription>Chọn tổ máy, ca, ngày và công tơ cần đối chiếu. Ảnh giữ trong 4 mốc ca; tối đa 200 ảnh gần nhất của ngày. Chỉ xem, không sửa dữ liệu.</DialogDescription></DialogHeader>
    <form onSubmit={event=>{event.preventDefault();applyFilters();}} className="grid gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 sm:grid-cols-2 lg:grid-cols-5">
      <label className="grid gap-1 text-xs font-semibold">Tổ máy<select value={filters.unit} onChange={event=>setFilters(old=>({...old,unit:event.target.value as "S1"|"S2",meter:"all"}))} className="h-10 rounded-lg border border-input bg-white px-2"><option value="S1">Tổ máy S1</option><option value="S2">Tổ máy S2</option></select></label>
      <label className="grid gap-1 text-xs font-semibold">Ca đối chiếu<select value={filters.slot} onChange={event=>setFilters(old=>({...old,slot:event.target.value as CoalReviewFilter["slot"]}))} className="h-10 rounded-lg border border-input bg-white px-2"><option value="all">Tất cả ca</option>{COAL_SLOTS.map((slot,index)=><option key={slot} value={slot}>{slot}h · Ca {index+1}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-semibold">Ngày đối chiếu<DateField value={filters.date} max={vietnamDateIso()} onChange={value=>setFilters(old=>({...old,date:value}))}/></label>
      <label className="grid gap-1 text-xs font-semibold">Công tơ cần đối chiếu<select value={filters.meter} onChange={event=>setFilters(old=>({...old,meter:event.target.value as CoalReviewFilter["meter"]}))} className="h-10 rounded-lg border border-input bg-white px-2"><option value="all">Tất cả công tơ</option>{ALL_COAL_METER_KEYS.filter(key=>key.startsWith(filters.unit+"-")).map(key=><option key={key} value={key}>{coalMeterLabel(key)} · {key.replace(/^S([12])-/,"$1")}</option>)}</select></label>
      <button type="submit" className="mt-auto h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">Xem đối chiếu</button>
    </form>
    {!applied&&<p className="text-sm text-muted-foreground">Mặc định tất cả công tơ và tất cả ca của tổ máy, ngày đang xem. Bấm “Xem đối chiếu” để tải ảnh.</p>}
    {applied&&<p className="text-xs text-muted-foreground">Đang xem {applied.unit} · {applied.date.split("-").reverse().join("/")} · {applied.slot==="all"?"Tất cả ca":applied.slot+"h"} · {applied.meter==="all"?"Tất cả công tơ":coalMeterLabel(applied.meter)}. {applied.date===date?"So với số hiện trên bảng, kể cả số chưa lưu.":"So với số đã lưu đúng ngày đã chọn."}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{visible.length} ảnh còn hạn · Nhãn và số AI có thể đọc sai, cần xem ảnh gốc</span><button type="button" disabled={!applied||loading} onClick={()=>setReload(n=>n+1)} className="rounded-lg border border-border px-3 py-2">{loading?"Đang tải…":"Tải lại ảnh"}</button></div>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {applied&&!loading&&!error&&!photo&&<p className="p-8 text-center text-sm text-muted-foreground">Không có ảnh còn hạn phù hợp với tổ máy, ca, ngày và công tơ đã chọn. Ảnh đã quá 4 mốc ca không còn để đối chiếu.</p>}
    {photo&&selection&&comparison&&<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-3">
        <div className="max-h-40 overflow-auto rounded-lg border border-border">{visible.map(p=><button key={p.id} type="button" onClick={()=>setSelected(p.id)} aria-pressed={p.id===photo.id} className="flex w-full items-center justify-between gap-2 border-b border-border bg-card px-3 py-2 text-left text-sm text-card-foreground aria-pressed:bg-accent"><span>{p.reading.meter_label||"Chưa rõ tên máy"} · {p.slot}h</span><span>{p.reading.total_display||"—"} t</span></button>)}</div>
        <div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-xs">Máy cấp đối chiếu<select value={selection.meter} onChange={event=>change({meter:event.target.value as CoalMeterKey|""})} className="h-10 rounded-lg border border-input bg-background px-2 text-foreground"><option value="">Chọn theo ảnh</option>{ALL_COAL_METER_KEYS.filter(key=>key.startsWith(reviewUnit+"-")).map(key=><option key={key} value={key}>{coalMeterLabel(key)}</option>)}</select></label><label className="grid gap-1 text-xs">Mốc ca đối chiếu<select value={selection.slot} onChange={event=>change({slot:event.target.value as CoalSlot})} className="h-10 rounded-lg border border-input bg-background px-2 text-foreground">{COAL_SLOTS.map(slot=><option key={slot} value={slot}>{slot}h</option>)}</select></label></div>
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground"><div><p className="text-xs text-muted-foreground">AI đọc từ ảnh (cắt 2 số lẻ)</p><strong className="text-xl">{display(comparison.imageValue)} t</strong><p className="text-xs text-muted-foreground">Số gốc AI: {photo.reading.total_display||"—"}</p></div><div><p className="text-xs text-muted-foreground">Số trên bảng · ô {comparison.cell||"—"}</p><strong className="text-xl">{display(comparison.tableValue)} t</strong></div></div>
        <p className={`rounded-lg border p-3 text-sm ${missingImage===photo.id?"border-amber-200 bg-amber-50 text-amber-800":comparison.status==="match"?"border-emerald-200 bg-emerald-50 text-emerald-800":comparison.status==="different"?"border-red-200 bg-red-50 text-red-800":"border-amber-200 bg-amber-50 text-amber-800"}`}>{missingImage===photo.id?"Không tải được ảnh — chưa thể đối chiếu trực quan":labels[comparison.status]}{comparison.difference!==null?` · Bảng − AI: ${display(comparison.difference)} t`:""}</p>
        {photo.reading.confidence!=="high"&&<p className="text-xs text-amber-800">AI chưa chắc chắn: {photo.reading.note||"Vui lòng kiểm tra trực tiếp trên ảnh."}</p>}
        <p className="text-xs text-muted-foreground">Chọn máy/ca ở đây chỉ đổi phép so sánh, không sửa bảng. “Khớp số AI” không có nghĩa đã xác nhận ảnh đúng. Nếu sai, quay lại bảng để người có quyền sửa và lưu.</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-3 text-card-foreground"><h3 className="mb-2 text-sm font-semibold">Ảnh gốc đối chiếu</h3>
        {/* eslint-disable-next-line @next/next/no-img-element -- private expiring authenticated meter photo */}
        <img key={photo.id} onError={()=>setMissingImage(photo.id)} onLoad={()=>setMissingImage(old=>old===photo.id?"":old)} src={`/api/ctktkt/coal-meter-photos?scope=review&id=${encodeURIComponent(photo.id)}`} alt={`Ảnh công tơ ${photo.reading.meter_label||"chưa rõ máy"}`} className="max-h-[65vh] w-full rounded-lg object-contain"/>
        <p className="mt-2 text-xs text-muted-foreground">Có thể mở ảnh bằng menu của trình duyệt để phóng to. Ảnh hết hạn lúc {new Date(photo.expiresAt).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}.</p>
      </div>
    </div>}
  </DialogContent></Dialog>;
}
