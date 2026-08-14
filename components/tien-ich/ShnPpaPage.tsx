"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, BarChart3, CheckCircle2, ExternalLink, FileSpreadsheet, Loader2, RefreshCw, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiMutate } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

type Kind = "dh1" | "ref" | "unknown";
type LoadedFile = { name: string; kind: Kind; workbook: XLSX.WorkBook };
type PpaDay = { ppaChung: number|null; ppaS1: number|null; ppaS2: number|null; ttChung: number|null; ttS1: number|null; ttS2: number|null; clChung: number|null; clChungPct: number|null; dgChung: string|null; clS1: number|null; clS1Pct: number|null; dgS1: string|null; clS2: number|null; clS2Pct: number|null; dgS2: string|null; nnS1: string|null; nnS2: string|null };
type RefDay = { genS1: number|null; csbqS1: number|null; genS2: number|null; csbqS2: number|null; genTong: number|null; csbqTong: number|null; coalS1: number|null; coalS2: number|null; coalTong: number|null; nhietTri: number|null };
type MergedDay = { day: number; selected: boolean; ppa: PpaDay; ref: RefDay; csKhaDungS1: number|null; csKhaDungS2: number|null };
type SheetDateRow = { row: number; display: string; isDate: boolean; iso?: string };
type SyncResult = { results?: Array<{ date: string; row: number; status: string }> };

const norm = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const pad = (value: number) => String(value).padStart(2, "0");
const format = (value: number|null, digits = 0) => value == null ? "—" : value.toLocaleString("vi-VN", { maximumFractionDigits: digits });

function classify(workbook: XLSX.WorkBook): Kind {
  const names = workbook.SheetNames.map(norm);
  if (names.includes("ca nha may dh1")) return "dh1";
  if (workbook.SheetNames.some((name) => /^T\d{2}$/.test(name))) return "ref";
  return "unknown";
}

function parsePpa(workbook: XLSX.WorkBook) {
  const name = workbook.SheetNames.find((item) => norm(item) === "ca nha may dh1");
  if (!name) return {} as Record<number, PpaDay>;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: true, defval: null });
  const output: Record<number, PpaDay> = {};
  for (let index = 0; index < 31; index++) {
    const row = rows[index + 2]; if (!row) continue;
    output[index + 1] = { ppaChung:num(row[1]), ppaS1:num(row[2]), ppaS2:num(row[3]), ttChung:num(row[4]), ttS1:num(row[5]), ttS2:num(row[6]), clChung:num(row[7]), clChungPct:num(row[8]), dgChung:row[9] ? String(row[9]) : null, clS1:num(row[10]), clS1Pct:num(row[11]), dgS1:row[12] ? String(row[12]) : null, clS2:num(row[13]), clS2Pct:num(row[14]), dgS2:row[15] ? String(row[15]) : null, nnS1:row[16] ? String(row[16]) : null, nnS2:row[17] ? String(row[17]) : null };
  }
  return output;
}

function parseRef(workbook: XLSX.WorkBook, month: number) {
  const sheet = workbook.Sheets[`T${pad(month)}`];
  if (!sheet) return {} as Record<number, RefDay>;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const output: Record<number, RefDay> = {};
  for (let index = 0; index < 31; index++) {
    const row = rows[index + 5]; if (!row || row[0] !== index + 1) break;
    output[index + 1] = { genS1:num(row[2]), csbqS1:num(row[6]), genS2:num(row[8]), csbqS2:num(row[12]), genTong:num(row[14]), csbqTong:num(row[18]), coalS1:num(row[32]), coalS2:num(row[33]), coalTong:num(row[34]), nhietTri:num(row[35]) };
  }
  return output;
}

