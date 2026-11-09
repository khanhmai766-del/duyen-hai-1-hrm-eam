import test from 'node:test';
import assert from 'node:assert/strict';
import {saveReportWithShift,listCorrections,reviewCorrection} from '../../modules/ctktkt/lib/report-corrections.ts';
import {testClient,cleanupMonth,cellValue,closeImplementationConnections} from './helpers/corrections-db.mjs';

// Chạy trên DB dev THẬT, tháng thử 2001-11 (không có dữ liệu thật); dọn trước và sau.
test('local PostgreSQL workflow: shift ownership, correction request, approval, stale request, batch rollback',async()=>{
 const c=await testClient(),month='2001-11';
 try{
 await cleanupMonth(c,month);
 const user={id:'test-corr-operator-a',username:'a',displayName:'Operator A',role:'technician',permissions:['ctktkt_may_nghien_coal_s1']},other={...user,id:'test-corr-operator-b'},admin={...user,id:'test-corr-admin',role:'admin'},manager={...user,permissions:['manage_users']};const date='2001-11-06',morning=new Date(date+'T10:00:00+07:00'),afternoon=new Date(date+'T14:00:00+07:00');
 await saveReportWithShift(user,date,[{cell:'X16',value:'16117.496'}],undefined,morning);
 await saveReportWithShift(user,date,[{cell:'X16',value:'16117.4960'}],undefined,morning);
 assert.equal(await cellValue(c,date,'X16'),'16117.4960');
 await assert.rejects(()=>saveReportWithShift(other,date,[{cell:'X16',value:'2'}],undefined,morning),/Ngoài thời gian chốt ngày/);
 await assert.rejects(()=>saveReportWithShift(user,date,[{cell:'X16',value:'2'}],undefined,afternoon),/Ngoài thời gian chốt ngày/);
 await assert.rejects(()=>saveReportWithShift(other,date,[{cell:'X16',value:'2'}],'reason why',afternoon),/chính mình/);
 const pending=await saveReportWithShift(user,date,[{cell:'X16',value:'16117.499'}],'Đọc nhầm chữ số cuối',afternoon);assert.equal(pending.requested,true);
 assert.equal(await cellValue(c,date,'X16'),'16117.4960');
 await assert.rejects(()=>reviewCorrection(manager,pending.requestId,true,''),/Chỉ tài khoản quản trị/);
 assert.equal((await listCorrections(other)).length,0);
 const mine=await listCorrections(user);assert.equal(mine.length,1);assert.equal(mine[0].status,'pending');assert.equal(mine[0].operatingDate,date);assert.equal(mine[0].entries[0].value,'16117.499');
 await reviewCorrection(admin,pending.requestId,true,'Đã kiểm tra');assert.equal(await cellValue(c,date,'X16'),'16117.499');
 await assert.rejects(()=>reviewCorrection(admin,pending.requestId,true,''),/đã được xử lý/);
 const rejected=await saveReportWithShift(user,date,[{cell:'X16',value:'1'}],'Yêu cầu bị từ chối',afternoon);await reviewCorrection(admin,rejected.requestId,false,'Không phù hợp');assert.equal(await cellValue(c,date,'X16'),'16117.499');
 const stale=await saveReportWithShift(user,date,[{cell:'X16',value:'3'}],'Yêu cầu chờ duyệt',afternoon);await saveReportWithShift(admin,date,[{cell:'X16',value:'4'}],undefined,afternoon);await assert.rejects(()=>reviewCorrection(admin,stale.requestId,true,''),/đã thay đổi/);
 // Danh sách: chờ duyệt lên trước, rồi mới nhất trước.
 const listed=await listCorrections(user);assert.deepEqual(listed.map(r=>r.status),['pending','rejected','approved']);
 // Whole batch must rollback if one cell is outside the actor's shift.
 await assert.rejects(()=>saveReportWithShift(user,date,[{cell:'X17',value:'100'},{cell:'X16',value:'5'}],undefined,afternoon));assert.equal(await cellValue(c,date,'X17'),null);
 const audit=(await c.query("SELECT actor_id,source,action,old_value,new_value,old_note,new_note FROM public.ctktkt_daily_input_audit WHERE operating_date=$1 AND field_code='KTKT:X16' ORDER BY id",[date])).rows;
 assert.deepEqual(audit.map(a=>[a.actor_id,a.source.replace(/:.*/,''),a.action,a.old_value,a.new_value,a.old_note,a.new_note]),[
  ['test-corr-operator-a','ctktkt-report','insert',null,'16117.496',null,''],
  ['test-corr-operator-a','ctktkt-report','update','16117.496','16117.4960','',''],
  ['test-corr-admin','ctktkt-correction','update','16117.4960','16117.499','',''],
  ['test-corr-admin','ctktkt-report','update','16117.499','4','',''],
 ]);
 const owner=(await c.query("SELECT owner_id FROM public.ctktkt_input_ownership WHERE operating_date=$1 AND field_code='KTKT:X16'",[date])).rows;assert.deepEqual(owner,[{owner_id:'test-corr-operator-a'}]);
 assert.ok((await c.query("SELECT version FROM public.ctktkt_operational_read_versions WHERE cache_key='daily_inputs:2001-11'")).rows.length>0);
 // Hai lượt lưu CÙNG LÚC một ô phải xếp hàng (khoá theo ngày + ô): nhật ký lượt sau ghi giá trị cũ = giá trị lượt trước.
 const raceDate='2001-11-20';
 await Promise.all([saveReportWithShift(admin,raceDate,[{cell:'Y16',value:'10'}],undefined,afternoon),saveReportWithShift({...admin,id:'test-corr-admin-2'},raceDate,[{cell:'Y16',value:'20'}],undefined,afternoon)]);
 const race=(await c.query("SELECT action,old_value,new_value FROM public.ctktkt_daily_input_audit WHERE operating_date=$1 AND field_code='KTKT:Y16' ORDER BY id",[raceDate])).rows;
 assert.equal(race.length,2);assert.equal(race[0].action,'insert');assert.equal(race[0].old_value,null);assert.equal(race[1].action,'update');assert.equal(race[1].old_value,race[0].new_value);
 assert.equal(await cellValue(c,raceDate,'Y16'),race[1].new_value);
 }finally{await cleanupMonth(c,month).catch(()=>{});await c.end();await closeImplementationConnections();}
});
