import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { calculatePpaHeatRate, calculatePpaHeatRateDetailed, calculateActualHeatRate, compareHeatRate, displayPpaRate, stoppedPpaDays, zeroPpaSource } from '../../../modules/ctktkt/lib/ppa-heat-rate.ts';
import { calculateDailyProduction } from '../../../modules/ctktkt/lib/daily-production-calculations.ts';
import { pmisShutdownEntries } from '../../../modules/ctktkt/lib/pmis-shutdown-sync.ts';
import { guardExportZeroDivisions } from '../../../modules/ctktkt/lib/export-zero-division.ts';
import { validateQlktSyncPayload } from '../../../modules/ctktkt/lib/qlkt-sync.ts';

test('both stopped can be persisted with real zero meter totals, not an invalid day',()=>{
  const result=calculatePpaHeatRate(zeroPpaSource(),2026);
  assert.equal(result.netS1Kwh+result.netS2Kwh,0);
  assert.equal(result.ppaPlant,0);
  assert.equal(calculatePpaHeatRateDetailed(zeroPpaSource(),2026).ppaPlant,0);
  assert.equal(displayPpaRate(result.ppaPlant,0),null);
  assert.equal(compareHeatRate(null,0,0).status,'Ngừng máy — không đánh giá');
  const malformed=zeroPpaSource();malformed.grossS1[0]=10;
  assert.throws(()=>calculatePpaHeatRate(malformed,2026),/điểm bán S1/);
  malformed.grossS1=[];
  assert.throws(()=>calculatePpaHeatRate(malformed,2026),/48 giá trị/);
});

test('shutdown retains auxiliary grid imports and chemical use, not undefined ratios',()=>{
  const result=calculateDailyProduction({B:'0',C:'0',H:'0',I:'0',F:'0',L:'0',GRID_RECEIVE_S1:'10',GRID_RECEIVE_S2:'20',BN:'2',BQ:'0.2',BR:'0.3'});
  assert.equal(result.P,30);assert.equal(result.BS,0.5);
  for(const code of ['E','K','Q','U','V','W','BO','BP','BT','BU','BV','BW','BX','BY'])assert.equal(result[code],null,code);
  assert.ok(Object.values(result).every(v=>v===null||Number.isFinite(v)));
  assert.equal(calculateActualHeatRate({C:'0',I:'0',AE:'0',AF:'0',AJ:'20000'}),null);
});

test('shutdown display days require all four explicit zero production values',()=>{
  const days=stoppedPpaDays(new Map([
    ['2026-10-29',{B:'1',C:'.9',H:'0',I:'0'}],
    ['2026-10-30',{B:'0',C:'0',H:'0',I:''}],
    ['2026-10-31',{B:'0',C:'0',H:'0',I:'0'}],
  ]));
  assert.deepEqual(days.map(d=>d.operatingDate),['2026-10-31']);
  assert.equal(displayPpaRate(10000,100),10000);
  assert.equal(compareHeatRate(10000,10100,100).status,'Đạt');
});

test('PMIS confirmed shutdown invalidates only that unit heat-rate fields; import electricity is untouched',()=>{
  const payload=validateQlktSyncPayload({version:1,operatingDate:'2026-10-31',sourcePage:'QLKT',entries:[],unavailableHeatRateUnits:['1','2']});
  assert.ok(payload);
  const entries=pmisShutdownEntries(payload);
  const stored=new Map([['DA','600'],['DB','600'],['GRID_RECEIVE_S1','10'],['KTKT:J157','0']]);
  for(const entry of entries){assert.equal(entry.value,'');stored.delete(entry.fieldCode);}
  assert.equal(entries.length,8);assert.equal(stored.get('GRID_RECEIVE_S1'),'10');assert.equal(stored.get('KTKT:J157'),'0');
  assert.deepEqual(pmisShutdownEntries({...payload,unavailableHeatRateUnits:['1']}).map(e=>e.fieldCode),['DA','DC','DE','DG']);
  assert.deepEqual(pmisShutdownEntries({...payload,unavailableHeatRateUnits:[]}),[]);
});

test('export roundtrip preserves zero-division protection without converting other errors or changing original arithmetic',async()=>{
  const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('31');
  sheet.getCell('A1').value=0;sheet.getCell('B1').value={formula:'10/A1'};
  sheet.getCell('C1').value={formula:'SUM(A1,10)'};
  guardExportZeroDivisions(workbook);const first=sheet.getCell('B1').formula;
  guardExportZeroDivisions(workbook);assert.equal(sheet.getCell('B1').formula,first);
  assert.equal(first,'IFERROR(10/A1,IF(ERROR.TYPE(10/A1)=2,"",10/A1))');
  const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(reopened.getWorksheet('31').getCell('B1').formula,first);
  assert.equal(reopened.getWorksheet('31').getCell('C1').formula,'SUM(A1,10)');
});
