import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Client} from 'pg';
import {saveReportWithShift,listCorrections,reviewCorrection} from '../../modules/ctktkt/lib/report-corrections.ts';
test('local PostgreSQL workflow uses isolated TEMP tables; no live operational rows are touched',async()=>{
 const env=readFileSync('.env','utf8'),url=new URL(env.match(/^DATABASE_URL="([^"]+)"/m)[1]);assert.ok(['localhost','127.0.0.1'].includes(url.hostname));url.searchParams.delete('schema');const c=new Client({connectionString:url.toString()});await c.connect();
 const prior=globalThis.ctktktPool;
 try{
 for(const table of ['daily_inputs','daily_input_audit','operational_read_versions','input_ownership','correction_requests'])await c.query('CREATE TEMP TABLE ctktkt_'+table+' (LIKE public.ctktkt_'+table+' INCLUDING ALL)');
 // Override serial default to a TEMP sequence, avoiding changes to production sequences.
 await c.query('CREATE TEMP SEQUENCE correction_test_audit_seq');await c.query("ALTER TABLE pg_temp.ctktkt_daily_input_audit ALTER COLUMN id SET DEFAULT nextval('pg_temp.correction_test_audit_seq')");
 await c.query('CREATE TEMP SEQUENCE correction_test_input_seq');await c.query("ALTER TABLE pg_temp.ctktkt_daily_inputs ALTER COLUMN id SET DEFAULT nextval('pg_temp.correction_test_input_seq')");
 globalThis.ctktktPool={connect:async()=>({query:(sql,args)=>c.query(sql.replaceAll('public.ctktkt_','pg_temp.ctktkt_'),args),release(){}})};
 const user={id:'operator-a',username:'a',displayName:'Operator A',role:'technician',permissions:['ctktkt_may_nghien_coal_s1']},other={...user,id:'operator-b'},admin={...user,id:'admin',role:'admin'},manager={...user,permissions:['manage_users']};const date='2026-11-06',morning=new Date(date+'T10:00:00+07:00'),afternoon=new Date(date+'T14:00:00+07:00');
 await saveReportWithShift(user,date,[{cell:'X16',value:'16117.496'}],undefined,morning);
 await saveReportWithShift(user,date,[{cell:'X16',value:'16117.4960'}],undefined,morning);
 assert.equal((await c.query("SELECT value FROM pg_temp.ctktkt_daily_inputs WHERE field_code='KTKT:X16'")).rows[0].value,'16117.4960');
 await assert.rejects(()=>saveReportWithShift(other,date,[{cell:'X16',value:'2'}],undefined,morning),/Ngoài thời gian chốt ngày/);
 await assert.rejects(()=>saveReportWithShift(user,date,[{cell:'X16',value:'2'}],undefined,afternoon),/Ngoài thời gian chốt ngày/);
 await assert.rejects(()=>saveReportWithShift(other,date,[{cell:'X16',value:'2'}],'reason why',afternoon),/chính mình/);
 const pending=await saveReportWithShift(user,date,[{cell:'X16',value:'16117.499'}],'Đọc nhầm chữ số cuối',afternoon);assert.equal(pending.requested,true);
 assert.equal((await c.query("SELECT value FROM pg_temp.ctktkt_daily_inputs WHERE field_code='KTKT:X16'")).rows[0].value,'16117.4960');
 await assert.rejects(()=>reviewCorrection(manager,pending.requestId,true,''),/Chỉ tài khoản quản trị/);
 assert.equal((await listCorrections(other)).length,0);
 await reviewCorrection(admin,pending.requestId,true,'Đã kiểm tra');assert.equal((await c.query("SELECT value FROM pg_temp.ctktkt_daily_inputs WHERE field_code='KTKT:X16'")).rows[0].value,'16117.499');
 await assert.rejects(()=>reviewCorrection(admin,pending.requestId,true,''),/đã được xử lý/);
 const rejected=await saveReportWithShift(user,date,[{cell:'X16',value:'1'}],'Yêu cầu bị từ chối',afternoon);await reviewCorrection(admin,rejected.requestId,false,'Không phù hợp');assert.equal((await c.query("SELECT value FROM pg_temp.ctktkt_daily_inputs WHERE field_code='KTKT:X16'")).rows[0].value,'16117.499');
 const stale=await saveReportWithShift(user,date,[{cell:'X16',value:'3'}],'Yêu cầu chờ duyệt',afternoon);await saveReportWithShift(admin,date,[{cell:'X16',value:'4'}],undefined,afternoon);await assert.rejects(()=>reviewCorrection(admin,stale.requestId,true,''),/đã thay đổi/);
 // Whole batch must rollback if one cell is outside the actor's shift.
 await assert.rejects(()=>saveReportWithShift(user,date,[{cell:'X17',value:'100'},{cell:'X16',value:'5'}],undefined,afternoon));assert.equal((await c.query("SELECT count(*)::int n FROM pg_temp.ctktkt_daily_inputs WHERE field_code='KTKT:X17'")).rows[0].n,0);
 assert.ok((await c.query('SELECT count(*)::int n FROM pg_temp.ctktkt_daily_input_audit')).rows[0].n>=4);
 assert.ok((await c.query('SELECT version FROM pg_temp.ctktkt_operational_read_versions')).rows.length>0);
 }finally{globalThis.ctktktPool=prior;await c.end();}
});
