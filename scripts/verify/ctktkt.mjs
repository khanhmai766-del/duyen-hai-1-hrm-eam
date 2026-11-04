// Chỉ chạy với DB/base local. Tạo phiên tạm, đọc API/tệp và hoàn tác các dòng kiểm thử riêng.
import assert from 'node:assert/strict';
import nextEnv from '@next/env';
const {loadEnvConfig}=nextEnv;
import {PrismaClient} from '@prisma/client';
import {encode} from 'next-auth/jwt';
import {randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {getPool,getRawDb} from '../../modules/ctktkt/db/index.ts';
import {auditedDailyBatch} from '../../modules/ctktkt/lib/daily-input-audit.ts';
import {readBackupArchive,archiveSummary} from '../../modules/ctktkt/lib/backup-archive.ts';
loadEnvConfig(process.cwd());
const base=process.env.CTKTKT_VERIFY_BASE||'http://localhost:3030';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname));
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname));
const prisma=new PrismaClient(),users=[],checks=[];
const db=getRawDb(),marker='CTKTKT-VERIFY:'+randomUUID(),date='1900-01-02';
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

 for(const route of ['daily-inputs?period=2026-10','ctktkt-report?period=2026-10','shift-readings?date=2026-10-19','operating-events?date=2026-10-19','ppa-heat-rate?period=2026-10','water-report?month=2026-10','chemical-usage?month=2026-10','measurements?period=2026-10'])await json(route,admin);
 const daily=await json('daily-inputs?period=2026-10',viewer);assert.ok(daily.entries.length>0);assert.equal(typeof daily.entries[0].operatingDate,'string');
 for(const [route,init] of [['admin/data-backup',{}],['daily-inputs',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}]]){
  const response=await fetch(base+'/api/ctktkt/'+route,{...init,headers:{...viewer,...init.headers}});assert.equal(response.status,403,route);checks.push({route,viewer:403});
 }
 for(const route of ['ctktkt-report/export?period=2026-10','water-report/export?month=2026-10','bcsx-export?date=2026-10-19&unit=S1']){
  const response=await fetch(base+'/api/ctktkt/'+route,{headers:admin});assert.equal(response.status,200,route+': '+(response.headers.get('Content-Type')||''));
  assert.ok(response.headers.get('Content-Disposition')?.includes('.xlsx'));const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));assert.ok(workbook.worksheets.length>0);checks.push({route,sheets:workbook.worksheets.length});
 }
 const zipResponse=await fetch(base+'/api/ctktkt/admin/data-backup/archive',{headers:admin});assert.equal(zipResponse.status,200);
 const bytes=Buffer.from(await zipResponse.arrayBuffer()),summary=archiveSummary(await readBackupArchive(bytes));const expected=(await Promise.all(["daily_inputs","shift_readings","operating_events","ppa_heat_rate_daily","water_shift_logs","chemical_usage_logs","measurements","water_shift_leaders"].map(async table=>Number((await db.prepare(`SELECT count(*) AS count FROM ${table}`).first()).count)))).reduce((a,b)=>a+b,0);assert.equal(summary.total,expected);checks.push({archiveRoundTrip:summary.total,files:summary.files});
 const form=new FormData();form.set('file',new File([bytes],'backup.zip',{type:'application/zip'}));form.set('action','preview');form.set('mode','missing');
 const preview=await json('admin/data-backup/archive',admin,{method:'POST',body:form});assert.equal(preview.total,summary.total);
 const actor={id:users[0].id,username:'integration',displayName:'TEST KTKT (tạm)',role:'admin',permissions:[]};
 const insert=value=>db.prepare("INSERT INTO daily_inputs(operating_date,field_code,value,note) VALUES(?,?,?,'') ON CONFLICT(operating_date,field_code) DO UPDATE SET value=excluded.value").bind(date,marker,value);
 await auditedDailyBatch(db,actor,'ctktkt-verification',[insert('0')]);
 assert.equal((await db.prepare('SELECT value FROM daily_inputs WHERE operating_date=? AND field_code=?').bind(date,marker).first()).value,'0');
 assert.equal((await db.prepare('SELECT count(*) AS count FROM daily_input_audit WHERE operating_date=? AND field_code=?').bind(date,marker).first()).count,1);
 await assert.rejects(()=>auditedDailyBatch(db,actor,'ctktkt-verification',[insert('1'),db.prepare('INSERT INTO daily_inputs(operating_date,field_code,value) VALUES(?,?,NULL)').bind(date,marker+'-bad')]));
 assert.equal((await db.prepare('SELECT value FROM daily_inputs WHERE operating_date=? AND field_code=?').bind(date,marker).first()).value,'0');
 assert.equal((await db.prepare('SELECT count(*) AS count FROM daily_input_audit WHERE operating_date=? AND field_code=?').bind(date,marker).first()).count,1);
 checks.push({postgresAudit:'ghi và rollback nguyên tử đạt'});
 console.log(JSON.stringify({checks},null,2));
}finally{
 await db.batch([db.prepare('DELETE FROM daily_inputs WHERE operating_date=? AND field_code IN (?,?)').bind(date,marker,marker+'-bad'),db.prepare('DELETE FROM daily_input_audit WHERE operating_date=? AND field_code IN (?,?)').bind(date,marker,marker+'-bad')]).catch(()=>{});
 for(const user of users)await prisma.user.delete({where:{id:user.id}}).catch(()=>{});
 await prisma.$disconnect();await getPool().end();
}
