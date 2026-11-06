import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {BACKUP_TABLES,backupRange,createDataBackup,validateDataBackup} from '../../../modules/ctktkt/lib/data-backup.ts';
import * as backup from '../../../modules/ctktkt/lib/data-backup.ts';
import {isCtktktSameOrigin} from '../../../modules/ctktkt/lib/request-origin.ts';

const require=createRequire(import.meta.url);
const emptyTables=()=>Object.fromEntries(BACKUP_TABLES.map(table=>[table.name,[]]));
const makeFile=(overrides={},range=null)=>createDataBackup({...emptyTables(),...overrides},range);
const day=(value='10')=>({id:90,operating_date:'2026-11-01',field_code:'KTKT:TEST',value,note:'Synthetic',updated_at:'2026-11-01 08:00:00'});

function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE daily_inputs(id INTEGER PRIMARY KEY AUTOINCREMENT,operating_date TEXT NOT NULL,field_code TEXT NOT NULL,value TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(operating_date,field_code));
    CREATE TABLE water_shift_logs(id INTEGER PRIMARY KEY,log_date TEXT NOT NULL,shift_time TEXT NOT NULL,water_adjustment_s1 REAL,water_adjustment_s2 REAL,UNIQUE(log_date,shift_time));
    CREATE TABLE chemical_usage_logs(id INTEGER PRIMARY KEY,usage_date TEXT NOT NULL,source_key TEXT NOT NULL UNIQUE,quantity REAL NOT NULL);
    CREATE TABLE measurements(id INTEGER PRIMARY KEY,period TEXT NOT NULL,actual TEXT NOT NULL);
    CREATE TABLE data_restore_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT NOT NULL,checksum TEXT NOT NULL,mode TEXT NOT NULL,row_count INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE TABLE users(id INTEGER PRIMARY KEY,password_hash TEXT);INSERT INTO users VALUES(1,'NEVER_EXPORT');`);
  let allowed=true,writes=0,snapshots=0;
  const statement=(sql,args=[])=>({sql,args,bind:(...values)=>statement(sql,values),run:async()=>({meta:sqlite.prepare(sql).run(...args)}),all:async()=>({results:sqlite.prepare(sql).all(...args)})});
  const db={prepare:sql=>statement(sql),batch:async statements=>{
    writes++;sqlite.exec('BEGIN');
    try{const result=statements.map(s=>({meta:sqlite.prepare(s.sql).run(...s.args)}));sqlite.exec('COMMIT');return result;}
    catch(error){sqlite.exec('ROLLBACK');throw error;}
  }};
  const deps={
    '@/modules/ctktkt/lib/request-origin':{isCtktktSameOrigin},
    "@/lib/upload-guard": {inspectUpload:async()=>{}},
    '@/modules/ctktkt/db':{getRawDb:()=>db,readBackupSnapshot:async statements=>{snapshots++;return statements.map(s=>sqlite.prepare(s.sql).all(...s.args));}},
    '@/modules/ctktkt/lib/auth/server':{requirePermission:async permission=>{assert.ok(['backup_data','restore_data'].includes(permission));return allowed?{ok:true,user:{id:7}}:{ok:false,response:Response.json({error:'Forbidden'},{status:403})};}},
    '@/modules/ctktkt/lib/water-report/schema':{ensureWaterSchema:async()=>{}},
    '@/modules/ctktkt/lib/chemical-usage/schema':{ensureChemicalUsageSchema:async()=>{}},
    '@/modules/ctktkt/lib/data-backup':backup,
  };
  const code=ts.transpileModule(readFileSync(new URL('../../../modules/ctktkt/server/routes/admin/data-backup/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const cjsModule={exports:{}};
  vm.runInThisContext('(function(exports,require,module){'+code+'\n})')(cjsModule.exports,name=>deps[name]||require(name),cjsModule);
  const post=async(file,action='preview',mode='missing',options={})=>{
    const res=await cjsModule.exports.POST(new Request('https://test.local/api/admin/data-backup',{method:'POST',headers:{origin:'https://test.local','content-type':'application/json',...options.headers},body:JSON.stringify({file,action,mode,confirmed:true,...options.body})}));
    return {status:res.status,body:await res.json()};
  };
  return {sqlite,db,route:cjsModule.exports,post,deny(){allowed=false;},get writes(){return writes;},get snapshots(){return snapshots;}};
}

test('backup validates real date ranges, checksum and allowlisted tables',()=>{
  assert.equal(backupRange(null,null),null);
  assert.throws(()=>backupRange('2026-02-29','2026-03-01'));
  assert.throws(()=>backupRange('2026-11-02','2026-11-01'));
  const good=makeFile({daily_inputs:[day()]});assert.deepEqual(validateDataBackup(good),good);
  const corrupt=structuredClone(good);corrupt.tables.daily_inputs[0].value='999';assert.throws(()=>validateDataBackup(corrupt),/thay đổi|hỏng/);
  assert.throws(()=>validateDataBackup(makeFile({users:[]})),/bảng/);
  assert.throws(()=>validateDataBackup(makeFile({daily_inputs:[day(),day()]})),/trùng lặp/);
  assert.throws(()=>validateDataBackup(makeFile({daily_inputs:[day()]},{from:'2026-10-01',to:'2026-10-31'})),/khoảng/);
});

test('download exports a date-bounded snapshot with no accounts or secrets',async t=>{
  const f=fixture();t.after(()=>f.sqlite.close());
  f.sqlite.exec(`INSERT INTO daily_inputs(operating_date,field_code,value) VALUES('2026-10-31','OLD','1'),('2026-11-01','NEW','0');INSERT INTO measurements VALUES(1,'2026-10','1'),(2,'2026-11','2');`);
  const res=await f.route.GET(new Request('https://test.local/api/admin/data-backup?from=2026-11-01&to=2026-11-01'));
  assert.equal(res.status,200);assert.match(res.headers.get('cache-control'),/no-store/);assert.match(res.headers.get('content-disposition'),/attachment/);
  const text=await res.text(),file=validateDataBackup(JSON.parse(text));
  assert.equal(file.tables.daily_inputs.length,1);assert.equal(file.tables.daily_inputs[0].value,'0');
  assert.equal(file.tables.measurements.length,1);assert.equal(file.tables.measurements[0].period,'2026-11');
  assert.ok(!text.includes('NEVER_EXPORT'));assert.equal(f.snapshots,1);assert.equal(f.writes,0);
});

test('admin and same-origin guards reject download, preview and restore',async t=>{
  const f=fixture();t.after(()=>f.sqlite.close());
  assert.equal((await f.post(makeFile(), 'restore','missing',{headers:{origin:'https://other.test'}})).status,403);
  f.deny();assert.equal((await f.route.GET(new Request('https://test.local/api/admin/data-backup'))).status,403);
  assert.equal((await f.post(makeFile())).status,403);assert.equal((await f.post(makeFile(),'restore')).status,403);assert.equal(f.writes,0);
});

test('preview checks schema and never writes; invalid columns and types fail before mutation',async t=>{
  const f=fixture();t.after(()=>f.sqlite.close());
  const result=await f.post(makeFile({daily_inputs:[day()]}));assert.equal(result.status,200);assert.equal(result.body.total,1);assert.equal(f.writes,0);
  for(const row of [{...day(),unexpected:'bad'}, {...day(),value:null}, {...day(),id:'90'}, {...day(),field_code:null}]){
    const response=await f.post(makeFile({daily_inputs:[row]}),'restore');assert.equal(response.status,400);assert.equal(f.writes,0);
  }
  assert.equal((await f.post(makeFile(),'restore','missing',{body:{confirmed:false}})).status,400);
});

test('restore missing is idempotent, preserves existing IDs and zero/null adjustments; overwrite is explicit',async t=>{
  const f=fixture();t.after(()=>f.sqlite.close());
  f.sqlite.exec(`INSERT INTO daily_inputs(id,operating_date,field_code,value) VALUES(1,'2026-11-01','KTKT:TEST','existing');`);
  const file=makeFile({daily_inputs:[day('changed'),{...day('new'),field_code:'SECOND'}],water_shift_logs:[{id:7,log_date:'2026-11-01',shift_time:'06h00',water_adjustment_s1:0,water_adjustment_s2:null}]});
  const first=await f.post(file,'restore');assert.equal(first.status,200);assert.equal(first.body.changed,2);
  let rows=f.sqlite.prepare('SELECT * FROM daily_inputs ORDER BY id').all();assert.equal(rows[0].value,'existing');assert.equal(rows[0].id,1);assert.equal(rows.length,2);
  const second=await f.post(file,'restore');assert.equal(second.body.changed,0);
  const explicit=await f.post(file,'restore','overwrite');assert.equal(explicit.status,200);
  rows=f.sqlite.prepare('SELECT * FROM daily_inputs ORDER BY id').all();assert.equal(rows[0].value,'changed');assert.equal(rows[0].id,1);assert.equal(rows.length,2);
  const water=f.sqlite.prepare('SELECT * FROM water_shift_logs').get();assert.equal(water.water_adjustment_s1,0);assert.equal(water.water_adjustment_s2,null);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM data_restore_audit').get().n,3);
});

test('a later conflicting table rolls back all earlier writes and the restore audit',async t=>{
  const f=fixture();t.after(()=>f.sqlite.close());
  f.sqlite.exec(`INSERT INTO chemical_usage_logs VALUES(1,'2026-11-01','same-source',5);`);
  const file=makeFile({daily_inputs:[day()],chemical_usage_logs:[{id:2,usage_date:'2026-11-01',source_key:'same-source',quantity:10}]});
  const result=await f.post(file,'restore','overwrite');assert.equal(result.status,503);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM daily_inputs').get().n,0);
  assert.equal(f.sqlite.prepare('SELECT quantity FROM chemical_usage_logs').get().quantity,5);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM data_restore_audit').get().n,0);
});

test('multi-row restore chunks keep every row and no duplicate on repeated import',async t=>{
  const f=fixture();t.after(()=>f.sqlite.close());
  const file=makeFile({daily_inputs:Array.from({length:125},(_,i)=>({...day(String(i)),field_code:'TEST:'+i}))});
  assert.equal((await f.post(file,'restore')).body.changed,125);
  assert.equal((await f.post(file,'restore')).body.changed,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM daily_inputs').get().n,125);
});

test('downloaded JSON round-trips through preview and restore with its original values',async t=>{
  const source=fixture(),destination=fixture();t.after(()=>{source.sqlite.close();destination.sqlite.close();});
  source.sqlite.exec(`INSERT INTO daily_inputs(operating_date,field_code,value,note) VALUES('2026-11-01','ROUNDTRIP','0.080','ghi chú tiếng Việt');INSERT INTO water_shift_logs VALUES(9,'2026-11-01','22h00',0,NULL);`);
  const download=await source.route.GET(new Request('https://test.local/api/admin/data-backup'));
  const file=await download.json();
  assert.equal((await destination.post(file)).status,200);
  assert.equal((await destination.post(file,'restore')).status,200);
  const row=destination.sqlite.prepare('SELECT value,note FROM daily_inputs').get();assert.equal(row.value,'0.080');assert.equal(row.note,'ghi chú tiếng Việt');
  const water=destination.sqlite.prepare('SELECT water_adjustment_s1,water_adjustment_s2 FROM water_shift_logs').get();assert.equal(water.water_adjustment_s1,0);assert.equal(water.water_adjustment_s2,null);
});
