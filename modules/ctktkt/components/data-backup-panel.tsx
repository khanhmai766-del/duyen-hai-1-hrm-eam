"use client";
import { apiDownload, apiMutate, apiUpload } from "@/lib/fetcher";
import { useQueryClient } from "@tanstack/react-query";

import {useRef,useState} from "react";
import {DatabaseBackup,Download,FileJson,Upload,CheckCircle2,ShieldCheck} from "lucide-react";
import {vietnamDateIso} from "@/modules/ctktkt/lib/operating-date";
import { DateField } from "./ui/date-field";

type Preview={createdAt:string;range:{from:string;to:string}|null;total:number;tables:Array<{name:string;label:string;count:number}>};
const MAX_FILE_BYTES=3_000_000;
const api="/api/ctktkt/admin/data-backup";

// Trước ở data-backup-panel.module.css. Quy tắc cho phần tử con (nút, ô ngày, bảng) đặt ở khung ngoài bằng [&_…] —
// cùng độ ưu tiên với bộ chọn ".workspace button" cũ.
const WORKSPACE = [
  "mx-auto grid max-w-[1180px] gap-5 text-[#17354b]",
  "[&_input[type=date]]:![font:inherit] [&_input[type=date]]:min-h-[43px] [&_input[type=date]]:w-full [&_input[type=date]]:min-w-0 [&_input[type=date]]:rounded-[9px] [&_input[type=date]]:border [&_input[type=date]]:border-[#c2d1dd] [&_input[type=date]]:bg-white [&_input[type=date]]:px-[11px] [&_input[type=date]]:py-[9px] [&_input[type=date]]:text-[#17354b]",
  "[&_button]:inline-flex [&_button]:!min-h-[44px] [&_button]:cursor-pointer [&_button]:items-center [&_button]:justify-center [&_button]:gap-2 [&_button]:rounded-[9px] [&_button]:border [&_button]:border-[#becfdb] [&_button]:bg-white [&_button]:px-[15px] [&_button]:py-[11px] [&_button]:font-[650] [&_button]:text-[#264a65] [&_button]:[font-size:14px]",
  "[&_button:hover:enabled]:bg-[#f0f6f8] [&_button:disabled]:cursor-default [&_button:disabled]:opacity-50",
  "[&_:is(input,select,button):focus-visible]:[outline-offset:2px] [&_:is(input,select,button):focus-visible]:[outline:3px_solid_#73b5f2]",
  "[&_table]:w-full [&_table]:border-collapse [&_table]:[font-size:14px] [&_th]:bg-[#eef4f7] [&_th]:text-left [&_th]:text-[#23465d] [&_th]:[font-size:12px]",
  "[&_:is(td,th)]:border-b [&_:is(td,th)]:border-b-[#e2eaf0] [&_:is(td,th)]:px-[14px] [&_:is(td,th)]:py-3 [&_:is(td,th):last-child]:text-right [&_:is(td,th):last-child]:tabular-nums [&_tbody_tr:last-child_td]:[border-bottom:0]",
].join(" ");
const CARD = "min-w-0 rounded-[16px] border border-[#d6e1e9] bg-white p-6 max-[850px]:p-[18px] [&_h3]:mx-0 [&_h3]:mb-[3px] [&_h3]:mt-0 [&_h3]:font-bold [&_h3]:[font-size:18px]";
const HEADING = "mb-6 items-center gap-3 [display:flex] [&_p]:m-0 [&_p]:text-[#536a7c] [&_p]:[font-size:14px]";
const STEP = "rounded-[9px] border border-[#cfe5de] bg-[#eaf5f2] p-[9px] text-[12px] font-bold tracking-[1px] text-[#087368]";
const CHECK = "mx-0 my-[17px] items-start gap-[9px] leading-[1.6] [display:flex] [font-size:14px] [&_input]:mt-[3px] [&_input]:h-[18px] [&_input]:w-[18px] [&_input]:shrink-0 [&_input]:[accent-color:#155b76]";
const HINT = "mx-0 mb-[15px] mt-2 leading-[1.6] text-[#536a7c] [font-size:13px]";
const PRIMARY = "!border-[#155b76] !bg-[#155b76] !text-white enabled:hover:!bg-[#10475c] max-[480px]:w-full";

