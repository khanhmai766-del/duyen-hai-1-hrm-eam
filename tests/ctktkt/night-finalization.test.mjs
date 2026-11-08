import test from 'node:test';
import assert from 'node:assert/strict';
import {canFinalizeReportDate} from '../../modules/ctktkt/lib/input-shift.ts';
import {saveReportWithShift} from '../../modules/ctktkt/lib/report-corrections.ts';

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

test('night finalization saves earlier shifts and other owners with audit, without changing original ownership',async()=>{
 const prior=globalThis.ctktktPool,statements=[];
 globalThis.ctktktPool={connect:async()=>({release(){},query:async(sql,args)=>{
  statements.push({sql,args});
  if(sql.startsWith('SELECT value,note'))return {rows:[{value:'100',note:'',updated_at:'2026-11-07 01:00:00'}],rowCount:1};
  if(sql.startsWith('SELECT id FROM'))return {rows:[{id:1}],rowCount:1};
  if(sql.includes('SELECT owner_id'))return {rows:[{owner_id:'day-operator',shift_start:'2026-11-07T07:00:00Z'}],rowCount:1};
  return {rows:[],rowCount:1};
 }})};
 const user={id:'night-operator',username:'night',displayName:'Ca đêm',role:'editor',position:'Trưởng kíp điện',permissions:['edit_ctktkt']};
 try{
  assert.equal((await saveReportWithShift(user,'2026-11-07',[{cell:'I35',value:'150'},{cell:'Z27',value:'200'}],undefined,new Date('2026-11-08T04:39:00+07:00'))).saved,2);
  assert.ok(statements.some(s=>s.sql.startsWith('INSERT INTO public.ctktkt_daily_input_audit')&&s.args[0]==='night-operator'));
  assert.ok(statements.some(s=>s.sql==='COMMIT'));
  assert.ok(!statements.some(s=>s.sql.startsWith('UPDATE public.ctktkt_input_ownership')));
  for(const time of ['2026-11-07T21:59:59+07:00','2026-11-08T06:00:00+07:00'])await assert.rejects(()=>saveReportWithShift(user,'2026-11-07',[{cell:'I35',value:'150'}],undefined,new Date(time)),/Ngoài thời gian chốt ngày/);
  await assert.rejects(()=>saveReportWithShift({...user,permissions:['view_all']},'2026-11-07',[{cell:'I35',value:'150'}],undefined,new Date('2026-11-08T04:39:00+07:00')),/Ngoài thời gian chốt ngày/);
 }finally{globalThis.ctktktPool=prior;}
});
