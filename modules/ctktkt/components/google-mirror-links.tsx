"use client";
import { useCtktktRequest } from "@/hooks/useCtktkt";
import {useEffect,useState} from 'react';
import {GOOGLE_MIRROR_FILES,mirrorUrl} from '@/modules/ctktkt/lib/google-mirror';
type Entry={fileKey:string;period:string;syncedAt:string};
export function GoogleMirrorLinks({module}:{module:string}){
 const ctktktRequest=useCtktktRequest();
 const [configured,setConfigured]=useState(false);
 const files=GOOGLE_MIRROR_FILES.filter(f=>f.module===module);
 const [entries,setEntries]=useState<Entry[]>([]);
 useEffect(()=>{if(!files.length)return;const controller=new AbortController();ctktktRequest('/api/ctktkt/google-mirror/status',{signal:controller.signal}).then(async r=>r.ok?await r.json() as {entries?:Entry[];configured?:boolean}:null).then(b=>{if(b?.entries)setEntries(b.entries);setConfigured(Boolean(b?.configured));}).catch(()=>{});return()=>controller.abort();},[module,files.length,ctktktRequest]);
 if(!files.length||!configured)return null;
 return <section aria-label="File Google Sheets của mục này" className="google-mirror-bar mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 print:hidden">
  {files.map(f=>{const status=entries.find(e=>e.fileKey===f.key);return <div key={f.key} className="flex flex-col gap-1">
   <a href={mirrorUrl(f.id)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-100">Xem Google Sheets{files.length>1?` · ${f.label}`:''}</a>
   <span className="text-xs text-slate-600">{status?`Tháng ${status.period} · cập nhật ${new Date(status.syncedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}`:'Chưa xác nhận đồng bộ tự động'}</span>
  </div>;})}
  <p className="text-xs text-slate-600">Nhập và sửa số liệu trên web. Bản Google Sheets cập nhật theo giờ; quyền xem và tải/in do chủ sở hữu cấp.</p>
 </section>;
}
