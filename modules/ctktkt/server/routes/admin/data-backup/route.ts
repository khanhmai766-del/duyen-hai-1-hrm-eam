import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { ok, fail } from "@/lib/api";
import { inspectUpload } from "@/lib/upload-guard";
import {requirePermission} from "@/modules/ctktkt/lib/auth/server";
import {BACKUP_TABLES,MAX_BACKUP_BYTES,MAX_BACKUP_ROWS,backupRange,createDataBackup,restoreStatements,validateDataBackup,type BackupRow} from "@/modules/ctktkt/lib/data-backup";
import {loadBackupSchemas,readBackupTables,restoreBackup} from "@/modules/ctktkt/lib/data-backup-store";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
// Lỗi ({error}) → fail(), còn lại → ok() — phong bì chung của web.
const json=(body:unknown,status=200)=>{
  const response=body&&typeof body==="object"&&"error" in body?fail(String((body as {error:unknown}).error),status):ok(body);
  for(const [name,value] of Object.entries(headers))response.headers.set(name,value);
  return response;
};

export async function GET(request:Request){
  const guard=await requirePermission("backup_data");
  if(!guard.ok)return guard.response;
  try{
    const url=new URL(request.url);
    const range=backupRange(url.searchParams.get("from"),url.searchParams.get("to"));
    const schemas=await loadBackupSchemas();
    const active=BACKUP_TABLES.filter(table=>schemas.get(table.name)?.length);
    // Một ảnh chụp nhất quán của các bảng (theo khoảng ngày nếu có), sắp theo khoá.
    const rows=await readBackupTables(active,range,MAX_BACKUP_ROWS+1);
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
  if (!isCtktktSameOrigin(request, true))return json({error:"Nguồn yêu cầu không hợp lệ."},403);
  let body:{action?:unknown;mode?:unknown;confirmed?:unknown;file?:unknown};
  try{body=await readBody(request);}catch(error){return json({error:error instanceof Error?error.message:"Tệp không hợp lệ."},400);}
  if(!body||!["preview","restore"].includes(String(body.action))||!["missing","overwrite"].includes(String(body.mode)))return json({error:"Thao tác nạp dữ liệu không hợp lệ."},400);
  if(body.action==="restore"&&body.confirmed!==true)return json({error:"Hãy xác nhận trước khi nạp dữ liệu."},400);
  await inspectUpload(Buffer.from(JSON.stringify(body.file ?? null)),{fileName:"sao-luu-ktkt.json"});
  let file;
  try{file=validateDataBackup(body.file);}catch(error){return json({error:error instanceof Error?error.message:"Tệp không hợp lệ."},400);}
  if(body.action==="restore"&&guard.user.role!=="admin"&&(file.tables.daily_inputs||[]).some(row=>String(row.field_code||"").startsWith("KTKT:")))return json({error:"Chỉ tài khoản quản trị được nạp bản sao lưu chứa số liệu Báo cáo KTKT. Người nhập phải gửi yêu cầu chỉnh sửa để duyệt."},403);
  let schemas;
  try{schemas=await loadBackupSchemas();}catch{return json({error:"Chưa kiểm tra được cấu trúc kho dữ liệu; chưa nạp bản ghi nào."},503);}
  let statements;
  try{statements=restoreStatements(file,schemas,body.mode as "missing"|"overwrite");}
  catch(error){return json({error:error instanceof Error?error.message:"Cấu trúc tệp không phù hợp."},400);}
  const tables=BACKUP_TABLES.map(table=>({name:table.name,label:table.label,count:file.tables[table.name].length}));
  const total=tables.reduce((sum,table)=>sum+table.count,0);
  if(body.action==="preview")return json({createdAt:file.createdAt,range:file.range,tables,total,checksum:file.checksum});
  try{
    // A single transaction: all restored rows and the audit record commit together.
    const changed=await restoreBackup(statements,{actorId:String(guard.user.id),checksum:file.checksum,mode:String(body.mode),rowCount:total});
    return json({changed,total,message:`Đã nạp ${changed} bản ghi. ${body.mode==="missing"?"Bản ghi đã có được giữ nguyên.":"Các bản ghi trùng khóa đã được cập nhật từ tệp."} Tải lại trang báo cáo để xem số liệu.`});
  }catch{return json({error:"Nạp dữ liệu gặp lỗi hoặc chưa nhận được xác nhận từ máy chủ. Lỗi dữ liệu sẽ hoàn tác toàn bộ giao dịch; nếu mất kết nối, hãy tải bản sao mới để kiểm tra trước khi nạp lại. Giữ lại tệp sao lưu."},503);}
}
