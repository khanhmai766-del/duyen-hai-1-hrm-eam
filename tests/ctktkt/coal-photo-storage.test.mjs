import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {coalPhotoExpiry,COAL_PHOTO_RETENTION_HOURS} from '../../modules/ctktkt/lib/coal-photo-retention.ts';

const load=(file,deps)=>{
 const source=readFileSync(new URL('../../modules/ctktkt/'+file,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,require:name=>{if(!deps[name])throw Error('Unexpected dependency '+name);return deps[name];},Buffer,Response,URL,Date,crypto,process:{env:{}}});
 return exports;
};

test('ảnh giữ đúng 30 giờ kể từ mốc ca',()=>{
 assert.equal(COAL_PHOTO_RETENTION_HOURS,30);
 assert.equal(coalPhotoExpiry('2026-11-08','08')-Date.parse('2026-11-08T08:00:00+07:00'),30*3600000);
 assert.equal(coalPhotoExpiry('2026-11-08','24')-Date.parse('2026-11-09T00:00:00+07:00'),30*3600000);
});

function fakeDb(){
 const rows=new Map();const calls=[];
 const prepare=sql=>({bind:(...a)=>({
  run:async()=>{calls.push(sql);
   if(sql.startsWith('INSERT INTO coal_meter_photos')){const active=[...rows.values()].filter(r=>r.expires_at>a[9]).length;if(active>=a[10])return {meta:{changes:0}};rows.set(a[0],{id:a[0],data:a[5],expires_at:a[7]});return {meta:{changes:1}};}
   if(sql.startsWith('DELETE FROM coal_meter_photos')){const r=rows.get(a[0]);if(r&&r.expires_at<=a[1]){rows.delete(a[0]);return {meta:{changes:1}};}return {meta:{changes:0}};}
   return {meta:{changes:0}};},
  all:async()=>({results:sql.startsWith('SELECT id,data')?[...rows.values()].filter(r=>r.expires_at<=a[0]):[]}),
 })});
 return {db:{prepare},rows,calls};
}
function fakeStorage({failUpload=false,failRemove=false}={}){
 const objects=new Map();
 return {objects,storage:{upload:async(k,b)=>{if(failUpload)throw Error('s3 down');objects.set(k,b);},remove:async k=>{if(failRemove)throw Error('s3 down');objects.delete(k);},read:async k=>objects.get(k)}};
}
const store=()=>load('lib/coal-photo-store.ts',{
 '../db/index':{getRawDb:()=>{throw Error('use injected db');}},
 '@/lib/s3':{uploadS3Object:async()=>{},deleteS3ObjectByKey:async()=>{},getS3ObjectBuffer:async()=>Buffer.alloc(0)},
 './coal-photo-retention':{coalPhotoExpiry,COAL_PHOTO_FUTURE_LIMIT_MS:38*3600000},
});

test('lưu ảnh lên kho tệp Server 3, DB chỉ giữ khoá; đọc lại đúng nội dung',async()=>{
 const s=store(),{db,rows}=fakeDb(),{objects,storage}=fakeStorage();
 const now=Date.parse('2026-11-08T09:00:00+07:00'),bytes=Buffer.from([255,216,255,1,2]);
 const photo=await s.saveCoalPhoto('u1','2026-11-08','08','image/jpeg',bytes,{total_display:'1'},db,storage,now);
 assert.equal(photo.expiresAt,Date.parse('2026-11-08T08:00:00+07:00')+30*3600000);
 const row=rows.get(photo.id);assert.match(row.data,/^s3:ctktkt\/coal-meter-photos\/2026-11-08\/.+\.jpg$/);
 assert.ok(!row.data.includes(bytes.toString('base64')));
 assert.deepEqual(await s.readCoalPhotoBytes(row.data,storage),bytes);
 assert.equal(objects.size,1);
});

test('kho ảnh đầy thì xoá tệp vừa tải, không để tệp mồ côi',async()=>{
 const s=store(),{db}=fakeDb(),{objects,storage}=fakeStorage();
 const now=Date.parse('2026-11-08T09:00:00+07:00');
 for(let i=0;i<600;i++)await s.saveCoalPhoto('u','2026-11-08','08','image/png',Buffer.from([i%255]),{},db,storage,now);
 await assert.rejects(()=>s.saveCoalPhoto('u','2026-11-08','08','image/png',Buffer.from([1]),{},db,storage,now),/Kho ảnh tạm đầy/);
 assert.equal(objects.size,600);
});

test('quá 30 giờ thì không lưu; ca tương lai bị chặn',async()=>{
 const s=store(),{db}=fakeDb(),{objects,storage}=fakeStorage();
 assert.equal(await s.saveCoalPhoto('u','2026-11-06','08','image/png',Buffer.from([1]),{},db,storage,Date.parse('2026-11-08T09:00:00+07:00')),null);
 await assert.rejects(()=>s.saveCoalPhoto('u','2026-11-10','08','image/png',Buffer.from([1]),{},db,storage,Date.parse('2026-11-08T09:00:00+07:00')),/tương lai/);
 assert.equal(objects.size,0);
});

