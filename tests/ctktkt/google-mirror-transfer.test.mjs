import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {GOOGLE_MIRROR_SCRIPT} from '../../modules/ctktkt/lib/google-mirror-script.ts';
import {GOOGLE_MIRROR_FILES} from '../../modules/ctktkt/lib/google-mirror.ts';
function harness({code=200,files=GOOGLE_MIRROR_FILES,base='https://duyenhai1.vn',triggers=1}={}) {
 const values=new Map([['token','old-token'],['snapshot_etag','old-etag'],['hash_data','unchanged'],['period_data','2026-11']]);
 let released=false, sheetWrites=0, calls=0;
 const context=vm.createContext({CONFIG:{base,token:'p'.repeat(64),files:GOOGLE_MIRROR_FILES},Set,JSON,Error,console:{log(){}},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){released=true;}})},ScriptApp:{getProjectTriggers:()=>Array.from({length:triggers},()=>({getHandlerFunction:()=> 'syncNow'}))},PropertiesService:{getScriptProperties:()=>({setProperty:(k,v)=>values.set(k,v),deleteProperty:k=>values.delete(k)})},UrlFetchApp:{fetch(){calls++;return {getResponseCode:()=>code,getContentText:()=>JSON.stringify({period:'2026-11',files})}}},SpreadsheetApp:{openById(){sheetWrites++;throw Error('Must not write sheets during transfer');}}});
 vm.runInContext(GOOGLE_MIRROR_SCRIPT,context);
 return {run:()=>context.connectPxSource(),values,released:()=>released,sheetWrites:()=>sheetWrites,calls:()=>calls};
}
test('transfer validates source then switches token, preserving file hashes and month without Sheet writes',()=>{const h=harness();h.run();assert.equal(h.values.get('token'),'p'.repeat(64));assert.equal(h.values.has('snapshot_etag'),false);assert.equal(h.values.get('hash_data'),'unchanged');assert.equal(h.values.get('period_data'),'2026-11');assert.equal(h.sheetWrites(),0);assert.equal(h.released(),true);});
for(const code of [401,503])test('HTTP '+code+' keeps previous credentials and revision',()=>{const h=harness({code});assert.throws(h.run);assert.equal(h.values.get('token'),'old-token');assert.equal(h.values.get('snapshot_etag'),'old-etag');assert.equal(h.released(),true);});
test('foreign file IDs or duplicate keys cannot switch source',()=>{for(const files of [GOOGLE_MIRROR_FILES.map((f,i)=>i?f:{...f,id:'foreign'}),GOOGLE_MIRROR_FILES.map((f,i)=>i?f:GOOGLE_MIRROR_FILES[1])]){const h=harness({files});assert.throws(h.run);assert.equal(h.values.get('token'),'old-token');}});
for(const triggers of [0,2])test('requires exactly one existing hourly handler: '+triggers,()=>{const h=harness({triggers});assert.throws(h.run);assert.equal(h.calls(),0);assert.equal(h.released(),true);});
test('local preview cannot become the live scheduled source',()=>{const h=harness({base:'http://localhost:3030'});assert.throws(h.run);assert.equal(h.calls(),0);assert.equal(h.values.get('token'),'old-token');});
