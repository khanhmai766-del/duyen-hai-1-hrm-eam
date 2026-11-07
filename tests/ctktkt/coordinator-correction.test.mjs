import test from 'node:test';
import assert from 'node:assert/strict';
import {saveReportWithShift,reviewCorrection} from '../../modules/ctktkt/lib/report-corrections.ts';

test('coordinator cross-owner correction creates a request only; never writes readings or approves',async()=>{
 const prior=globalThis.ctktktPool,statements=[];
 globalThis.ctktktPool={connect:async()=>({release(){},query:async(sql,args)=>{
  statements.push({sql,args});
  if(sql.startsWith('SELECT value,note,updated_at'))return {rows:[{value:'30122.96',note:'nguồn cũ',updated_at:'2026-11-02 00:00:00'}],rowCount:1};
  if(sql.startsWith('SELECT id FROM'))return {rows:[{id:7}],rowCount:1};
  if(sql.includes('SELECT owner_id'))return {rows:[{owner_id:'another-operator',shift_start:'2026-11-02T06:00:00Z'}],rowCount:1};
  return {rows:[],rowCount:1};
 }})};
 const coordinator={id:'coordinator',username:'tkd',displayName:'TKĐ',position:'Trưởng kíp điện',role:'viewer',permissions:['view_all']};
 try{
  const result=await saveReportWithShift(coordinator,'2026-11-02',[{cell:'Z27',value:'30224.86'}],'Đối chiếu ảnh công tơ gốc');
  assert.equal(result.requested,true);assert.equal(result.saved,0);
  assert.ok(statements.some(q=>q.sql.startsWith('INSERT INTO public.ctktkt_correction_requests')));
  assert.ok(!statements.some(q=>/^(INSERT INTO|UPDATE|DELETE FROM) public.ctktkt_daily_inputs/.test(q.sql)));
  await assert.rejects(()=>reviewCorrection(coordinator,result.requestId,true,''),/Chỉ tài khoản quản trị/);
  const operator={...coordinator,position:'Máy nghiền',permissions:['ctktkt_may_nghien_coal_s1']};
  await assert.rejects(()=>saveReportWithShift(operator,'2026-11-02',[{cell:'Z27',value:'30224.86'}],'Đề xuất tài khoản khác'),/chính mình/);
 }finally{globalThis.ctktktPool=prior;}
});