export function DataBackupPanel({canBackup = true, canRestore = true}:{canBackup?:boolean;canRestore?:boolean}){
  const queryClient = useQueryClient();
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
      // Lỗi máy chủ (phong bì {error}) → câu báo của máy chủ; thành công là tệp JSON/ZIP.
      const {blob}=await apiDownload(api+(all?"/archive":`?from=${from}&to=${to}`),{signal:AbortSignal.timeout(65000)});
      const url=URL.createObjectURL(blob),link=document.createElement("a");
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
      const signal=AbortSignal.timeout(65000);
      const body=archive
        ?await apiUpload<Preview&{message?:string}>(api+"/archive",form,{signal})
        :await apiMutate<Preview&{message?:string}>(api,"POST",{action,mode,file,confirmed},{signal});
      if(action==="preview"){setPreview(body);setConfirmed(false);}
      // Nạp xong: mọi dữ liệu KTKT đang lưu tạm trên trình duyệt coi là cũ (như lượt ghi KTKT khác).
      else{setNotice(body.message||"Đã nạp dữ liệu.");reset();void queryClient.invalidateQueries({queryKey:["ctktkt"]});}
    }catch(e){setError(e instanceof Error&&e.name!=="TimeoutError"?e.message:action==="restore"?"Đã hết thời gian chờ phản hồi. Kết quả nạp chưa xác định; tải bản sao lưu mới để kiểm tra dữ liệu trước khi thử lại.":"Kiểm tra tệp quá thời gian chờ; hãy thử lại.");}
    finally{setBusy("");}
  }
  return <section className={WORKSPACE} aria-label="Sao lưu và nạp dữ liệu">
    <div className="items-center gap-3.5 px-0 pb-0.5 pt-1.5 [display:flex] max-[480px]:items-start"><span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[14px] bg-[#dfefee] text-[#08665d]"><DatabaseBackup size={24}/></span><div><h2 className="mx-0 mb-[5px] mt-0 font-[750] leading-[1.3] [font-size:22px] max-[850px]:[font-size:19px]">Giữ một bản dữ liệu trên máy</h2><p className="m-0 text-[#536a7c] [font-size:14px] max-[480px]:[font-size:13px]">Tải tệp sao lưu, kiểm tra rồi nạp lại khi cần khôi phục số liệu.</p></div><span className="ml-auto items-center gap-1.5 whitespace-nowrap rounded-[20px] border border-[#cddde5] px-2.5 py-1.5 text-[12px] [display:flex] max-[850px]:hidden"><ShieldCheck size={15}/>Đã cấp quyền</span></div>
    <div className="grid grid-cols-[1fr_1fr] gap-5 max-[850px]:grid-cols-[1fr]" style={canBackup&&canRestore?undefined:{gridTemplateColumns:"minmax(0, 1fr)"}}>
      {canBackup&&<section id="sao-luu" className={CARD} style={{scrollMarginTop:"6rem"}} aria-labelledby="backup-download-title">
        <div className={HEADING}><span className={STEP}>01</span><div><h3 id="backup-download-title">Tải bản sao lưu</h3><p>Chọn phạm vi dữ liệu cần giữ.</p></div></div>
        <div className="grid grid-cols-[1fr_1fr] gap-3 max-[480px]:grid-cols-[1fr] [&_label]:grid [&_label]:gap-[7px] [&_label]:font-[650] [&_label]:[font-size:13px]"><label>Từ ngày<DateField value={from} disabled={Boolean(busy)||all} onChange={setFrom} placeholder="Từ ngày"/></label><label>Đến ngày<DateField value={to} disabled={Boolean(busy)||all} onChange={setTo} placeholder="Đến ngày"/></label></div>
        <label className={CHECK}><input type="checkbox" checked={all} disabled={Boolean(busy)} onChange={e=>setAll(e.target.checked)}/>Tất cả thời gian</label>
        <button type="button" className={PRIMARY} disabled={Boolean(busy)||(!all&&(!from||!to||from>to))} onClick={download}><Download size={18}/>{busy==="download"?"Đang tạo bản sao…":"Tải bản sao lưu"}</button>
        <div className="mt-6 border-t border-t-[#e0e9ee] pt-[18px] leading-[1.65] text-[#536a7c] [font-size:13px] [&_p]:mx-0 [&_p]:my-[7px] [&_strong]:text-[#27445a]"><strong>Dữ liệu được giữ</strong><p>KTKT / PMIS, thông số BCSX, sự kiện, SHN/PPA, công tơ nước và hiệu chỉnh, hóa chất, chỉ tiêu theo kỳ và danh sách trưởng ca.</p><p>Chỉ tiêu theo kỳ lấy trọn tháng có trong khoảng chọn; danh sách trưởng ca lấy toàn bộ.</p><p>Tệp này không chứa tài khoản, mật khẩu, khóa API hoặc ảnh công tơ. Ảnh vẫn áp dụng thời hạn 4 mốc ca.</p><p>Mỗi tệp tối đa 3 MB / 12.000 bản ghi. Khi dữ liệu lớn, tải riêng từng tháng.</p></div>
      </section>}
      {canRestore&&<section id="nap-du-lieu" className={CARD} style={{scrollMarginTop:"6rem"}} aria-labelledby="backup-restore-title">
        <div className={HEADING}><span className={STEP}>02</span><div><h3 id="backup-restore-title">Nạp từ bản sao lưu</h3><p>Kiểm tra tệp trước khi ghi vào hệ thống.</p></div></div>
        <div className="mb-3 items-center gap-3 rounded-[11px] border border-dashed border-[#aebfce] bg-[#f5f9fb] p-[18px] [display:flex] [&_div]:min-w-0 [&_p]:mx-0 [&_p]:mb-0 [&_p]:mt-1 [&_p]:text-[#536a7c] [&_p]:[font-size:12px] [&_strong]:block [&_strong]:[font-size:14px] [&_strong]:[overflow-wrap:anywhere]"><FileJson size={27}/><div><strong>{fileName||"Chọn tệp .json hoặc gói .zip"}</strong><p>{fileName?"Tệp đã chọn · chưa ghi dữ liệu":"JSON tối đa 3 MB · ZIP tối đa 25 MB"}</p></div></div>
        <div className="mb-[19px] flex-wrap gap-2 [display:flex]"><button type="button" disabled={Boolean(busy)} onClick={()=>input.current?.click()}><Upload size={16}/>{fileName?"Chọn tệp khác":"Chọn tệp sao lưu"}</button>{fileName&&<button type="button" disabled={Boolean(busy)} onClick={reset}>Bỏ tệp</button>}</div>
        <input ref={input} type="file" accept=".json,.zip,application/json,application/zip" className="hidden" aria-label="Tệp sao lưu" onChange={e=>{void chooseFile(e.target.files?.[0]);}}/>
        <label className="mb-2.5 grid gap-[7px] font-[650] [font-size:13px] [&_select]:![font:inherit] [&_select]:!min-h-[43px] [&_select]:w-full [&_select]:min-w-0 [&_select]:rounded-[9px] [&_select]:border [&_select]:border-[#c2d1dd] [&_select]:bg-white [&_select]:px-[11px] [&_select]:py-[9px] [&_select]:text-[#17354b]">Cách nạp<select value={mode} disabled={Boolean(busy)} onChange={e=>{setMode(e.target.value as "missing"|"overwrite");setPreview(null);setConfirmed(false);}}><option value="missing">Chỉ bổ sung bản ghi còn thiếu</option><option value="overwrite">Ghi đè bản ghi trùng bằng dữ liệu trong tệp</option></select></label>
        <p className={HINT}>{mode==="missing"?"Bản ghi đã có được giữ nguyên. Có thể nạp nhiều tệp theo tháng.":"Giá trị trong tệp thay thế bản ghi trùng khóa. Nên tải một bản sao hiện tại trước khi dùng cách này."} Các bản ghi ngoài tệp được giữ nguyên.</p>
        <p className={HINT}>Bản sao dùng để khôi phục cho cùng hệ thống. Sự kiện, hóa chất và chỉ tiêu theo kỳ nhận diện theo mã bản ghi.</p>
        <button type="button" disabled={Boolean(busy)||!file} onClick={()=>submit("preview")}><CheckCircle2 size={17}/>{busy==="preview"?"Đang kiểm tra…":"Kiểm tra tệp & xem trước"}</button>
      </section>}
    </div>
    {error&&<div className="rounded-[10px] border border-[#edc8c3] bg-[#fff2f0] px-[18px] py-[15px] leading-[1.6] text-[#9a2525] [font-size:14px]" role="alert">{error}</div>}
    {notice&&<div className="rounded-[10px] border border-[#b9deca] bg-[#edf9f2] px-[18px] py-[15px] leading-[1.6] text-[#116248] [font-size:14px]" role="status">{notice}</div>}
    {canRestore&&preview&&<section className={CARD} aria-labelledby="backup-preview-title">
      <div className="justify-between gap-[15px] [align-items:start] [display:flex] max-[480px]:block [&>strong]:whitespace-nowrap [&>strong]:[font-size:14px]"><div><h3 id="backup-preview-title">Xem trước dữ liệu sẽ nạp</h3><p className={HINT}>Tạo lúc {new Date(preview.createdAt).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})} · {preview.range?`${preview.range.from} → ${preview.range.to}`:"Tất cả thời gian"}</p></div><strong>{preview.total.toLocaleString("vi-VN")} bản ghi trong tệp</strong></div>
      <div className="overflow-auto"><table><thead><tr><th>Nhóm dữ liệu</th><th>Số bản ghi trong tệp</th></tr></thead><tbody>{preview.tables.map(table=><tr key={table.name}><td>{table.label}</td><td>{table.count.toLocaleString("vi-VN")}</td></tr>)}</tbody></table></div>
      <label className={CHECK}><input type="checkbox" checked={confirmed} disabled={Boolean(busy)} onChange={e=>setConfirmed(e.target.checked)}/>{mode==="overwrite"?"Tôi xác nhận ghi đè các bản ghi trùng bằng dữ liệu trong tệp này.":"Tôi đã kiểm tra và đồng ý bổ sung dữ liệu còn thiếu từ tệp này."}</label>
      <button type="button" className={PRIMARY} disabled={Boolean(busy)||!confirmed||preview.total===0} onClick={()=>submit("restore")}><Upload size={18}/>{busy==="restore"?"Đang nạp dữ liệu…":"Xác nhận nạp dữ liệu"}</button>
    </section>}
  </section>;
}
