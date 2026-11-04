import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {postgresSql} from '../../modules/ctktkt/db/sql.ts';
import {readBackupArchive,archiveSummary} from '../../modules/ctktkt/lib/backup-archive.ts';
import {BACKUP_TABLES,createDataBackup} from '../../modules/ctktkt/lib/data-backup.ts';
import {mapHostUser} from '../../modules/ctktkt/lib/auth/host-user.ts';
import {CTKTKT_DEFAULT_MATRIX} from '../../modules/ctktkt/permissions.ts';
import {DEFAULT_POSITIONS} from '../../modules/ctktkt/lib/auth/default-positions.ts';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {pathAllowedForPosition} from '../../lib/nav.ts';

test('PostgreSQL giữ literal/comment, thay đúng tham số và bảo toàn alias camelCase',()=>{
 const sql=postgresSql("SELECT value AS operatingDate, '?' AS literal FROM daily_inputs WHERE field_code=? /* ? daily_inputs */ AND value=?");
 assert.equal(sql,"SELECT value AS \"operatingDate\", '?' AS literal FROM \"public\".\"ctktkt_daily_inputs\" WHERE field_code=$1 /* ? daily_inputs */ AND value=$2");
 assert.match(postgresSql('SELECT value AS "operatingDate" FROM "daily_inputs"'),/AS "operatingDate" FROM "public"\."ctktkt_daily_inputs"/);
 assert.match(postgresSql('INSERT OR IGNORE INTO google_mirror_credentials(id,token_hash,token_enc) VALUES(1,?,?)'),/VALUES\(1,\$1,\$2\) ON CONFLICT DO NOTHING$/);
});

const empty=()=>Object.fromEntries(BACKUP_TABLES.map(table=>[table.name,[]]));
const file=()=>createDataBackup({...empty(),daily_inputs:[{id:1,operating_date:'2026-10-19',field_code:'KTKT:TEST',value:'0',note:'',updated_at:'2026-10-19 00:00:00'}]},null);
test('ZIP kiểm checksum từng phần và từ chối khoá trùng xuyên tệp',async()=>{
 const zip=new JSZip();zip.file('part-1.json',JSON.stringify(file()));
 const files=await readBackupArchive(await zip.generateAsync({type:'nodebuffer'}));
 assert.equal(archiveSummary(files).total,1);assert.equal(files[0].tables.daily_inputs[0].value,'0');
 assert.throws(()=>archiveSummary([...files,...files]),/trùng khoá/);
 const damaged=file();damaged.tables.daily_inputs[0].value='999';zip.file('part-1.json',JSON.stringify(damaged));
 await assert.rejects(()=>readBackupArchive(Buffer.from(JSON.stringify(damaged))),/ZIP không hợp lệ/);
 const bytes=await zip.generateAsync({type:'nodebuffer'});
 await assert.rejects(()=>readBackupArchive(bytes),/checksum/);
});
test('ZIP từ chối tệp giải nén vượt mức cho phép',async()=>{
 const zip=new JSZip();zip.file('oversize.json',' '.repeat(3_000_001));
 const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
 await assert.rejects(()=>readBackupArchive(bytes),/dung lượng/);
});

