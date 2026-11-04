// Chỉ local: đọc API tích hợp với DB thật; kiểm cleanup trên bảng TEMP riêng.
import assert from 'node:assert/strict';
import nextEnv from '@next/env';
import {createHash,randomBytes} from 'node:crypto';
import {getRawDb,getPool} from '../../modules/ctktkt/db/index.ts';
import {postgresSql} from '../../modules/ctktkt/db/sql.ts';
import {readOperatingData} from '../../modules/ctktkt/lib/operating-data-api.ts';
import {cleanupCoalPhotos} from '../../modules/ctktkt/lib/coal-photo-cleanup.ts';
nextEnv.loadEnvConfig(process.cwd());
const base=process.env.CTKTKT_VERIFY_BASE||'http://localhost:3030';
for(const url of [base,process.env.DATABASE_URL]) assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname),'Chỉ kiểm local');
const key=randomBytes(32).toString('base64url'),expectedHash=createHash('sha256').update(key).digest('hex');
const checks=[];
try {
 for(const dataset of ['pmis','ppa']) {
  const request=new Request(base+`/api/ctktkt/integration/v1/operating-data?period=2026-10&dataset=${dataset}`,{headers:{authorization:'Bearer '+key}});
  const response=await readOperatingData(request,{getDb:getRawDb,expectedHash,today:'2026-11-04'});
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.dataset,dataset);assert.ok(body.entries.length>0);
  assert.ok(body.entries.every(row=>row.operatingDate.startsWith('2026-10-')));
  checks.push({postgresDataset:dataset,entries:body.entries.length});
 }
 // Không có cookie: khóa sai phải đến handler và trả 401, không redirect sang login.
 for(const [path,method] of [['integration/v1/operating-data?period=2026-10&dataset=pmis','GET'],['cron/coal-photos','GET'],['google-mirror/snapshot','GET'],['google-mirror/status','POST']]) {
  const response=await fetch(base+'/api/ctktkt/'+path,{method,redirect:'manual',headers:{authorization:'Bearer invalid-local-test-key'}});
  assert.equal(response.status,401,path);assert.equal(response.headers.get('location'),null);
  const body=await response.json();assert.equal(typeof body.error,'string');checks.push({withoutCookie:path,status:401});
 }
 const guarded=await fetch(base+'/api/ctktkt/daily-inputs?period=2026-10',{redirect:'manual'});
 assert.equal(guarded.status,307);assert.ok(guarded.headers.get('location').includes('/login'));

 const client=await getPool().connect();
 try {
  await client.query('BEGIN');
  // TEMP + ON COMMIT DROP: không tạo/sửa/xóa ảnh thực trong public.
  await client.query('CREATE TEMP TABLE ctktkt_coal_meter_photos(id text,expires_at bigint) ON COMMIT DROP');
  await client.query('CREATE TEMP TABLE ctktkt_coal_photo_usage(owner_id text,bucket bigint) ON COMMIT DROP');
  const now=Date.parse('2026-11-04T00:00:00Z'),bucket=Math.floor(now/3600000);
  await client.query("INSERT INTO pg_temp.ctktkt_coal_meter_photos VALUES('old',$1),('boundary',$2),('keep',$3)",[now-1,now,now+1]);
  await client.query("INSERT INTO pg_temp.ctktkt_coal_photo_usage VALUES('old',$1),('boundary',$2),('keep',$3)",[bucket-25,bucket-24,bucket]);
  const tempDb={
   prepare:sql=>({bind:(...args)=>({sql,args})}),
   batch:async statements=>{
    const result=[];
    for(const {sql,args} of statements) {
     const query=postgresSql(sql).replaceAll('"public".','pg_temp.');
     assert.match(query,/^DELETE FROM pg_temp\."ctktkt_coal_(meter_photos|photo_usage)" WHERE /);
     const output=await client.query(query,args);result.push({meta:{changes:output.rowCount}});
    }
    return result;
   },
  };
  assert.deepEqual(await cleanupCoalPhotos(now,tempDb),{photos:2,usageBuckets:1});
  assert.deepEqual((await client.query('SELECT id FROM pg_temp.ctktkt_coal_meter_photos')).rows,[{id:'keep'}]);
  assert.deepEqual((await client.query('SELECT owner_id FROM pg_temp.ctktkt_coal_photo_usage ORDER BY owner_id')).rows,[{owner_id:'boundary'},{owner_id:'keep'}]);
  assert.deepEqual(await cleanupCoalPhotos(now,tempDb),{photos:0,usageBuckets:0});
  checks.push({cleanup:'đúng hạn ảnh/bucket, giữ dòng còn hạn; chạy lại không xóa thêm'});
 } finally { await client.query('ROLLBACK');client.release(); }
 console.log(JSON.stringify({checks},null,2));
} finally { await getPool().end(); }
