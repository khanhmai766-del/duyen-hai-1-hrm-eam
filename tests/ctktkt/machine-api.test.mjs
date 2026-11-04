import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {integrationAuthorized,integrationPeriod} from '../../modules/ctktkt/lib/integration-api.ts';
import {readOperatingData} from '../../modules/ctktkt/lib/operating-data-api.ts';
import {cleanupCoalPhotos,runCoalPhotoCleanup} from '../../modules/ctktkt/lib/coal-photo-cleanup.ts';
import {isCtktktMachineEndpoint} from '../../modules/ctktkt/lib/machine-endpoints.ts';

const key='local-test-key-'.repeat(4),expectedHash=createHash('sha256').update(key).digest('hex');
const request=(query='period=2026-10&dataset=pmis',token=key)=>new Request('http://localhost/api/ctktkt/integration/v1/operating-data?'+query,{headers:token?{authorization:'Bearer '+token}:{}});
function fixtureDb() {
 const calls=[];
 const daily=[['2026-10-02','DA','0'],['2026-10-02','DB','1,5'],['2026-10-01','DC',''],['2026-10-01','DE','-95']].map(([operatingDate,fieldCode,value])=>({operatingDate,fieldCode,value}));
 return {calls,prepare(sql){return {bind(...args){calls.push({sql,args});return {async all(){return {results:sql.includes('ppa_heat_rate_daily')?[{operatingDate:'2026-10-02',updatedAt:'2026-10-03 00:00:00',ppaPlant:0,ppaS1:null,ppaS2:'10000,5'}]:sql.includes("LIKE 'KTKT:%'")?[]:daily};}};}};}};
}
test('khóa tích hợp sai/thiếu/thu hồi bị từ chối trước khi truy vấn',async()=>{
 for(const [token,hash] of [[null,expectedHash],['wrong',expectedHash],[key,undefined],[key,'not-a-hash'],[key,expectedHash.toUpperCase()],['x'.repeat(60),expectedHash]]) {
  assert.equal(integrationAuthorized(request(undefined,token),hash),false);
  const response=await readOperatingData(request(undefined,token),{expectedHash:hash,getDb(){throw Error('Không được đọc DB');},today:'2026-11-04'});
  assert.equal(response.status,401);assert.match(response.headers.get('Cache-Control'),/no-store/);
 }
 assert.equal(integrationAuthorized(request(),expectedHash),true);
});
test('kiểm tra tháng/dataset và mốc chuyển năm',async()=>{
 assert.deepEqual(integrationPeriod('2026-12'),{period:'2026-12',from:'2026-12-01',next:'2027-01-01'});
 for(const query of ['period=2026-13&dataset=pmis','period=2026-1&dataset=ppa','period=2026-10&dataset=all','dataset=pmis']) {
  const response=await readOperatingData(request(query),{expectedHash,getDb(){throw Error('Không được đọc DB');},today:'2026-11-04'});
  assert.equal(response.status,400);
 }
});
test('PMIS giữ hợp đồng gốc, số 0/thiếu/số thập phân và giới hạn ngày PostgreSQL',async()=>{
 const db=fixtureDb();
 const response=await readOperatingData(request(),{expectedHash,getDb:()=>db,today:'2026-10-02'});
 assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.version,1);assert.equal(body.dataset,'pmis');assert.equal(body.period,'2026-10');
 assert.deepEqual(body.entries.map(e=>e.operatingDate),['2026-10-01','2026-10-02']);
 assert.equal(body.entries[0].s1.dryFlueGasLossPercent,null);assert.equal(body.entries[0].s1.condenserVacuumKpa,-95);
 assert.equal(body.entries[1].s1.grossPowerMw,0);assert.equal(body.entries[1].s2.grossPowerMw,1.5);assert.equal(body.entries[1].s2.nh3PerGrossKwh,null);
 assert.deepEqual(db.calls[0].args,['2026-10-01','2026-11-01','2026-10-02']);
 assert.deepEqual(db.calls[1].args,['2026-09-30','2026-11-01','2026-10-02']);assert.ok(!db.calls[1].sql.includes('date('));
});
test('PPA giữ đơn vị, thời điểm cập nhật và phân biệt thiếu với 0',async()=>{
 const response=await readOperatingData(request('period=2026-10&dataset=ppa'),{expectedHash,getDb:fixtureDb,today:'2026-11-04'});
 const body=await response.json();assert.equal(response.status,200);assert.equal(body.dataset,'ppa');
 const entry=body.entries[0];assert.equal(entry.unit,'kJ/kWh');assert.equal(entry.updatedAt,'2026-10-03 00:00:00');
 assert.equal(entry.plant.ppa,0);assert.equal(entry.s1.ppa,null);assert.equal(entry.s2.ppa,10000.5);assert.equal(entry.plant.actual,null);
});
test('lỗi DB được trả 503, không lộ lỗi nội bộ',async()=>{
 const response=await readOperatingData(request(),{expectedHash,getDb(){throw Error('database-password');},today:'2026-11-04'});
 assert.equal(response.status,503);assert.equal((await response.json()).error,'Tạm thời không đọc được dữ liệu.');
});
test('cron kiểm khóa riêng trước khi xóa; báo đúng thành công/lỗi',async()=>{
 let calls=0;const cleanup=async()=>{calls++;};
 for(const token of [null,'wrong',key]) {
  const response=await runCoalPhotoCleanup(request(undefined,token),{secret:undefined,cleanup});assert.equal(response.status,401);
 }
 const rejected=await runCoalPhotoCleanup(request(undefined,'wrong'),{secret:key,cleanup});assert.equal(rejected.status,401);assert.equal(calls,0);
 const accepted=await runCoalPhotoCleanup(request(),{secret:key,cleanup});assert.equal(accepted.status,200);assert.deepEqual(await accepted.json(),{ok:true});assert.equal(calls,1);
 const failed=await runCoalPhotoCleanup(request(),{secret:key,cleanup:async()=>{throw Error('secret');}});assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('secret'));
});
test('dọn ảnh chỉ theo expires_at và bucket cũ, cùng một giao dịch',async()=>{
 const now=Date.parse('2026-11-04T00:00:00Z');let batches=0;
 const db={prepare:sql=>({bind:(...args)=>({sql,args})}),batch:async statements=>{
  batches++;assert.equal(statements.length,2);
  assert.deepEqual(statements[0],{sql:'DELETE FROM coal_meter_photos WHERE expires_at <= ?',args:[now]});
  assert.deepEqual(statements[1],{sql:'DELETE FROM coal_photo_usage WHERE bucket < ?',args:[Math.floor(now/3600000)-24]});
  return [{meta:{changes:2}},{meta:{changes:3}}];
 }};
 assert.deepEqual(await cleanupCoalPhotos(now,db),{photos:2,usageBuckets:3});assert.equal(batches,1);
});
test('chỉ bốn cặp đường dẫn/phương thức được qua lớp cookie để tự kiểm bearer',()=>{
 for(const [path,method] of [['integration/v1/operating-data','GET'],['cron/coal-photos','GET'],['google-mirror/snapshot','GET'],['google-mirror/status','POST']]) {
  assert.equal(isCtktktMachineEndpoint('/api/ctktkt/'+path,method),true);
  assert.equal(isCtktktMachineEndpoint('/api/ctktkt/'+path+'/extra',method),false);
 }
 assert.equal(isCtktktMachineEndpoint('/api/ctktkt/google-mirror/status','GET'),false);
 assert.equal(isCtktktMachineEndpoint('/api/ctktkt/integration/v1/operating-data','POST'),false);
 assert.equal(isCtktktMachineEndpoint('/api/ctktkt/daily-inputs','GET'),false);
});
