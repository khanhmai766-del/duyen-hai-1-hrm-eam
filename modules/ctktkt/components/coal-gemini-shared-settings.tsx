"use client";
import { useCoalGeminiSettings, useSaveCoalGeminiSettings, type CoalGeminiSettings } from "@/hooks/useKtktReport";
import {useState} from "react";
import {KeyRound,Save,RefreshCw} from "lucide-react";
import styles from "./coal-meter-photo-import.module.css";
import {DEFAULT_COAL_GEMINI_MODEL} from "@/modules/ctktkt/lib/coal-gemini-config";
export function CoalGeminiSharedSettings({disabled=false,onSaved}:{disabled?:boolean;onSaved?:()=>void}){
  const settings=useCoalGeminiSettings(),saveSettings=useSaveCoalGeminiSettings();
  const [key,setKey]=useState(""),[model,setModel]=useState(DEFAULT_COAL_GEMINI_MODEL);
  const [busy,setBusy]=useState(false),[actionError,setError]=useState(""),[message,setMessage]=useState("");
  const [expanded,setExpanded]=useState(false);
  const status=settings.data?.shared??null,environment=Boolean(settings.data?.environmentConfigured);
  const saving=busy||saveSettings.isPending;
  // Trạng thái mới từ máy chủ (tải/tải lại/lưu) → ô Model lấy theo model đang lưu chung, như bản cũ.
  const [accepted,setAccepted]=useState<CoalGeminiSettings|null>(null);
  if(settings.data&&settings.data!==accepted){setAccepted(settings.data);if(settings.data.shared.model)setModel(settings.data.shared.model);}
  const error=actionError||(settings.error instanceof Error?settings.error.message||"Chưa tải được cấu hình.":"");
  async function refresh(){
    setBusy(true);setError("");setMessage("");
    try{const result=await settings.refetch();if(result.error)setError(result.error.message||"Chưa tải được trạng thái.");}finally{setBusy(false);}
  }
  async function save(modelOnly=false){
    if(!status)return;
    const replacementKey=modelOnly?"":key.trim();
    setError("");setMessage("");
    try{
      await saveSettings.mutateAsync({key:replacementKey,model:model.trim(),expectedVersion:status.version});
      setKey("");onSaved?.();setMessage(replacementKey?"Đã lưu khóa dùng chung và chuyển lượt nhập này sang khóa chung. Các VHV có quyền nhập công tơ không cần nhập lại. Bấm Kiểm tra Gemini để thử gọi Google.":"Đã cập nhật model và giữ nguyên khóa dùng chung. Bấm Kiểm tra Gemini hoặc đọc lại ảnh để kiểm tra model mới.");
    }catch(error){setError(error instanceof Error?error.message:"Chưa lưu được khóa.");}
  }
  const locked=disabled||saving;
  return <section className={styles.settingsCard} aria-label="Khóa Gemini dùng chung">
    <div className={styles.settingsSummary}>
      <KeyRound size={16} aria-hidden/>
      <div><strong>Gemini dùng chung</strong><span>{status?.configured?"Đã lưu khóa trên máy chủ":status?environment?"Đang dùng cấu hình máy chủ":"Chưa có khóa chung":"Đang tải cấu hình…"}{status?.configured&&status.model?` · ${status.model}`:""}</span></div>
      <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?"Thu gọn":"Cấu hình Gemini"}</button>
    </div>
    {expanded&&<div className={styles.settingsForm}>
      <p>Một VHV lưu khóa, các VHV có quyền nhập công tơ dùng chung. Khóa mới sẽ thay khóa đang dùng cho mọi người. Lưu khóa chưa xác nhận quyền truy cập hoặc hạn mức của Google.</p>
      {status?.updatedBy&&<p>Cập nhật bởi {status.updatedBy}{status.updatedAt?` · ${new Date(status.updatedAt).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}`:""}</p>}
      <div className={styles.fields}>
        <label>Khóa API muốn lưu chung<input type="password" autoComplete="off" spellCheck={false} maxLength={256} disabled={locked} value={key} onChange={event=>setKey(event.target.value)} placeholder={status?.configured?"Để trống để giữ khóa đã lưu":"Dán khóa Gemini tại đây"}/></label>
        <label>Model dùng chung<input value={model} disabled={locked} spellCheck={false} maxLength={110} onChange={event=>setModel(event.target.value)}/></label>
      </div>
      <div className={styles.actions}><button type="button" disabled={locked} onClick={()=>setModel(DEFAULT_COAL_GEMINI_MODEL)}>Chọn model đọc nhanh</button><button type="button" className={styles.primary} disabled={locked||!status?.configured||!model.trim()} onClick={()=>void save(true)}>Lưu model, giữ nguyên khóa</button><button type="button" disabled={locked||!status||!key.trim()||!model.trim()} onClick={()=>void save()}><Save size={15} aria-hidden/>{saving?"Đang xử lý…":"Lưu khóa dùng chung"}</button><button type="button" disabled={locked} onClick={()=>void refresh()}><RefreshCw size={14} aria-hidden/>Tải lại trạng thái</button></div>
      <p>Nút Kiểm tra Gemini bên dưới dùng đúng nguồn khóa đang hiển thị. Khóa/model mới trong các ô trên chỉ có hiệu lực sau khi lưu.</p>
    </div>}
    {error&&<p role="alert" className={styles.error}>{error} <button type="button" disabled={locked} onClick={()=>void refresh()}>Thử tải lại</button></p>}
    <div role="status">{message&&<p className={styles.notice}>{message}</p>}</div>
  </section>;
}