const maps=role=>Object.fromEntries(Object.entries(CTKTKT_DEFAULT_MATRIX).map(([key,value])=>[key,value[role]||'none']));
const host=(position,role='TECHNICIAN')=>({id:'host-user-cuid',name:'Kiểm thử',position,role});
test('25 cương vị chính đã đọc trên production khớp chính sách trong gói KTKT',()=>{
 const names=['ESP','FGD','Khí Nén – Nhà Dầu','Kỹ thuật viên','Lò phó','Lò trưởng','Máy nghiền','Máy phó','Máy trưởng','NH3 - Lò hơi phụ','Phó Quản đốc','Quản đốc','Thải xỉ','Thiết bị đo lường điều khiển','Thống kê','TK Lò máy','Trạm bơm nước thô','Trạm bơm tuần hoàn','Trợ thủ','Trực chính Điện','Trực phụ điện','Trưởng ca','Trưởng kíp điện','XLN hỗn hợp','XLNT'];
 for(const name of names)assert.ok(DEFAULT_POSITIONS.some(position=>position.position===name),name);
});
test('cương vị đang làm việc nhận đúng phạm vi, độc lập vai trò và quyền nghiệp vụ RBAC cũ',()=>{
 const electric=mapHostUser(host('Trưởng kíp điện'),maps('TECHNICIAN'));
 assert.equal(electric.id,'host-user-cuid');assert.ok(electric.permissions.includes('ctktkt_tkd_trend'));
 const water=mapHostUser(host('XLN hỗn hợp'),maps('TECHNICIAN'));
 assert.ok(water.permissions.includes('chemical_HCL_31'));assert.ok(!water.permissions.includes('ctktkt_tkd_trend'));
 assert.ok(mapHostUser(host('Trưởng kíp điện','VIEWER'),maps('VIEWER')).permissions.includes('ctktkt_tkd_trend'));
 assert.ok(mapHostUser(host('Trưởng kíp điện'),{...maps('TECHNICIAN'),'ctktkt:ctktkt_tkd_trend':'none'}).permissions.includes('ctktkt_tkd_trend'));
 assert.equal(mapHostUser({...host('Trưởng kíp điện'),accessMode:'DEFECT_READ_ONLY'},maps('TECHNICIAN')),null);
});

test('Thống kê mở được nhóm KTKT và vẫn giữ giới hạn các nhóm khác',()=>{
 assert.equal(pathAllowedForPosition('/tien-ich/chi-tieu-ktkt','Thống kê'),true);
 assert.equal(pathAllowedForPosition('/tien-ich/chi-tieu-ktkt/tien-ich-dong-bo','Thống kê'),true);
 assert.equal(pathAllowedForPosition('/tien-ich/phan-tich-dau','Thống kê'),false);
});

test('gói tiện ích tải xuống có đúng phiên bản, đủ tệp và cho phép tên miền DH1',async()=>{
 for(const name of ['qlkt-sync-extension','nkvh-ppa-extension']) {
  const root=new URL(`../../public/ctktkt/${name}/`,import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
  const zip=await JSZip.loadAsync(await readFile(new URL(`../../public/ctktkt/${name}.zip`,import.meta.url)));
  assert.deepEqual(JSON.parse(await zip.file('manifest.json').async('string')),manifest);
  for(const file of [manifest.background.service_worker,...manifest.content_scripts.flatMap(script=>script.js),...(manifest.action?.default_popup?[manifest.action.default_popup]:[])])assert.ok(zip.file(file),file);
  assert.ok(manifest.host_permissions.includes('https://duyenhai1.vn/*'));
  assert.ok(manifest.host_permissions.includes('https://ctktkt.duyenhai1.vn/*'));
 }
});

test('cầu nối QLKT và NKVH khởi tạo đúng trên đường dẫn KTKT đã tích hợp',async()=>{
 for(const [name,path] of [['qlkt-sync-extension','/ctktkt-report'],['nkvh-ppa-extension','/ppa-heat-rate']]){
  const handlers=[];
  const location={pathname:'/tien-ich/chi-tieu-ktkt'+path,origin:'https://duyenhai1.vn'};
  const window={location,addEventListener:(_event,fn)=>handlers.push(fn),postMessage:()=>{}};
  const context={window,location,chrome:{runtime:{getManifest:()=>({version:'1.0.0'}),onMessage:{addListener:()=>{}}}}};
  vm.runInNewContext(await readFile(new URL(`../../public/ctktkt/${name}/web-bridge.js`,import.meta.url),'utf8'),context);
  assert.ok(handlers.length>0,name);
 }
});
