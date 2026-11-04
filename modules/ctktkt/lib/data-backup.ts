import {createHash} from "node:crypto";

// Deliberate allowlist: operating data only, never accounts, API keys or expired photos.
export const BACKUP_TABLES = [
  {name:"daily_inputs",label:"KTKT / PMIS và dữ liệu ngày",date:"operating_date",keys:["operating_date","field_code"]},
  {name:"shift_readings",label:"Thông số nửa giờ BCSX",date:"operating_date",keys:["operating_date","unit","time_slot","metric"]},
  {name:"operating_events",label:"Sự kiện vận hành",date:"operating_date",keys:["id"]},
  {name:"ppa_heat_rate_daily",label:"Suất hao nhiệt PPA",date:"operating_date",keys:["operating_date"]},
  {name:"water_shift_logs",label:"Công tơ nước và hiệu chỉnh",date:"log_date",keys:["log_date","shift_time"]},
  {name:"chemical_usage_logs",label:"Sử dụng hóa chất",date:"usage_date",keys:["id"]},
  {name:"measurements",label:"Chỉ tiêu theo kỳ",date:"period",keys:["id"]},
  {name:"water_shift_leaders",label:"Danh sách trưởng ca",date:null,keys:["name"]},
] as const;
export const MAX_BACKUP_BYTES = 3_000_000;
export const MAX_BACKUP_ROWS = 12000;
export type BackupRow = Record<string,string|number|null>;
export type BackupRange = {from:string;to:string}|null;
export type DataBackup = {format:"ctktkt-operating-backup";version:1;createdAt:string;range:BackupRange;tables:Record<string,BackupRow[]>;checksum:string};
export type BackupColumn = {name:string;type:string;notnull:number;dflt_value:unknown;pk:number};
export type BackupDb = {
  prepare:(sql:string)=>{all:()=>Promise<{results:Record<string,unknown>[]}>};
  batch:(statements:Array<{sql:string;args:(string|number|null)[]}>)=>Promise<Array<{meta:{changes:number}}>>;
};

export function validBackupDate(value:unknown):value is string {
  return typeof value==="string" && /^20\d{2}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value+"T12:00:00Z")) && new Date(value+"T12:00:00Z").toISOString().slice(0,10)===value;
}
export function backupRange(from:unknown,to:unknown):BackupRange {
  if(from===null&&to===null)return null;
  if(!validBackupDate(from)||!validBackupDate(to)||from>to)throw new Error("Khoảng ngày sao lưu không hợp lệ.");
  return {from,to};
}
function checksum(data:Omit<DataBackup,"checksum">) {return createHash("sha256").update(JSON.stringify(data)).digest("hex");}
export function createDataBackup(tables:DataBackup["tables"],range:BackupRange):DataBackup {
  const data={format:"ctktkt-operating-backup" as const,version:1 as const,createdAt:new Date().toISOString(),range,tables};
  const file={...data,checksum:checksum(data)};
  if(Buffer.byteLength(JSON.stringify(file))>MAX_BACKUP_BYTES || Object.values(tables).reduce((sum,rows)=>sum+rows.length,0)>MAX_BACKUP_ROWS)
    throw new Error("Dữ liệu vượt dung lượng một tệp. Chọn khoảng ngày ngắn hơn, ví dụ từng tháng, rồi tải riêng từng tệp.");
  return file;
}
export function validateDataBackup(value:unknown):DataBackup {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Tệp sao lưu không hợp lệ.");
  const file=value as DataBackup;
  if(file.format!=="ctktkt-operating-backup"||file.version!==1||typeof file.createdAt!=="string"||!Number.isFinite(Date.parse(file.createdAt)))throw new Error("Tệp không đúng định dạng sao lưu của web.");
  if(!file.tables||typeof file.tables!=="object"||Array.isArray(file.tables))throw new Error("Thiếu các bảng dữ liệu.");
  if(file.range!==null)backupRange(file.range?.from,file.range?.to);
  const names=BACKUP_TABLES.map(table=>table.name as string);
  if(Object.keys(file.tables).length!==names.length||Object.keys(file.tables).some(name=>!names.includes(name)))throw new Error("Danh sách bảng không khớp bản sao lưu.");
  let count=0;
  for(const table of BACKUP_TABLES){
    const rows=file.tables[table.name].map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,["entered_by_user_id","updated_by_user_id","deleted_by_user_id"].includes(key)&&typeof value==="number"?String(value):value])));
    if(!Array.isArray(rows))throw new Error("Bảng sao lưu không hợp lệ.");
    count+=rows.length;
    const keys=new Set<string>();
    for(const row of rows){
      if(!row||typeof row!=="object"||Array.isArray(row)||Object.keys(row).length>80)throw new Error("Dòng dữ liệu không hợp lệ.");
      for(const v of Object.values(row))if(v!==null&&typeof v!=="string"&&(typeof v!=="number"||!Number.isFinite(v)))throw new Error("Ô dữ liệu không hợp lệ.");
      if(table.keys.some(key=>row[key]===null||row[key]===undefined||row[key]===""))throw new Error("Thiếu khóa nhận diện bản ghi.");
      const key=JSON.stringify(table.keys.map(key=>row[key]));
      if(keys.has(key))throw new Error("Tệp có bản ghi trùng lặp.");
      keys.add(key);
      if(table.date&&table.date!=="period"){
        const date=row[table.date];
        if(!validBackupDate(date)||(file.range&&(date<file.range.from||date>file.range.to)))throw new Error("Ngày trong bản ghi không khớp khoảng sao lưu.");
      }
    }
  }
  if(count>MAX_BACKUP_ROWS||Buffer.byteLength(JSON.stringify(file))>MAX_BACKUP_BYTES)throw new Error("Tệp quá lớn; hãy chia khoảng ngày sao lưu.");
  const data={format:file.format,version:file.version,createdAt:file.createdAt,range:file.range,tables:file.tables};
  if(typeof file.checksum!=="string"||file.checksum!==checksum(data))throw new Error("Tệp đã bị thay đổi hoặc bị hỏng. Hãy chọn bản sao lưu nguyên gốc.");
  return file;
}

