import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
import ExcelJS from 'exceljs';
import {storedPpaMeterSource} from '../../modules/ctktkt/lib/ppa-stored-source.ts';
const require=createRequire(import.meta.url);
const root=new URL('../../modules/ctktkt/lib/',import.meta.url);
const source=readFileSync(new URL('google-mirror-snapshot.ts',root),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const meters=()=>({grossS1:Array(48).fill(200000),netS1:Array(48).fill(180000),grossS2:Array(48).fill(0),netS2:Array(48).fill(0)});
async function snapshot(ppaRows){
  const exports={};
  async function buildWorkbook(){
    const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('T11.2026');
    sheet.addRow(['Header']);sheet.addRow(['Units']);
    return book;
  }
  const db={prepare(sql){return {bind(){return {all:async()=>({results:sql.includes('FROM ppa_heat_rate_daily')?ppaRows:[]})};}};}};
  vm.runInNewContext(code,{exports,Buffer,Response,Request,URL,Date,console,require:name=>{
    if(name==='@/modules/ctktkt/db')return {getRawDb:()=>db};
    if(name.startsWith('./report-exports/'))return {buildCtktktWorkbook:buildWorkbook,buildWaterWorkbook:buildWorkbook};
    if(name.startsWith('./'))return require(fileURLToPath(new URL(name+(name.endsWith('.json')?'':'.ts'),root)));
    return require(name);
  }});
  return exports.buildMirrorSnapshot('2026-11');
}
const noteRow={operating_date:'2026-11-01',source_data:'{}',ppa_plant:'0',ppa_s1:'0',ppa_s2:'0',net_s1_kwh:'0',net_s2_kwh:'0',note_s1:'NOTES_ONLY_S1',note_s2:'NOTES_ONLY_S2'};
test('empty saved PPA sources are missing meters, not manufactured zero intervals',()=>{
  for(const raw of [null,undefined,'','{}',{},'null'])assert.equal(storedPpaMeterSource(raw),null);
});
test('complete PPA source preserves every reading',()=>{
  const m=meters();m.grossS1[47]=200000.496;
  assert.equal(storedPpaMeterSource(m),m);
  assert.deepEqual(storedPpaMeterSource(JSON.stringify(m)),m);
});
test('partial, malformed, negative and nonnumeric PPA sources still fail closed',()=>{
  for(const raw of ['bad','[]','1',{grossS1:[1]}, {...meters(),netS1:Array(47).fill(1)}, {...meters(),netS1:Array(48).fill(-1)}, {...meters(),netS1:Array(48).fill('1')}])assert.throws(()=>storedPpaMeterSource(raw),/PPA_METER_SOURCE_INVALID/);
});
test('snapshot keeps nine files and notes but creates no meter sheet for notes-only day',async()=>{
  const s=await snapshot([noteRow]);assert.equal(s.files.length,9);
  const p=s.files.find(f=>f.key==='ppa');
  assert.deepEqual(Array.from(p.tabs,t=>t.name),['Cả nhà máy DH1','S1','S2']);
  assert.ok(JSON.stringify(p.tabs[0].rows).includes('NOTES_ONLY_S1'));
  assert.ok(JSON.stringify(p.tabs[0].rows).includes('NOTES_ONLY_S2'));
  const w=s.files.find(f=>f.key==='water').tabs[0];
  assert.equal(w.rows[0][0],'31/10/2026');
});
test('notes-only day does not prevent valid PPA day from being exported',async()=>{
  const m=meters();
  const valid={...noteRow,operating_date:'2026-11-02',source_data:JSON.stringify(m)};
  const s=await snapshot([noteRow,valid]);const p=s.files.find(f=>f.key==='ppa');
  assert.equal(p.tabs.some(t=>t.name==='0111'),false);
  assert.equal(p.tabs.some(t=>t.name==='0211'),true);
  assert.ok(JSON.stringify(p.tabs.find(t=>t.name==='0211').rows).includes('200000'));
});
test('invalid partially populated PPA day cannot silently disappear from snapshot',async()=>{
  await assert.rejects(()=>snapshot([{...noteRow,source_data:'{"grossS1":[1]}'}]),/PPA_METER_SOURCE_INVALID/);
});