function parseCapacity(workbook: XLSX.WorkBook, sheetName: string, month: number, year: number) {
  const sheet = workbook.Sheets[sheetName]; if (!sheet) return {} as Record<number, number|null>;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const column = (rows[0] ?? []).findIndex((value, index) => index >= 5 && index < 80 && value === 48);
  const output: Record<number, number|null> = {}; if (column < 0) return output;
  for (const row of rows.slice(1)) {
    if (typeof row?.[3] !== "number") continue;
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(row[3]) * 86400000);
    if (date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month) output[date.getUTCDate()] = num(row[column]);
  }
  return output;
}

function resolveRow(month: number, day: number, year: number, rows: SheetDateRow[]) {
  const iso = `${year}-${pad(month)}-${pad(day)}`;
  for (const row of rows) {
    if (row.isDate && row.iso === iso) return row.row;
    const text = String(row.display ?? "").trim();
    const dmy = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (dmy) {
      const a=Number(dmy[1]), b=Number(dmy[2]), y=Number(dmy[3]);
      if (y === year && ((a === month && b === day) || (b === month && a === day))) return row.row;
    }
    const ymd = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (ymd && Number(ymd[1]) === year && Number(ymd[2]) === month && Number(ymd[3]) === day) return row.row;
  }
  return null;
}

