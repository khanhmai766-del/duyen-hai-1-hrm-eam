// Chỉ local: tài khoản tạm và cấu hình bổ sung cho cương vị kiểm thử; hoàn tác bằng CAS.
import assert from 'node:assert/strict';
import nextEnv from '@next/env';
import {PrismaClient} from '@prisma/client';
import {encode} from 'next-auth/jwt';
import {randomUUID} from 'node:crypto';
nextEnv.loadEnvConfig(process.cwd());
const base=process.env.CTKTKT_VERIFY_BASE||'http://localhost:3030';
for(const url of [base,process.env.DATABASE_URL])assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname),'Chỉ kiểm tra local');
const db=new PrismaClient(),users=[],checks=[],key='ctktkt-position-permissions';
const rows=await db.$queryRawUnsafe('SELECT * FROM "RbacConfig" WHERE key=$1',key),before=rows[0]||null;
let lastWritten=null;
async function account(position,role='VIEWER') {
 const tag=randomUUID();
 const user=await db.user.create({data:{name:'TEST phân quyền KTKT (tạm)',employeeId:'TMP-PERM-'+tag,email:tag+'@local.test',passwordHash:'!disabled',role,position}});users.push(user);
 const token=await encode({token:{sub:user.id,id:user.id,role,name:user.name},secret:process.env.AUTH_SECRET||process.env.NEXTAUTH_SECRET,salt:'authjs.session-token',maxAge:600});
 return {Cookie:'authjs.session-token='+token+'; pp-admin-mode=on',origin:base};
}
async function call(path,headers,status,body,extra={}) {
 const response=await fetch(base+'/api/ctktkt/'+path,{method:body===undefined?'GET':'PUT',headers:{...headers,...(body===undefined?{}:{'content-type':'application/json'}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual'});
 assert.equal(response.status,status,path+': '+await response.clone().text());checks.push({path,status});
 return response;
}
async function save(headers,grants,version,status=200) {
 const response=await call('permissions',headers,status,{grants,expectedVersion:version});
 const body=await response.json();
 if(status===200){assert.equal(body.error,null);lastWritten=JSON.stringify(body.data);return body.data;}
 return body;
}
try {
 const tag=randomUUID().slice(0,8),backupPosition='TEST sao lưu KTKT '+tag,configPosition='TEST cấu hình KTKT '+tag,restorePosition='TEST nạp KTKT '+tag,historyPosition='TEST nhật ký KTKT '+tag;
 const admin=await account('Thiết bị đo lường điều khiển','ADMIN'),operator=await account('Máy nghiền'),leader=await account('Quản đốc'),backup=await account(backupPosition),configurer=await account(configPosition),restore=await account(restorePosition),history=await account(historyPosition);
 const initial=(await (await call('permissions',admin,200)).json()).data;assert.equal(initial.schemaVersion,1);assert.ok(initial.positions.includes('Máy nghiền'));
 await call('permissions',operator,403);await call('permissions',leader,200);
 await call('permissions',admin,400,{});
 await call('permissions',admin,403,{expectedVersion:initial.version,grants:initial.grants},{origin:'https://invalid.local'});
 const grants=structuredClone(initial.grants);grants.backup_data.push(backupPosition);grants.manage_permissions.push(configPosition);grants.restore_data.push(restorePosition);grants.view_data_history.push(historyPosition);
 const first=await save(admin,grants,initial.version);assert.equal(first.version,initial.version+1);
 const downloaded=await call('admin/data-backup?from=2000-01-01&to=2000-01-01',backup,200);assert.match(downloaded.headers.get('content-disposition'),/attachment/);
 const file=await downloaded.json();
 const preview=await fetch(base+'/api/ctktkt/admin/data-backup',{method:'POST',headers:{...restore,'content-type':'application/json'},body:JSON.stringify({action:'preview',mode:'missing',file})});assert.equal(preview.status,200);checks.push({restoreOnlyPreview:200});
 await call('admin/data-backup',restore,403);await call('permissions',restore,403);
 for(const [headers,showBackup,showRestore] of [[backup,true,false],[restore,false,true]]) {
  const response=await fetch(base+'/tien-ich/chi-tieu-ktkt/admin/data-backup',{headers,redirect:'manual'});assert.equal(response.status,200);const html=await response.text();
  assert.equal(html.includes('id="sao-luu"'),showBackup);assert.equal(html.includes('id="nap-du-lieu"'),showRestore);
 }
 const historyPage=await fetch(base+'/tien-ich/chi-tieu-ktkt/admin/data-history',{headers:history,redirect:'manual'});assert.equal(historyPage.status,200);
 await call('admin/data-backup',history,403);await call('permissions',history,403);
 for(const path of ['admin/data-backup','admin/data-backup/archive']) {
  const response=await fetch(base+'/api/ctktkt/'+path,{method:'POST',headers:{...backup,'content-type':'application/json'},body:'{}'});assert.equal(response.status,403);checks.push({path,restoreWithBackupOnly:403});
 }
 await call('permissions',backup,403);await call('permissions',configurer,200);await call('admin/data-backup',configurer,403);
 const stale=await save(admin,initial.grants,initial.version,409);assert.match(stale.error,/người khác/);
 const revoke=structuredClone(first.grants);revoke.backup_data=revoke.backup_data.filter(p=>p!==backupPosition);
 const second=await save(configurer,revoke,first.version);assert.equal(second.version,first.version+1);
 await call('admin/data-backup',backup,403);
 checks.push({scope:'VHV VIEWER dùng quyền cương vị; quản trị KTKT mặc định cho Quản đốc; ủy quyền và thu hồi có hiệu lực ngay'});
 console.log(JSON.stringify({checks},null,2));
} finally {
 if(lastWritten!==null) {
  const changed=before
   ?await db.$executeRawUnsafe('UPDATE "RbacConfig" SET value=$1,"updatedById"=$2,"updatedAt"=$3 WHERE key=$4 AND value=$5',before.value,before.updatedById,before.updatedAt,key,lastWritten)
   :await db.$executeRawUnsafe('DELETE FROM "RbacConfig" WHERE key=$1 AND value=$2',key,lastWritten);
  assert.equal(changed,1,'Cấu hình đã đổi ngoài phiên kiểm thử; không tự ghi đè.');
 }
 const ids=users.map(u=>u.id);
 await db.auditLog.deleteMany({where:{userId:{in:ids}}});
 await db.systemAuditLog.deleteMany({where:{actorUserId:{in:ids}}});
 for(const user of users)await db.user.delete({where:{id:user.id}});
 await db.$disconnect();
 console.log('Đã hoàn tác cấu hình kiểm thử và dọn tài khoản tạm.');
}
