import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { calculateCtktktSummary, ctktktMetricDisplay } from '../../../modules/ctktkt/lib/ctktkt-report.ts';
import { applyShutdownExportRules } from '../../../modules/ctktkt/lib/shutdown-export-rules.ts';
test('stopped unit receipt remains separate, symmetric for either stopped unit',()=>{
 for(const stopped of [1,2]){
  const running=stopped===1?2:1;
  const c={};c[stopped===1?'J157':'J158']='0';c[stopped===1?'K157':'K158']='0';
  c[running===1?'J157':'J158']='14000';c[running===1?'K157':'K158']='13000';c['GRID_RECEIVE_S'+stopped]='100';
  const result=calculateCtktktSummary(c);
  assert.equal(result['s'+stopped].auxiliaryMwh,100);
  assert.equal(result.plant.auxiliaryMwh,1000);
  assert.equal(result.plant.auxiliaryPercent,1000/14000*100);
 }
});
test('both stopped keep receipts separate and do not generate efficiency',()=>{
 const r=calculateCtktktSummary({J157:'0',K157:'0',J158:'0',K158:'0',GRID_RECEIVE_S1:'100',GRID_RECEIVE_S2:'200'});
 assert.equal(r.s1.auxiliaryMwh,100);assert.equal(r.s2.auxiliaryMwh,200);assert.equal(r.plant.auxiliaryMwh,0);
 assert.equal(r.plant.netHeatRate,null);assert.equal(r.plant.auxiliaryPercent,null);
 assert.match(ctktktMetricDisplay(r.plant,'netHeatRate'),/Ngừng máy/);
 assert.match(ctktktMetricDisplay(calculateCtktktSummary({}).plant,'netHeatRate'),/Thiếu dữ liệu/);
});
test('export boundary and adjusted-coal summary formulas stay dynamic and preserve source readings',()=>{
 const b=new ExcelJS.Workbook(),s=b.addWorksheet('06');s.getCell('AL10').value=100;s.getCell('H27').value={formula:'(H20-H21)/H20*100'};
 applyShutdownExportRules(b);assert.equal(s.getCell('AL10').value,100);
 assert.match(s.getCell('I25').formula,/IF\(H20>0,H25,0\)/);
 assert.match(s.getCell('I169').formula,/AR94/);assert.match(s.getCell('K169').formula,/AT87/);
 assert.match(s.getCell('H27').formula,/ERROR.TYPE/);
});
