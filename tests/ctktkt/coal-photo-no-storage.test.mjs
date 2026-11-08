import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../../modules/ctktkt/server/routes/coal-meter-ocr/route.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function run({quota=true,providerError=false,mismatch=false}={}) {
 const reading={total_display:'8939.810',confidence:'high',photo_timestamp:null};
 let stored=0,calls=0;
 class VisionError extends Error {}
 const deps={
 '@/modules/ctktkt/lib/request-origin':{isCtktktSameOrigin:()=>true},
 '@/lib/upload-guard':{inspectUpload:async()=>{}},
 '@/modules/ctktkt/lib/auth/server':{getSessionUser:async()=>({id:'local-test'})},
 '@/modules/ctktkt/lib/ctktkt-permissions':{canEditCtktktGroup:()=>true},
 '@/modules/ctktkt/lib/coal-meter-vision':{CoalMeterVisionError:VisionError},
 '@/modules/ctktkt/lib/coal-meter-gemini':{readCoalMeterGemini:async()=>{calls++;if(providerError)throw Error('provider secret');return reading;}},
 '@/modules/ctktkt/lib/coal-photo-store':{reserveCoalPhotoRead:async()=>quota,saveCoalPhoto:async()=>{stored++;}},
 '@/modules/ctktkt/lib/coal-photo-retention':{coalPhotoExpiry:()=>Date.now()},
 '@/modules/ctktkt/lib/coal-meter-ocr':{parseVisionTimestamp:()=>null,slotForPhotoTime:()=>null},
 '@/modules/ctktkt/lib/coal-gemini-config':{coalGeminiConfig:()=>({ok:true,key:'test',model:'test'})},
 '@/modules/ctktkt/lib/coal-gemini-shared-store':{loadSharedGemini:async()=>null},
 '@/modules/ctktkt/db':{getRawDb:()=>{throw Error('No image DB access allowed');}},
 // Phong bì chung của web (lib/api): { data, meta, error }.
 '@/lib/api':{ok:(data,meta)=>Response.json({data,meta:meta??null,error:null}),fail:(error,status=400)=>Response.json({data:null,meta:null,error},{status})}
 };
 const exports={};vm.runInNewContext(code,{exports,require:name=>{if(!deps[name])throw Error('Unexpected dependency '+name);return deps[name];},Buffer,Response,URL,Date,process:{env:{}}});
 const response=await exports.POST(new Request('http://localhost/api/ctktkt/coal-meter-ocr',{method:'POST',headers:{'x-coal-gemini-key':'test','content-type':'application/json'},body:JSON.stringify({data:'/9j/',mediaType:'image/jpeg',reportDate:'2026-11-05',slot:'08',exifDate:mismatch?'2026-11-04':'2026-11-05'})}));
 const envelope=await response.json();
 // body = phần dữ liệu (thành công) hoặc cả phong bì (lỗi); kiểm tra "không lộ byte ảnh/lỗi nhà cung cấp" quét cả phong bì.
 return {response,envelope,body:envelope.error?envelope:envelope.data,stored,calls,reading};
}
test('OCR returns readings without storing image or returning its bytes',async()=>{const r=await run();assert.equal(r.response.status,200);assert.deepEqual(r.body.reading,r.reading);assert.equal(r.body.photo,null);assert.equal(r.body.imageStored,false);assert.equal(r.stored,0);assert.equal(r.response.headers.get('cache-control'),'no-store');assert.ok(!JSON.stringify(r.envelope).includes('/9j/'));});
test('date mismatch is still reported without retaining the image',async()=>{const r=await run({mismatch:true});assert.equal(r.response.status,200);assert.match(r.body.warning,/Ngày chụp khác/);assert.equal(r.stored,0);});
test('provider failure never stores image or exposes raw provider errors',async()=>{const r=await run({providerError:true});assert.equal(r.response.status,502);assert.equal(r.stored,0);assert.ok(!JSON.stringify(r.envelope).includes('provider secret'));});
test('quota denial does not call provider or store image',async()=>{const r=await run({quota:false});assert.equal(r.response.status,429);assert.equal(r.calls,0);assert.equal(r.stored,0);});
