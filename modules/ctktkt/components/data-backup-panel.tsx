"use client";
import { useCtktktRequest } from "@/hooks/useCtktkt";

import {useRef,useState} from "react";
import {DatabaseBackup,Download,FileJson,Upload,CheckCircle2,ShieldCheck} from "lucide-react";
import {vietnamDateIso} from "@/modules/ctktkt/lib/operating-date";
import styles from "./data-backup-panel.module.css";
import { DateField } from "./ui/date-field";

type Preview={createdAt:string;range:{from:string;to:string}|null;total:number;tables:Array<{name:string;label:string;count:number}>};
const MAX_FILE_BYTES=3_000_000;
const api="/api/ctktkt/admin/data-backup";

export function DataBackupPanel(){
  const ctktktRequest = useCtktktRequest();

  const [today]=useState(()=>vietnamDateIso());
  const [from,setFrom]=useState(today.slice(0,7)+"-01"),[to,setTo]=useState(today);
  const [all,setAll]=useState(false),[busy,setBusy]=useState("");
  const [file,setFile]=useState<unknown>(null),[fileName,setFileName]=useState("");
  const [preview,setPreview]=useState<Preview|null>(null),[mode,setMode]=useState<"missing"|"overwrite">("missing");
  const [confirmed,setConfirmed]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const input=useRef<HTMLInputElement>(null);
  const reset=()=>{setFile(null);setFileName("");setPreview(null);setConfirmed(false);if(input.current)input.current.value="";};
  async function download(){
    setBusy("download");setError("");setNotice("");
    try{
      const response=await ctktktRequest(api+(all?"/archive":`?from=${from}&to=${to}`),{cache:"no-store",signal:AbortSignal.timeout(65000)});
      if(!response.ok){const body=await response.json() as {error?:string};throw new Error(body.error||"Không tải được bản sao lưu.");}
      const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");
      link.href=url;link.download=`ctktkt-backup-${all?"all":from+"_"+to}-${today}.${all?"zip":"json"}`;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),10000);
      setNotice("Đã tạo tệp sao lưu và gửi tới trình duyệt để tải xuống. Giữ tệp sao lưu nguyên gốc để nạp lại khi cần.");
    }catch(e){setError(e instanceof Error&&e.name!=="TimeoutError"?e.message:"Tải bản sao lưu quá thời gian chờ. Chọn khoảng ngày ngắn hơn rồi thử lại.");}
    finally{setBusy("");}
  }
  async function chooseFile(selected:File|undefined){
    reset();setError("");setNotice("");
    if(!selected)return;
    setBusy("file");
    try{
      if(selected.size>(selected.name.toLowerCase().endsWith(".zip")?25*1024*1024:MAX_FILE_BYTES))throw new Error("Tệp vượt 3 MB. Chọn bản sao lưu theo khoảng ngày ngắn hơn.");
      setFile(selected.name.toLowerCase().endsWith(".zip")?selected:JSON.parse(await selected.text()));setFileName(selected.name);
    }catch(e){setError(e instanceof SyntaxError?"Tệp không phải JSON hợp lệ.":e instanceof Error?e.message:"Không đọc được tệp.");}
    finally{setBusy("");}
  }
  async function submit(action:"preview"|"restore"){
    setBusy(action);setError("");setNotice("");
    try{
      const archive=file instanceof File;
      const form=new FormData(); if(archive){form.set("file",file);form.set("action",action);form.set("mode",mode);form.set("confirmed",String(confirmed));}
      const response=await ctktktRequest(api+(archive?"/archive":""),{method:"POST",...(archive?{}:{headers:{"Content-Type":"application/json"}}),body:archive?form:JSON.stringify({action,mode,file,confirmed}),signal:AbortSignal.timeout(65000)});
      const body=await response.json() as Preview&{error?:string;message?:string};
      if(!response.ok)throw new Error(body.error||"Không thực hiện được thao tác.");
      if(action==="preview"){setPreview(body);setConfirmed(false);}
      else{setNotice(body.message||"Đã nạp dữ liệu.");reset();}
    }catch(e){setError(e instanceof Error&&e.name!=="TimeoutError"?e.message:action==="restore"?"Đã hết thời gian chờ phản hồi. Kết quả nạp chưa xác định; tải bản sao lưu mới để kiểm tra dữ liệu trước khi thử lại.":"Kiểm tra tệp quá thời gian chờ; hãy thử lại.");}
    finally{setBusy("");}
  }
  return <section className={styles.workspace} aria-label="Sao lưu và nạp dữ liệu">
    <div className={styles.intro}><span className={styles.icon}><DatabaseBackup size={24}/></span><div><h2>Giữ một bản dữ liệu trên máy</h2><p>Tải tệp sao lưu, kiểm tra rồi nạp lại khi cần khôi phục số liệu.</p></div><span className={styles.admin}><ShieldCheck size={15}/>Quản trị</span></div>
    <div className={styles.grid}>
      <section id="sao-luu" className={styles.card} style={{scrollMarginTop:"6rem"}} aria-labelledby="backup-download-title">
        <div className={styles.heading}><span className={styles.step}>01</span><div><h3 id="backup-download-title">Tải bản sao lưu</h3><p>Chọn phạm vi dữ liệu cần giữ.</p></div></div>
        <div className={styles.dates}><label>Từ ngày<DateField value={from} disabled={Boolean(busy)||all} onChange={setFrom} placeholder="Từ ngày"/></label><label>Đến ngày<DateField value={to} disabled={Boolean(busy)||all} onChange={setTo} placeholder="Đến ngày"/></label></div>
        <label className={styles.check}><input type="checkbox" checked={all} disabled={Boolean(busy)} onChange={e=>setAll(e.target.checked)}/>Tất cả thời gian</label>
        <button type="button" className={styles.primary} disabled={Boolean(busy)||(!all&&(!from||!to||from>to))} onClick={download}><Download size={18}/>{busy==="download"?"Đang tạo bản sao…":"Tải bản sao lưu"}</button>
        <div className={styles.scope}><strong>Dữ liệu được giữ</strong><p>KTKT / PMIS, thông số BCSX, sự kiện, SHN/PPA, công tơ nước và hiệu chỉnh, hóa chất, chỉ tiêu theo kỳ và danh sách trưởng ca.</p><p>Chỉ tiêu theo kỳ lấy trọn tháng có trong khoảng chọn; danh sách trưởng ca lấy toàn bộ.</p><p>Tệp này không chứa tài khoản, mật khẩu, khóa API hoặc ảnh công tơ. Ảnh vẫn áp dụng thời hạn 4 mốc ca.</p><p>Mỗi tệp tối đa 3 MB / 12.000 bản ghi. Khi dữ liệu lớn, tải riêng từng tháng.</p></div>
      </section>
      <section id="nap-du-lieu" className={styles.card} style={{scrollMarginTop:"6rem"}} aria-labelledby="backup-restore-title">
        <div className={styles.heading}><span className={styles.step}>02</span><div><h3 id="backup-restore-title">Nạp từ bản sao lưu</h3><p>Kiểm tra tệp trước khi ghi vào hệ thống.</p></div></div>
        <div className={styles.file}><FileJson size={27}/><div><strong>{fileName||"Chọn tệp .json hoặc gói .zip"}</strong><p>{fileName?"Tệp đã chọn · chưa ghi dữ liệu":"JSON tối đa 3 MB · ZIP tối đa 25 MB"}</p></div></div>
        <div className={styles.actions}><button type="button" disabled={Boolean(busy)} onClick={()=>input.current?.click()}><Upload size={16}/>{fileName?"Chọn tệp khác":"Chọn tệp sao lưu"}</button>{fileName&&<button type="button" disabled={Boolean(busy)} onClick={reset}>Bỏ tệp</button>}</div>
        <input ref={input} type="file" accept=".json,.zip,application/json,application/zip" className={styles.hidden} aria-label="Tệp sao lưu" onChange={e=>{void chooseFile(e.target.files?.[0]);}}/>
        <label className={styles.mode}>Cách nạp<select value={mode} disabled={Boolean(busy)} onChange={e=>{setMode(e.target.value as "missing"|"overwrite");setPreview(null);setConfirmed(false);}}><option value="missing">Chỉ bổ sung bản ghi còn thiếu</option><option value="overwrite">Ghi đè bản ghi trùng bằng dữ liệu trong tệp</option></select></label>
        <p className={styles.hint}>{mode==="missing"?"Bản ghi đã có được giữ nguyên. Có thể nạp nhiều tệp theo tháng.":"Giá trị trong tệp thay thế bản ghi trùng khóa. Nên tải một bản sao hiện tại trước khi dùng cách này."} Các bản ghi ngoài tệp được giữ nguyên.</p>
        <p className={styles.hint}>Bản sao dùng để khôi phục cho cùng hệ thống. Sự kiện, hóa chất và chỉ tiêu theo kỳ nhận diện theo mã bản ghi.</p>
        <button type="button" disabled={Boolean(busy)||!file} onClick={()=>submit("preview")}><CheckCircle2 size={17}/>{busy==="preview"?"Đang kiểm tra…":"Kiểm tra tệp & xem trước"}</button>
      </section>
    </div>
    {error&&<div className={styles.error} role="alert">{error}</div>}
    {notice&&<div className={styles.notice} role="status">{notice}</div>}
    {preview&&<section className={styles.card} aria-labelledby="backup-preview-title">
      <div className={styles.previewHeader}><div><h3 id="backup-preview-title">Xem trước dữ liệu sẽ nạp</h3><p className={styles.hint}>Tạo lúc {new Date(preview.createdAt).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})} · {preview.range?`${preview.range.from} → ${preview.range.to}`:"Tất cả thời gian"}</p></div><strong>{preview.total.toLocaleString("vi-VN")} bản ghi trong tệp</strong></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Nhóm dữ liệu</th><th>Số bản ghi trong tệp</th></tr></thead><tbody>{preview.tables.map(table=><tr key={table.name}><td>{table.label}</td><td>{table.count.toLocaleString("vi-VN")}</td></tr>)}</tbody></table></div>
      <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={Boolean(busy)} onChange={e=>setConfirmed(e.target.checked)}/>{mode==="overwrite"?"Tôi xác nhận ghi đè các bản ghi trùng bằng dữ liệu trong tệp này.":"Tôi đã kiểm tra và đồng ý bổ sung dữ liệu còn thiếu từ tệp này."}</label>
      <button type="button" className={styles.primary} disabled={Boolean(busy)||!confirmed||preview.total===0} onClick={()=>submit("restore")}><Upload size={18}/>{busy==="restore"?"Đang nạp dữ liệu…":"Xác nhận nạp dữ liệu"}</button>
    </section>}
  </section>;
}