test('tự xoá: hết hạn thì xoá tệp rồi mới xoá dòng; lỗi kho tệp giữ dòng để xoá lại',async()=>{
 const s=store(),{db,rows}=fakeDb(),{objects,storage}=fakeStorage();
 const saved=Date.parse('2026-11-08T09:00:00+07:00');
 const p=await s.saveCoalPhoto('u','2026-11-08','08','image/png',Buffer.from([1]),{},db,storage,saved);
 const later=p.expiresAt+1;
 const broken=fakeStorage({failRemove:true}).storage;
 assert.equal(await s.cleanupExpiredCoalPhotos(later,db,broken),0);assert.equal(rows.size,1);
 assert.equal(await s.cleanupExpiredCoalPhotos(p.expiresAt-1,db,storage),0);assert.equal(objects.size,1);
 assert.equal(await s.cleanupExpiredCoalPhotos(later,db,storage),1);
 assert.equal(rows.size,0);assert.equal(objects.size,0);
});

async function ocr({quota=true,providerError=false,mismatch=false,storageError=false}={}) {
 const reading={total_display:'8939.810',confidence:'high',photo_timestamp:null};
 const saved=[];let calls=0;
 class VisionError extends Error {}
 const route=load('server/routes/coal-meter-ocr/route.ts',{
 '@/modules/ctktkt/lib/request-origin':{isCtktktSameOrigin:()=>true},
 '@/lib/upload-guard':{inspectUpload:async()=>{}},
 '@/modules/ctktkt/lib/auth/server':{getSessionUser:async()=>({id:'local-test'})},
 '@/modules/ctktkt/lib/ctktkt-permissions':{canEditCtktktGroup:()=>true},
 '@/modules/ctktkt/lib/coal-meter-vision':{CoalMeterVisionError:VisionError},
 '@/modules/ctktkt/lib/coal-meter-gemini':{readCoalMeterGemini:async()=>{calls++;if(providerError)throw Error('provider secret');return reading;}},
 '@/modules/ctktkt/lib/coal-photo-store':{reserveCoalPhotoRead:async()=>quota,saveCoalPhoto:async(...a)=>{if(storageError)throw Error('s3 secret');saved.push(a);return {id:'p1',expiresAt:1};}},
 '@/modules/ctktkt/lib/coal-photo-retention':{coalPhotoExpiry:()=>Date.now(),COAL_PHOTO_FUTURE_LIMIT_MS:38*3600000},
 '@/modules/ctktkt/lib/coal-meter-ocr':{parseVisionTimestamp:()=>null,slotForPhotoTime:()=>null},
 '@/modules/ctktkt/lib/coal-gemini-config':{coalGeminiConfig:()=>({ok:true,key:'test',model:'test'})},
 '@/modules/ctktkt/lib/coal-gemini-shared-store':{loadSharedGemini:async()=>null},
 '@/modules/ctktkt/db':{getRawDb:()=>({})},
 '@/lib/api':{ok:(data,meta)=>Response.json({data,meta:meta??null,error:null}),fail:(error,status=400)=>Response.json({data:null,meta:null,error},{status})},
 });
 const response=await route.POST(new Request('http://localhost/api/ctktkt/coal-meter-ocr',{method:'POST',headers:{'x-coal-gemini-key':'test','content-type':'application/json'},body:JSON.stringify({data:'/9j/',mediaType:'image/jpeg',reportDate:'2026-11-05',slot:'08',exifDate:mismatch?'2026-11-04':'2026-11-05'})}));
 const envelope=await response.json();
 return {response,body:envelope.error?envelope:envelope.data,saved,calls,reading};
}
test('OCR lưu ảnh cho TKĐ và không trả lại nội dung ảnh',async()=>{const r=await ocr();assert.equal(r.response.status,200);assert.deepEqual(r.body.photo,{id:'p1',expiresAt:1});assert.equal(r.body.imageStored,true);assert.equal(r.saved.length,1);assert.equal(r.saved[0][3],'image/jpeg');assert.ok(Buffer.isBuffer(r.saved[0][4]));assert.ok(!JSON.stringify(r.body).includes('/9j/'));});
test('ngày chụp khác ngày báo cáo thì không lưu ảnh',async()=>{const r=await ocr({mismatch:true});assert.equal(r.response.status,200);assert.match(r.body.warning,/ngày chụp khác/);assert.equal(r.saved.length,0);});
test('kho tệp lỗi vẫn trả kết quả đọc, báo chưa lưu ảnh, không lộ lỗi',async()=>{const r=await ocr({storageError:true});assert.equal(r.response.status,200);assert.deepEqual(r.body.reading,r.reading);assert.equal(r.body.photo,null);assert.match(r.body.warning,/chưa lưu được ảnh/);assert.ok(!JSON.stringify(r.body).includes('s3 secret'));});
test('lỗi Gemini hoặc hết lượt thì không lưu ảnh',async()=>{const a=await ocr({providerError:true});assert.equal(a.response.status,502);assert.equal(a.saved.length,0);const b=await ocr({quota:false});assert.equal(b.response.status,429);assert.equal(b.calls,0);assert.equal(b.saved.length,0);});
