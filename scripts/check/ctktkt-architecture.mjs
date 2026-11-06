// Read-only deployment configuration check. Never prints URLs, passwords or tokens.
import {readFileSync,existsSync} from 'node:fs';
import net from 'node:net';
import {Pool} from 'pg';
if(existsSync('.env'))for(const line of readFileSync('.env','utf8').split(/\r?\n/)){const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^(["'])(.*)\1$/,'$2');}
const local=h=>['localhost','127.0.0.1','::1','[::1]','0.0.0.0'].includes(h.toLowerCase());
let failures=0;const report=(ok,label)=>{console.log((ok?'ĐẠT: ':'CẦN KIỂM TRA: ')+label);if(!ok)failures++;};
let app,db,storage;
try{app=new URL(process.env.NEXT_PUBLIC_APP_URL||'');}catch{}
try{db=new URL(process.env.DATABASE_URL||'');}catch{}
try{storage=new URL(process.env.S3_ENDPOINT||'');}catch{}
const preview=app&&local(app.hostname);
console.log(preview?'Môi trường LOCAL — không xác nhận kiến trúc production.':'Kiểm tra cấu hình trên máy đang chạy; không xác nhận danh tính vật lý của server.');
report(Boolean(app&&['http:','https:'].includes(app.protocol)),'Server 1: đã khai báo URL ứng dụng.');
report(Boolean(db&&['postgresql:','postgres:'].includes(db.protocol)),'Server 2: dùng PostgreSQL qua DATABASE_URL.');
if(!preview)report(Boolean(db&&!local(db.hostname)&&db.hostname!==app?.hostname),'Server 2: địa chỉ database tách khỏi địa chỉ ứng dụng (cần đối chiếu máy thực tế).');
if(db){let pool;try{pool=new Pool({connectionString:(()=>{const url=new URL(db);url.searchParams.delete('schema');return url.toString();})(),connectionTimeoutMillis:5000,max:1});const result=await pool.query("SELECT current_setting('server_version') IS NOT NULL AS connected, EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ctktkt_daily_inputs') AS ready");report(result.rows[0]?.connected&&result.rows[0]?.ready,'Server 2: kết nối đọc được và có bảng số liệu KTKT.');}catch{report(false,'Server 2: chưa xác nhận được kết nối/bảng; kiểm tra mạng và quyền database.');}finally{await pool?.end();}}
const configured=Boolean(storage&&storage.hostname!=='s3.example.com'&&process.env.S3_BUCKET&&process.env.S3_ACCESS_KEY&&process.env.S3_SECRET_KEY&&process.env.S3_LOCAL_STORAGE!=='true');
report(configured,'Server 3: cấu hình kho tệp S3 đầy đủ, không ép lưu local.');
if(configured){report(!local(storage.hostname)&&storage.hostname!==app?.hostname,'Server 3: endpoint kho tệp riêng (cần đối chiếu máy thực tế).');const reachable=await new Promise(resolve=>{const socket=net.connect({host:storage.hostname,port:Number(storage.port)||(storage.protocol==='https:'?443:80)});socket.setTimeout(5000);socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('timeout',()=>{socket.destroy();resolve(false);});socket.once('error',()=>resolve(false));});report(reachable,'Server 3: kết nối mạng tới endpoint. Không kiểm tra quyền ghi hoặc dung lượng.');}
console.log('Ảnh OCR: mã ứng dụng không lưu ảnh mới; kết quả số chỉ lưu sau xác nhận.');
console.log('Google Sheets là bản đồng bộ bên ngoài; không thay database hoặc kho tệp.');
process.exitCode=failures?1:0;