/** Schema names come only from PRAGMA on allowlisted tables, never from SQL in a file. */
export async function backupSchemas(db:BackupDb){
  const schemas=new Map<string,BackupColumn[]>();
  for(const table of BACKUP_TABLES){
    const {results}=await db.prepare(`PRAGMA table_info(${table.name})`).all();
    schemas.set(table.name,results as BackupColumn[]);
  }
  return schemas;
}

export function restoreStatements(file:DataBackup,schemas:Map<string,BackupColumn[]>,mode:"missing"|"overwrite"){
  const statements:Array<{sql:string;args:(string|number|null)[]}>=[];
  for(const table of BACKUP_TABLES){
    const schema=schemas.get(table.name)||[],rows=file.tables[table.name].map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,["entered_by_user_id","updated_by_user_id","deleted_by_user_id"].includes(key)&&typeof value==="number"?String(value):value])));
    if(!schema.length){if(rows.length)throw new Error(`Bảng ${table.label} chưa sẵn sàng trên máy chủ.`);continue;}
    const allowed=new Map(schema.map(column=>[column.name,column]));
    const groups=new Map<string,{columns:string[];rows:BackupRow[]}>();
    for(const row of rows){
      for(const [name,value] of Object.entries(row)){
        const column=allowed.get(name);
        if(!column)throw new Error(`Tệp có cột chưa được hỗ trợ: ${table.name}.${name}.`);
        if(value===null&&column.notnull)throw new Error(`Ô bắt buộc bị trống: ${table.name}.${name}.`);
        if(value!==null&&/INT|REAL|NUM|FLOAT|DOUBLE/i.test(column.type)&&(typeof value!=="number"||!Number.isFinite(value)||(/INT/i.test(column.type)&&!Number.isSafeInteger(value))))throw new Error(`Kiểu số không hợp lệ: ${table.name}.${name}.`);
        if(value!==null&&/TEXT/i.test(column.type)&&typeof value!=="string")throw new Error(`Kiểu chữ không hợp lệ: ${table.name}.${name}.`);
      }
      for(const col of schema)if(col.notnull&&!col.pk&&col.dflt_value===null&&!(col.name in row))throw new Error(`Thiếu cột bắt buộc: ${table.name}.${col.name}.`);
      // Natural keys preserve the destination row ID. Event/chemical/measurement IDs are part of their identity.
      const columns=schema.map(col=>col.name).filter(name=>name in row&&(name!=="id"||(table.keys as readonly string[]).includes("id")));
      const key=columns.join(",");
      if(!groups.has(key))groups.set(key,{columns,rows:[]});
      groups.get(key)!.rows.push(row);
    }
    for(const {columns,rows:group} of groups.values()){
      const update=columns.filter(name=>!(table.keys as readonly string[]).includes(name));
      const conflict=mode==="overwrite"&&update.length?`ON CONFLICT (${table.keys.join(",")}) DO UPDATE SET ${update.map(name=>`${name}=excluded.${name}`).join(",")}`:"ON CONFLICT DO NOTHING";
      for(let i=0;i<group.length;i+=50){
        const chunk=group.slice(i,i+50);
        statements.push({sql:`INSERT INTO ${table.name} (${columns.join(",")}) VALUES ${chunk.map(()=>`(${columns.map(()=>"?").join(",")})`).join(",")} ${conflict}`,args:chunk.flatMap(row=>columns.map(name=>row[name]))});
      }
    }
  }
  return statements;
}
