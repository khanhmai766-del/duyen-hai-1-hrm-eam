"use client";
import { useCtktktRequest } from "@/hooks/useCtktkt";
import {useEffect,useState} from 'react';
import {TriangleAlert} from 'lucide-react';
import {useSessionUser} from './session-context';
import {hasPermission} from '../lib/auth/session';
import {GOOGLE_MIRROR_FILES,mirrorUrl} from '@/modules/ctktkt/lib/google-mirror';
type Entry={fileKey:string;period:string;syncedAt:string};

/** Lịch Apps Script chạy mỗi giờ: quá 2 giờ chưa có lần đồng bộ mới thì coi là đã trễ. */
const STALE_AFTER_MS=2*60*60*1000;
/** Trang có nhiều file (BCSX): nút ghi gọn "Sheet · …". Giữ nguyên `label` vì bản chụp gửi Apps Script dùng nó. */
const SHORT_LABEL:Record<string,string>={'bcsx-s1':'BCSX S1','bcsx-s2':'BCSX S2','bcsx-a0':'BCSX DH1'};
const buttonText=(f:{key:string;label:string},many:boolean)=>many?`Sheet · ${SHORT_LABEL[f.key]??f.label}`:'Xem Google Sheets';
const formatTime=(iso:string)=>new Date(iso).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'});

/**
 * Một dòng gọn trên mỗi trang KTKT: nút mở file Google Sheets của trang + giờ cập nhật gần nhất.
 * Cài đặt kết nối (tải tệp Apps Script) nằm ở biểu tượng Google Sheets trên hàng tiêu đề, chỉ quản trị thấy.
 * Người dùng thường không thấy thông báo "chưa kết nối" — chỉ thấy nút xem file.
 */
export function GoogleMirrorLinks({module,variant="bar"}:{module:string;variant?:"bar"|"inline"}){
 const ctktktRequest=useCtktktRequest();
 const user=useSessionUser();
 const isAdmin=hasPermission(user,"manage_users");
 const [configured,setConfigured]=useState(false);
 const files=GOOGLE_MIRROR_FILES.filter(f=>f.module===module);
 const [entries,setEntries]=useState<Entry[]>([]);
 // Mốc "bây giờ" lấy sau khi tải trạng thái (không gọi Date.now() lúc render để tránh lệch hydrate).
 const [checkedAt,setCheckedAt]=useState(0);
 useEffect(()=>{if(!files.length)return;const controller=new AbortController();ctktktRequest('/api/ctktkt/google-mirror/status',{signal:controller.signal}).then(async r=>r.ok?await r.json() as {entries?:Entry[];configured?:boolean}:null).then(b=>{if(b?.entries)setEntries(b.entries);setConfigured(Boolean(b?.configured));setCheckedAt(Date.now());}).catch(()=>{});return()=>controller.abort();},[module,files.length,ctktktRequest]);
 if(!files.length)return null;
 // Kiểu "inline": chỉ nút (cùng cỡ nút thanh công cụ), giờ cập nhật đưa vào chú thích khi rê chuột.
 if(variant==="inline")return <>{files.map(f=>{
   const status=entries.find(e=>e.fileKey===f.key);
   const stale=Boolean(configured&&checkedAt&&(!status||checkedAt-Date.parse(status.syncedAt)>STALE_AFTER_MS));
   const note=!configured?(isAdmin?"Web PX chưa kết nối đồng bộ — cài đặt ở biểu tượng Google Sheets trên hàng tiêu đề.":"Mở file Google Sheets")
     :status?`${stale?"Chưa đồng bộ quá 2 giờ · lần cuối ":"Cập nhật "}${formatTime(status.syncedAt)} · tháng ${status.period.slice(5)}/${status.period.slice(0,4)}`:"Chưa có lần đồng bộ được xác nhận";
   return <a key={f.key} href={mirrorUrl(f.id)} target="_blank" rel="noopener noreferrer" title={note}
     className={`ktkt-toolbar-link flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3.5 text-xs font-bold shadow-xs ${stale?"border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100":"border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-50"}`}>
     {stale&&<TriangleAlert className="size-3.5 shrink-0" aria-hidden/>}{buttonText(f,files.length>1)}
   </a>;})}</>;
 return <section aria-label="File Google Sheets của mục này" className="google-mirror-bar mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 print:hidden">
  {files.map(f=>{
   const status=entries.find(e=>e.fileKey===f.key);
   const stale=Boolean(configured&&checkedAt&&(!status||checkedAt-Date.parse(status.syncedAt)>STALE_AFTER_MS));
   return <div key={f.key} className="flex flex-wrap items-center gap-2">
    <a href={mirrorUrl(f.id)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-100">{buttonText(f,files.length>1)}</a>
    {configured&&<span className={`inline-flex items-center gap-1 text-xs ${stale?"font-semibold text-amber-700":"text-slate-600"}`} title={stale?"Lịch đồng bộ chạy mỗi giờ; quá 2 giờ chưa có lần cập nhật mới — kiểm tra dự án Apps Script.":undefined}>
     {stale&&<TriangleAlert className="size-3.5 shrink-0" aria-hidden/>}
     {status?`${stale?"Chưa đồng bộ quá 2 giờ · lần cuối ":"Cập nhật "}${formatTime(status.syncedAt)} · tháng ${status.period.slice(5)}/${status.period.slice(0,4)}`:"Chưa có lần đồng bộ được xác nhận"}
    </span>}
   </div>;})}
  {!configured&&isAdmin&&<span className="text-xs text-slate-600">Web PX chưa kết nối đồng bộ — cài đặt ở biểu tượng Google Sheets trên hàng tiêu đề.</span>}
 </section>;
}
