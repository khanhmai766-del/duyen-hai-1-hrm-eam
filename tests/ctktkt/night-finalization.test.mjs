import test from 'node:test';
import assert from 'node:assert/strict';
import {canFinalizeReportDate} from '../../modules/ctktkt/lib/input-shift.ts';
import {saveReportWithShift} from '../../modules/ctktkt/lib/report-corrections.ts';
import {testClient,cleanupMonth,seedCell,cellValue,closeImplementationConnections} from './helpers/corrections-db.mjs';

for(const [date,time,allowed] of [
 ['2026-11-07','2026-11-07T21:59:59+07:00',false],
 ['2026-11-07','2026-11-07T22:00:00+07:00',true],
 ['2026-11-07','2026-11-08T00:00:00+07:00',true],
 ['2026-11-07','2026-11-08T04:39:00+07:00',true],
 ['2026-11-07','2026-11-08T05:59:59+07:00',true],
 ['2026-11-07','2026-11-08T06:00:00+07:00',false],
 ['2026-11-06','2026-11-08T04:39:00+07:00',false],
 ['2026-11-08','2026-11-08T04:39:00+07:00',false],
 ['2026-12-31','2027-01-01T04:39:00+07:00',true],
 ['2028-02-29','2028-03-01T05:59:59+07:00',true],
]) test(`night reporting date ${date} at ${time}`,()=>assert.equal(canFinalizeReportDate(date,new Date(time)),allowed));

// DB dev THẬT, tháng thử 2001-12; dọn trước và sau.
test('night finalization saves earlier shifts and other owners with audit, without changing original ownership',async()=>{
 const c=await testClient(),month='2001-12',date='2001-12-07';
 const user={id:'test-corr-night-operator',username:'night',displayName:'Ca đêm',role:'editor',position:'Trưởng kíp điện',permissions:['edit_ctktkt']};
 try{
  await cleanupMonth(c,month);
  for(const cell of ['I35','Z27'])await seedCell(c,date,cell,'100',{id:'test-corr-day-operator',shiftStart:'2001-12-07T07:00:00Z'});
  assert.equal((await saveReportWithShift(user,date,[{cell:'I35',value:'150'},{cell:'Z27',value:'200'}],undefined,new Date('2001-12-08T04:39:00+07:00'))).saved,2);
  assert.equal(await cellValue(c,date,'I35'),'150');assert.equal(await cellValue(c,date,'Z27'),'200');
  const audit=(await c.query("SELECT actor_id,field_code,action,old_value,new_value FROM public.ctktkt_daily_input_audit WHERE operating_date=$1 ORDER BY id",[date])).rows;
  assert.deepEqual(audit.map(a=>[a.actor_id,a.field_code,a.action,a.old_value,a.new_value]),[['test-corr-night-operator','KTKT:I35','update','100','150'],['test-corr-night-operator','KTKT:Z27','update','100','200']]);
  // Chủ ô gốc giữ nguyên.
  assert.deepEqual((await c.query('SELECT DISTINCT owner_id FROM public.ctktkt_input_ownership WHERE operating_date=$1',[date])).rows,[{owner_id:'test-corr-day-operator'}]);
  for(const time of ['2001-12-07T21:59:59+07:00','2001-12-08T06:00:00+07:00'])await assert.rejects(()=>saveReportWithShift(user,date,[{cell:'I35',value:'151'}],undefined,new Date(time)),/Ngoài thời gian chốt ngày/);
  await assert.rejects(()=>saveReportWithShift({...user,permissions:['view_all']},date,[{cell:'I35',value:'151'}],undefined,new Date('2001-12-08T04:39:00+07:00')),/Ngoài thời gian chốt ngày/);
  assert.equal(await cellValue(c,date,'I35'),'150');
 }finally{await cleanupMonth(c,month).catch(()=>{});await c.end();await closeImplementationConnections();}
});
