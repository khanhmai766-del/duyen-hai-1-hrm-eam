import test from 'node:test';
import assert from 'node:assert/strict';
import {saveReportWithShift,reviewCorrection} from '../../modules/ctktkt/lib/report-corrections.ts';
import {testClient,cleanupMonth,seedCell,cellValue,closeImplementationConnections} from './helpers/corrections-db.mjs';

// DB dev THẬT, tháng thử 2001-10; dọn trước và sau.
test('coordinator cross-owner correction creates a request only; never writes readings or approves',async()=>{
 const c=await testClient(),month='2001-10',date='2001-10-02';
 const coordinator={id:'test-corr-coordinator',username:'tkd',displayName:'TKĐ',position:'Trưởng kíp điện',role:'viewer',permissions:['view_all']};
 try{
  await cleanupMonth(c,month);
  await seedCell(c,date,'Z27','30122.96',{id:'test-corr-another-operator',shiftStart:'2001-10-02T06:00:00Z'});
  const result=await saveReportWithShift(coordinator,date,[{cell:'Z27',value:'30224.86'}],'Đối chiếu ảnh công tơ gốc');
  assert.equal(result.requested,true);assert.equal(result.saved,0);
  const requests=(await c.query('SELECT requester_id,status,entries FROM public.ctktkt_correction_requests WHERE operating_date=$1',[date])).rows;
  assert.equal(requests.length,1);assert.equal(requests[0].requester_id,'test-corr-coordinator');assert.equal(requests[0].status,'pending');
  assert.equal(requests[0].entries[0].cell,'Z27');assert.equal(requests[0].entries[0].value,'30224.86');assert.equal(requests[0].entries[0].oldValue,'30122.96');
  // Không ghi số liệu, không ghi nhật ký, không đổi chủ ô.
  assert.equal(await cellValue(c,date,'Z27'),'30122.96');
  assert.equal((await c.query('SELECT count(*)::int n FROM public.ctktkt_daily_input_audit WHERE operating_date=$1',[date])).rows[0].n,0);
  assert.deepEqual((await c.query('SELECT owner_id FROM public.ctktkt_input_ownership WHERE operating_date=$1',[date])).rows,[{owner_id:'test-corr-another-operator'}]);
  await assert.rejects(()=>reviewCorrection(coordinator,result.requestId,true,''),/Chỉ tài khoản quản trị/);
  const operator={...coordinator,id:'test-corr-operator',position:'Máy nghiền',permissions:['ctktkt_may_nghien_coal_s1']};
  await assert.rejects(()=>saveReportWithShift(operator,date,[{cell:'Z27',value:'30224.86'}],'Đề xuất tài khoản khác'),/chính mình/);
 }finally{await cleanupMonth(c,month).catch(()=>{});await c.end();await closeImplementationConnections();}
});
