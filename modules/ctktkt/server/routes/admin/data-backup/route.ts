import { inspectUpload } from "@/lib/upload-guard";
import {getRawDb,readBackupSnapshot} from "@/modules/ctktkt/db";
import {requirePermission} from "@/modules/ctktkt/lib/auth/server";
import {ensureWaterSchema} from "@/modules/ctktkt/lib/water-report/schema";
import {ensureChemicalUsageSchema} from "@/modules/ctktkt/lib/chemical-usage/schema";
import {BACKUP_TABLES,MAX_BACKUP_BYTES,MAX_BACKUP_ROWS,backupRange,backupSchemas,createDataBackup,restoreStatements,validateDataBackup,type BackupRow} from "@/modules/ctktkt/lib/data-backup";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});

async function database(){
  const db=getRawDb();
  await ensureWaterSchema(db);
  await ensureChemicalUsageSchema(db);
  return db;
}

export async function GET(request:Request){
  const guard=await requirePermission("backup_data");
  if(!guard.ok)return guard.response;
  try{
    const url=new URL(request.url);
    const range=backupRange(url.searchParams.get("from"),url.searchParams.get("to"));
    const db=await database(),schemas=await backupSchemas(db);
    const active=BACKUP_TABLES.filter(table=>schemas.get(table.name)?.length);
    const queries=active.map(table=>{
      let where="",args:string[]=[];
      if(range&&table.date){
        where=` WHERE ${table.date} >= ? AND ${table.date} <= ?`;
        args=table.date==="period"?[range.from.slice(0,7),range.to.slice(0,7)+"\uffff"]:[range.from,range.to];
      }
      return {sql:`SELECT * FROM ${table.name}${where} ORDER BY ${table.keys.join(",")} LIMIT ${MAX_BACKUP_ROWS+1}`,args};
    });
    const rows=await readBackupSnapshot(queries);
    const tables=Object.fromEntries(BACKUP_TABLES.map(table=>[table.name,[] as BackupRow[]]));
    active.forEach((table,index)=>{tables[table.name]=rows[index] as BackupRow[];});
    const file=createDataBackup(tables,range);
    return new Response(JSON.stringify(file),{headers:{...headers,"Content-Type":"application/json; charset=utf-8","Content-Disposition":`attachment; filename="ctktkt-backup-${range?range.from+"_"+range.to:"all"}-${file.createdAt.slice(0,10)}.json"`}});
  }catch(error){
    if(error instanceof Error&&/khoảng ngày|dung lượng/i.test(error.message))return json({error:error.message},400);
    return json({error:"Không tải được bản sao lưu. Chưa có dữ liệu nào bị thay đổi; hãy thử lại hoặc chọn khoảng ngày ngắn hơn."},503);
  }
}

async function readBody(request:Request){
  const max=MAX_BACKUP_BYTES+1000;
  if(Number(request.headers.get("content-length")||0)>max)throw new Error("Tệp quá lớn.");
  if(!request.body)throw new Error("Chưa chọn tệp.");
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>max){await reader.cancel();throw new Error("Tệp quá lớn.");}chunks.push(part.value);}
  }finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new Error("Tệp JSON không hợp lệ.");}
}

export async function POST(request:Request){
  const guard=await requirePermission("restore_data");
  if(!guard.ok)return guard.response;
  if(request.headers.get("origin")!==new URL(request.url).origin)return json({error:"Nguồn yêu cầu không hợp lệ."},403);
  let body:{action?:unknown;mode?:unknown;confirmed?:unknown;file?:unknown};
  try{body=await readBody(request);}catch(error){return json({error:error instanceof Error?error.message:"Tệp không hợp lệ."},400);}
  if(!body||!["preview","restore"].includes(String(body.action))||!["missing","overwrite"].includes(String(body.mode)))return json({error:"Thao tác nạp dữ liệu không hợp lệ."},400);
  if(body.action==="restore"&&body.confirmed!==true)return json({error:"Hãy xác nhận trước khi nạp dữ liệu."},400);
  await inspectUpload(Buffer.from(JSON.stringify(body.file ?? null)),{fileName:"sao-luu-ktkt.json"});
  let file;
  try{file=validateDataBackup(body.file);}catch(error){return json({error:error instanceof Error?error.message:"Tệp không hợp lệ."},400);}
  let db;
  try{db=await database();}catch{return json({error:"Chưa kết nối được kho dữ liệu; chưa nạp bản ghi nào."},503);}
  let schemas;
  try{schemas=await backupSchemas(db);}catch{return json({error:"Chưa kiểm tra được cấu trúc kho dữ liệu; chưa nạp bản ghi nào."},503);}
  let statements;
  try{statements=restoreStatements(file,schemas,body.mode as "missing"|"overwrite");}
  catch(error){return json({error:error instanceof Error?error.message:"Cấu trúc tệp không phù hợp."},400);}
  const tables=BACKUP_TABLES.map(table=>({name:table.name,label:table.label,count:file.tables[table.name].length}));
  const total=tables.reduce((sum,table)=>sum+table.count,0);
  if(body.action==="preview")return json({createdAt:file.createdAt,range:file.range,tables,total,checksum:file.checksum});
  try{
    // A single transaction: all restored rows and the audit record commit together.
    const result=await db.batch([...statements,{sql:"INSERT INTO data_restore_audit (actor_id, checksum, mode, row_count) VALUES (?, ?, ?, ?)",args:[guard.user.id,file.checksum,String(body.mode),total]}]);
    const changed=result.slice(0,-1).reduce((sum,item)=>sum+item.meta.changes,0);
    return json({changed,total,message:`Đã nạp ${changed} bản ghi. ${body.mode==="missing"?"Bản ghi đã có được giữ nguyên.":"Các bản ghi trùng khóa đã được cập nhật từ tệp."} Tải lại trang báo cáo để xem số liệu.`});
  }catch{return json({error:"Nạp dữ liệu gặp lỗi hoặc chưa nhận được xác nhận từ máy chủ. Lỗi dữ liệu sẽ hoàn tác toàn bộ giao dịch; nếu mất kết nối, hãy tải bản sao mới để kiểm tra trước khi nạp lại. Giữ lại tệp sao lưu."},503);}
}
