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

// Kho ảnh (lưu lên kho tệp, kho đầy, quá hạn, tự xoá): kiểm trên DB thật ở tests/ctktkt/coal-photo-db.test.mjs
// (giai đoạn 3 — Prisma, bỏ giả lập câu SQL). Ở đây chỉ còn route đọc ảnh với kho ảnh giả.

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
 '@/lib/prisma':{prisma:{}},
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