export default function ShnPpaPage() {
  const yesterday = useMemo(() => { const d = new Date(); d.setDate(d.getDate()-1); return d; }, []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [month, setMonth] = useState(yesterday.getMonth()+1);
  const [year, setYear] = useState(yesterday.getFullYear());
  const [from, setFrom] = useState(yesterday.getDate());
  const [to, setTo] = useState(yesterday.getDate());
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const [dragging, setDragging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [results, setResults] = useState<SyncResult["results"]>([]);

  const merged = useMemo(() => {
    const dh1 = files.find((file) => file.kind === "dh1"); const ref = files.find((file) => file.kind === "ref");
    if (!dh1) return [];
    const ppa = parsePpa(dh1.workbook); const refData = ref ? parseRef(ref.workbook, month) : {};
    const cap1 = ref ? parseCapacity(ref.workbook, "S1DH1", month, year) : {}; const cap2 = ref ? parseCapacity(ref.workbook, "S2DH1", month, year) : {};
    const output: MergedDay[] = [];
    for (let day=from; day<=to; day++) { const p=ppa[day]; if (!p || (p.ttChung == null && p.ttS1 == null && p.ttS2 == null)) continue; output.push({ day, selected: overrides[day] ?? true, ppa:p, ref:refData[day] ?? {} as RefDay, csKhaDungS1:cap1[day] ?? null, csKhaDungS2:cap2[day] ?? null }); }
    return output;
  }, [files, month, year, from, to, overrides]);

  const selected = merged.filter((item) => item.selected);
  const readFiles = async (list: FileList | File[]) => {
    const loaded: LoadedFile[] = [];
    for (const file of Array.from(list)) {
      try { const workbook = XLSX.read(await file.arrayBuffer(), { type:"array" }); loaded.push({ name:file.name, kind:classify(workbook), workbook }); }
      catch { toast.error(`Không đọc được file ${file.name}`); }
    }
    setFiles((current) => { const next=[...current]; for (const file of loaded) { const index=next.findIndex((item)=>item.kind===file.kind && file.kind!=="unknown"); if(index>=0) next[index]=file; else next.push(file); } return next; });
    setResults([]);
  };

  const payloadFor = (item: MergedDay, row: number) => {
    const difference=(value:number|null,pct:number|null)=>value==null?"":`${value>=0?"+":""}${format(value)} kJ/kWh (${pct==null?"":`${pct>=0?"+":""}${(pct*100).toFixed(2)}%`})`;
    const assessment=(status:string|null,cause:string|null)=>status ? (cause ? `${status} - ${cause}` : status) : "";
    return { date:`${month}/${item.day}/${year}`, row,
      S1:{sanLuong:item.ref.genS1,csKhaDung:item.csKhaDungS1,csBinhQuan:item.ref.csbqS1,suatHaoThan:item.ref.coalS1,nhietTri:item.ref.nhietTri,shnThucTe:item.ppa.ttS1,shnPPA:item.ppa.ppaS1,chenhLech:difference(item.ppa.clS1,item.ppa.clS1Pct),danhGia:assessment(item.ppa.dgS1,item.ppa.nnS1)},
      S2:{sanLuong:item.ref.genS2,csKhaDung:item.csKhaDungS2,csBinhQuan:item.ref.csbqS2,suatHaoThan:item.ref.coalS2,nhietTri:item.ref.nhietTri,shnThucTe:item.ppa.ttS2,shnPPA:item.ppa.ppaS2,chenhLech:difference(item.ppa.clS2,item.ppa.clS2Pct),danhGia:assessment(item.ppa.dgS2,item.ppa.nnS2)},
      NMND:{sanLuong:item.ref.genTong,csBinhQuan:item.ref.csbqTong,suatHaoThan:item.ref.coalTong,nhietTri:item.ref.nhietTri,shnThucTe:item.ppa.ttChung,shnPPA:item.ppa.ppaChung,chenhLech:difference(item.ppa.clChung,item.ppa.clChungPct),danhGia:assessment(item.ppa.dgChung,null)} };
  };

  const sync = async () => {
    setSyncing(true); setResults([]);
    try {
      const { data } = await apiGet<{rows:SheetDateRow[];sheetUrl:string}>("/api/shn-ppa-sync"); setSheetUrl(data.sheetUrl);
      const days = selected.map((item) => ({ item, row:resolveRow(month,item.day,year,data.rows) }));
      const missing=days.filter((entry)=>!entry.row); const valid=days.filter((entry):entry is {item:MergedDay;row:number}=>Boolean(entry.row));
      if (!valid.length) throw new Error("Không tìm thấy ngày tương ứng trên Google Sheet");
      const response=await apiMutate<SyncResult>("/api/shn-ppa-sync","POST",{days:valid.map(({item,row})=>payloadFor(item,row))});
      setResults([...(response.results ?? []), ...missing.map(({item})=>({date:`${month}/${item.day}/${year}`,row:0,status:"Không tìm thấy ngày trên Google Sheet"}))]);
      toast.success(`Đã gửi đồng bộ ${valid.length} ngày`); setConfirmOpen(false);
    } catch(error) { toast.error(error instanceof Error ? error.message : "Đồng bộ thất bại"); }
    finally { setSyncing(false); }
  };

  const hasDh1=files.some((file)=>file.kind==="dh1"), hasRef=files.some((file)=>file.kind==="ref");
  return <div className="space-y-6 pb-10">
    <PageHeader title="So sánh SHN theo PPA" description="Tổng hợp số liệu DH1, đối chiếu SHN thực tế với PPA và đồng bộ các ngày đã chọn lên Google Sheet." />

    <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
      <Card className="overflow-hidden border-sky-200/70 shadow-sm dark:border-sky-400/20">
        <CardHeader className="bg-gradient-to-r from-sky-50 to-cyan-50/60 dark:from-sky-950/30 dark:to-cyan-950/20"><CardTitle className="flex items-center gap-2"><UploadCloud className="h-5 w-5 text-accent"/>1. Nạp dữ liệu</CardTitle><CardDescription>Chọn cùng lúc hoặc lần lượt hai file Excel nguồn.</CardDescription></CardHeader>
        <CardContent className="pt-6">
          <button type="button" onClick={()=>inputRef.current?.click()} onDragOver={(e)=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={(e)=>{e.preventDefault();setDragging(false);void readFiles(e.dataTransfer.files)}} className={cn("flex min-h-36 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",dragging?"border-accent bg-sky-50 dark:bg-sky-950/30":"border-slate-300 bg-slate-50/60 hover:border-accent/60 hover:bg-sky-50/60 dark:border-slate-700 dark:bg-slate-900/30") }>
            <FileSpreadsheet className="mb-3 h-9 w-9 text-accent"/><span className="font-semibold text-ink">Kéo thả hoặc bấm để chọn file</span><span className="mt-1 text-sm text-muted-foreground">Hỗ trợ .xlsx và .xlsm; file được xử lý ngay trên trình duyệt.</span>
          </button>
          <input ref={inputRef} className="hidden" type="file" multiple accept=".xlsx,.xlsm" onChange={(e)=>e.target.files&&void readFiles(e.target.files)}/>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">{[
            {ok:hasDh1,label:"File SHN PPA / thực tế DH1"},{ok:hasRef,label:"File theo dõi chỉ tiêu PXVH1"}
          ].map((item)=><div key={item.label} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",item.ok?"border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300":"border-slate-200 text-muted-foreground dark:border-slate-700")}>{item.ok?<CheckCircle2 className="h-4 w-4"/>:<AlertCircle className="h-4 w-4"/>}{item.label}</div>)}</div>
          {files.map((file)=><p key={file.name} className="mt-2 truncate text-xs text-muted-foreground">{file.name} — {file.kind==="unknown"?"không nhận diện được cấu trúc":"đã nhận diện"}</p>)}
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>2. Khoảng dữ liệu</CardTitle><CardDescription>Mặc định là ngày hôm qua; có thể chọn lại trước khi xem và đồng bộ.</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-4">
        {[{label:"Tháng",value:month,set:setMonth,min:1,max:12},{label:"Năm",value:year,set:setYear,min:2020,max:2100},{label:"Từ ngày",value:from,set:setFrom,min:1,max:31},{label:"Đến ngày",value:to,set:setTo,min:1,max:31}].map((field)=><div key={field.label}><Label>{field.label}</Label><Input className="mt-1.5" type="number" min={field.min} max={field.max} value={field.value} onChange={(e)=>{field.set(Number(e.target.value));setOverrides({});setResults([])}}/></div>)}
        <div className="col-span-2 rounded-lg bg-slate-50 p-3 text-sm text-muted-foreground dark:bg-slate-900/40"><strong className="text-ink">Nguyên tắc an toàn:</strong> Google Sheet chưa thay đổi ở bước xem trước. Chỉ các ngày được đánh dấu mới được gửi khi bạn xác nhận.</div>
      </CardContent></Card>
    </div>

    {hasDh1 && <>
      <Card><CardHeader className="flex-row items-start justify-between space-y-0"><div><CardTitle>3. Xem trước dữ liệu</CardTitle><CardDescription className="mt-1">{merged.length ? `Tìm thấy ${merged.length} ngày có dữ liệu SHN thực tế.`:"Không có dữ liệu phù hợp trong khoảng ngày đã chọn."}</CardDescription></div><Button disabled={!hasRef||!selected.length} onClick={()=>setConfirmOpen(true)}><RefreshCw/>Đồng bộ {selected.length} ngày</Button></CardHeader>
        {merged.length>0&&<CardContent><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-[#153b65] text-white"><tr><th className="p-3 text-center">Chọn</th><th className="p-3 text-left">Ngày</th><th className="p-3 text-right">SL S1</th><th className="p-3 text-right">SHN TT S1</th><th className="p-3 text-right">PPA S1</th><th className="p-3 text-right">SL S2</th><th className="p-3 text-right">SHN TT S2</th><th className="p-3 text-right">PPA S2</th><th className="p-3 text-right">SHN TT chung</th><th className="p-3 text-right">PPA chung</th><th className="p-3 text-center">Đánh giá</th></tr></thead><tbody>{merged.map((item)=><tr key={item.day} className="border-t hover:bg-muted/50"><td className="p-3 text-center"><Checkbox checked={item.selected} aria-label={`Chọn ngày ${item.day}`} onCheckedChange={(checked)=>setOverrides((current)=>({...current,[item.day]:checked===true}))}/></td><td className="p-3 font-medium">{pad(item.day)}/{pad(month)}/{year}</td><td className="p-3 text-right">{format(item.ref.genS1,2)}</td><td className="p-3 text-right">{format(item.ppa.ttS1,1)}</td><td className="p-3 text-right">{format(item.ppa.ppaS1,1)}</td><td className="p-3 text-right">{format(item.ref.genS2,2)}</td><td className="p-3 text-right">{format(item.ppa.ttS2,1)}</td><td className="p-3 text-right">{format(item.ppa.ppaS2,1)}</td><td className="p-3 text-right font-semibold">{format(item.ppa.ttChung,1)}</td><td className="p-3 text-right">{format(item.ppa.ppaChung,1)}</td><td className="p-3 text-center"><span className={cn("rounded-full px-2 py-1 text-xs font-semibold",item.ppa.dgChung==="Đạt"?"bg-emerald-100 text-emerald-800":"bg-amber-100 text-amber-900")}>{item.ppa.dgChung??"—"}</span></td></tr>)}</tbody></table></div></CardContent>}
      </Card>

      {merged.length>0&&<Card><CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-accent"/>So sánh SHN toàn nhà máy</CardTitle><CardDescription>Đường thực tế và PPA theo từng ngày; bảng dữ liệu phía trên là phương án truy cập thay thế cho biểu đồ.</CardDescription></CardHeader><CardContent><div className="h-80 w-full" role="img" aria-label="Biểu đồ so sánh SHN thực tế và PPA toàn nhà máy"><ResponsiveContainer width="100%" height="100%"><LineChart data={merged.map((item)=>({ngay:`${pad(item.day)}/${pad(month)}`,thucTe:item.ppa.ttChung,ppa:item.ppa.ppaChung}))} margin={{left:5,right:18}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="ngay"/><YAxis domain={["auto","auto"]}/><Tooltip formatter={(value)=>[Number(value).toLocaleString("vi-VN"),""]}/><Legend/><Line type="monotone" dataKey="thucTe" name="SHN thực tế" stroke="#c2410c" strokeWidth={2.5}/><Line type="monotone" dataKey="ppa" name="SHN PPA" stroke="#0369a1" strokeWidth={2.5}/></LineChart></ResponsiveContainer></div></CardContent></Card>}
    </>}

    {results&&results.length>0&&<Card><CardHeader><CardTitle>Kết quả đồng bộ</CardTitle><CardDescription>Kiểm tra từng ngày dưới đây, sau đó mở Google Sheet để đối chiếu.</CardDescription></CardHeader><CardContent className="space-y-2">{results.map((result)=><div key={result.date} className={cn("flex items-center gap-2 rounded-lg border p-3 text-sm",result.status==="ok"?"border-emerald-200 bg-emerald-50 text-emerald-800":"border-red-200 bg-red-50 text-red-800")}>{result.status==="ok"?<CheckCircle2 className="h-4 w-4"/>:<AlertCircle className="h-4 w-4"/>}<span><strong>{result.date}</strong> — {result.status==="ok"?`đã ghi tại hàng ${result.row}`:result.status}</span></div>)}{sheetUrl&&<Button variant="soft" className="mt-3" onClick={()=>window.open(sheetUrl,"_blank","noopener,noreferrer")}><ExternalLink/>Mở Google Sheet để kiểm tra</Button>}</CardContent></Card>}

    <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Xác nhận đồng bộ lên Google Sheet" description={`Bạn sắp cập nhật ${selected.length} ngày (${selected.map((item)=>pad(item.day)).join(", ")}/${pad(month)}/${year}). Dữ liệu hiện có tại các cột tương ứng có thể bị ghi đè.`} confirmLabel="Đồng bộ ngay" destructive={false} loading={syncing} onConfirm={()=>void sync()}>{syncing&&<div className="flex items-center gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-800"><Loader2 className="h-4 w-4 animate-spin"/>Đang đối chiếu ngày và ghi dữ liệu...</div>}</ConfirmDialog>
  </div>;
}
