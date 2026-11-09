// Chỉ local: đọc API tích hợp với DB thật (bộ đọc Prisma); kiểm 4 API máy không qua cookie.
// Dọn ảnh hết hạn: tests/ctktkt/coal-photo-db.test.mjs (DB thật).
import assert from 'node:assert/strict';
import nextEnv from '@next/env';
import {createHash,randomBytes} from 'node:crypto';
import {readOperatingData} from '../../modules/ctktkt/lib/operating-data-api.ts';
import {prisma} from '../../lib/prisma.ts';
nextEnv.loadEnvConfig(process.cwd());
const base=process.env.CTKTKT_VERIFY_BASE||'http://localhost:3030';
for(const url of [base,process.env.DATABASE_URL]) assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname),'Chỉ kiểm local');
const key=randomBytes(32).toString('base64url'),expectedHash=createHash('sha256').update(key).digest('hex');
// Tháng có dữ liệu trên DB dev (mặc định 10/2026; DB chỉ có dữ liệu mẫu hợp đồng → CTKTKT_VERIFY_DAY=2026-09-17).
const day=process.env.CTKTKT_VERIFY_DAY||'2026-10-19',period=day.slice(0,7);
const checks=[];
try {
 for(const dataset of ['pmis','ppa']) {
  const request=new Request(base+`/api/ctktkt/integration/v1/operating-data?period=${period}&dataset=${dataset}`,{headers:{authorization:'Bearer '+key}});
  const response=await readOperatingData(request,{expectedHash,today:'2026-11-04'});
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.dataset,dataset);assert.ok(body.entries.length>0);
  assert.ok(body.entries.every(row=>row.operatingDate.startsWith(period+'-')));
  checks.push({postgresDataset:dataset,entries:body.entries.length});
 }
 // Không có cookie: khóa sai phải đến handler và trả 401, không redirect sang login.
 for(const [path,method] of [[`integration/v1/operating-data?period=${period}&dataset=pmis`,'GET'],['cron/coal-photos','GET'],['google-mirror/snapshot','GET'],['google-mirror/status','POST']]) {
  const response=await fetch(base+'/api/ctktkt/'+path,{method,redirect:'manual',headers:{authorization:'Bearer invalid-local-test-key'}});
  assert.equal(response.status,401,path);assert.equal(response.headers.get('location'),null);
  const body=await response.json();assert.equal(typeof body.error,'string');checks.push({withoutCookie:path,status:401});
 }
 const guarded=await fetch(base+`/api/ctktkt/daily-inputs?period=${period}`,{redirect:'manual'});
 assert.equal(guarded.status,307);assert.ok(guarded.headers.get('location').includes('/login'));

 console.log(JSON.stringify({checks},null,2));
} finally { await prisma.$disconnect(); }
