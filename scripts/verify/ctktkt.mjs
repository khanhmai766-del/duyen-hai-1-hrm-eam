// Chỉ chạy với DB/base local. Tạo phiên tạm, đọc API/tệp và hoàn tác các dòng kiểm thử riêng.
import assert from 'node:assert/strict';
import nextEnv from '@next/env';
const {loadEnvConfig}=nextEnv;
import {PrismaClient} from '@prisma/client';
import {encode} from 'next-auth/jwt';
import {randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {ktktUtcNow,ktktWrite} from '../../modules/ctktkt/db/prisma.ts';
import {writeDailyInputs} from '../../modules/ctktkt/lib/daily-input-store.ts';
import {countBackupTables} from '../../modules/ctktkt/lib/data-backup-store.ts';
import {readBackupArchive,archiveSummary} from '../../modules/ctktkt/lib/backup-archive.ts';
loadEnvConfig(process.cwd());
const base=process.env.CTKTKT_VERIFY_BASE||'http://localhost:3030';
// Tháng/ngày có dữ liệu trên DB dev (mặc định 10/2026 như gói backup gốc; DB chỉ có dữ liệu mẫu hợp đồng → CTKTKT_VERIFY_DAY=2026-09-17).
const day=process.env.CTKTKT_VERIFY_DAY||'2026-10-19',period=day.slice(0,7);
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname));
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname));
const prisma=new PrismaClient(),users=[],checks=[];
const marker='CTKTKT-VERIFY:'+randomUUID(),date='1900-01-02';
async function session(role){
 const suffix=randomUUID();
 const user=await prisma.user.create({data:{name:'TEST KTKT (tạm)',employeeId:'TMP-KTKT-'+suffix,email:suffix+'@local.test',passwordHash:'!disabled',role}});users.push(user);
 const token=await encode({token:{sub:user.id,id:user.id,name:user.name,email:user.email,role,employeeId:user.employeeId},secret:process.env.AUTH_SECRET||process.env.NEXTAUTH_SECRET,salt:'authjs.session-token',maxAge:600});
 return {'Cookie':'authjs.session-token='+token+'; pp-admin-mode=on',origin:base};
}
async function json(route,headers,init={}){
 const response=await fetch(base+'/api/ctktkt/'+route,{...init,headers:{...headers,...init.headers}});
 const body=await response.json();assert.equal(response.status,200,route+': '+JSON.stringify(body));assert.equal(body.error,null);assert.ok(body.data);checks.push({route,status:response.status});return body.data;
}
try{
 const admin=await session('ADMIN'),viewer=await session('VIEWER');
 const downloadPage=await fetch(base+'/tien-ich/chi-tieu-ktkt/tien-ich-dong-bo',{headers:admin});assert.equal(downloadPage.status,200);const html=await downloadPage.text();
 for(const name of ['qlkt-sync-extension','nkvh-ppa-extension']){
  assert.ok(html.includes('/ctktkt/'+name+'.zip'),name);
  const response=await fetch(base+'/ctktkt/'+name+'.zip',{headers:admin});assert.equal(response.status,200);
  const zip=await JSZip.loadAsync(await response.arrayBuffer());assert.ok(zip.file('manifest.json'));checks.push({download:name,status:200});
 }

 for(const route of [`daily-inputs?period=${period}`,`ctktkt-report?period=${period}`,`shift-readings?date=${day}`,`operating-events?date=${day}`,`ppa-heat-rate?period=${period}`,`water-report?month=${period}`,`chemical-usage?month=${period}`])await json(route,admin);
 const daily=await json(`daily-inputs?period=${period}`,viewer);assert.ok(daily.entries.length>0);assert.equal(typeof daily.entries[0].operatingDate,'string');
 for(const [route,init] of [['admin/data-backup',{}],['daily-inputs',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}]]){
  const response=await fetch(base+'/api/ctktkt/'+route,{...init,headers:{...viewer,...init.headers}});assert.equal(response.status,403,route);checks.push({route,viewer:403});
 }
 for(const route of [`ctktkt-report/export?period=${period}`,`water-report/export?month=${period}`,`bcsx-export?date=${day}&unit=S1`]){
  const response=await fetch(base+'/api/ctktkt/'+route,{headers:admin});assert.equal(response.status,200,route+': '+(response.headers.get('Content-Type')||''));
  assert.ok(response.headers.get('Content-Disposition')?.includes('.xlsx'));const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));assert.ok(workbook.worksheets.length>0);checks.push({route,sheets:workbook.worksheets.length});
 }
 const zipResponse=await fetch(base+'/api/ctktkt/admin/data-backup/archive',{headers:admin});assert.equal(zipResponse.status,200);
 const bytes=Buffer.from(await zipResponse.arrayBuffer()),summary=archiveSummary(await readBackupArchive(bytes));const expected=(await countBackupTables()).reduce((a,b)=>a+b,0);assert.equal(summary.total,expected);checks.push({archiveRoundTrip:summary.total,files:summary.files});
 const form=new FormData();form.set('file',new File([bytes],'backup.zip',{type:'application/zip'}));form.set('action','preview');form.set('mode','missing');
 const preview=await json('admin/data-backup/archive',admin,{method:'POST',body:form});assert.equal(preview.total,summary.total);
 const actor={id:users[0].id,username:'integration',displayName:'TEST KTKT (tạm)',role:'admin',permissions:[]};
 // Ghi ô + nhật ký sửa ô trong một giao dịch Prisma; lỗi giữa chừng phải hoàn tác cả ô lẫn nhật ký.
 const write=(value,tx)=>writeDailyInputs(tx,actor,'ctktkt-verification',[{kind:'upsert',operatingDate:date,fieldCode:marker,value,note:''}],ktktUtcNow());
 const cell=()=>prisma.ctktktDailyInputs.findUnique({where:{operating_date_field_code:{operating_date:date,field_code:marker}},select:{value:true}});
 const auditCount=()=>prisma.ctktktDailyInputAudit.count({where:{operating_date:date,field_code:marker}});
 await ktktWrite([],tx=>write('0',tx));
 assert.equal((await cell()).value,'0');
 assert.equal(await auditCount(),1);
 await assert.rejects(()=>ktktWrite([],async tx=>{await write('1',tx);throw new Error('hoàn tác thử');}));
 assert.equal((await cell()).value,'0');
 assert.equal(await auditCount(),1);
 checks.push({postgresAudit:'ghi và rollback nguyên tử đạt'});
 console.log(JSON.stringify({checks},null,2));
}finally{
 await prisma.ctktktDailyInputs.deleteMany({where:{operating_date:date,field_code:marker}}).catch(()=>{});
 await prisma.ctktktDailyInputAudit.deleteMany({where:{operating_date:date,field_code:marker}}).catch(()=>{});
 for(const user of users)await prisma.user.delete({where:{id:user.id}}).catch(()=>{});
 await prisma.$disconnect();
 await (await import('../../lib/prisma.ts')).prisma.$disconnect();
}
