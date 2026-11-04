import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {waterMeterUsage,normalizeWaterAdjustment,waterAdjustmentsFromRow} from '../../../modules/ctktkt/lib/water-report/adjustments.ts';
import {recalculateWaterShiftChain,calculateDailyWaterUsages} from '../../../modules/ctktkt/lib/water-report/calculations.ts';

test('explicit reset correction replaces automatic rollover; zero and null have distinct meanings',()=>{
  assert.equal(waterMeterUsage(100,24900,null,25000),200);
  assert.equal(waterMeterUsage(100,24900,25000,25000),200);
  assert.equal(waterMeterUsage(100,24900,0,25000),-24800);
  assert.equal(waterMeterUsage(0,24900,25000,25000),100);
  assert.equal(waterMeterUsage(0,24900,null,25000),0);
  assert.equal(waterMeterUsage(50,9950,10000),100);
  assert.equal(waterMeterUsage(100,0,25000),0,'no previous reading means no guessed consumption');
  for(const bad of [-1,Infinity,NaN,'bad',true,{},1000000001])assert.throws(()=>normalizeWaterAdjustment(bad));
  assert.equal(normalizeWaterAdjustment(''),null);assert.equal(normalizeWaterAdjustment(0),0);
  assert.equal(waterAdjustmentsFromRow({water_adjustment_s1:25000}).waterAdjustmentS1,25000);
});

test('a reset belongs only to its shift; daily totals include its correction once',()=>{
  const base={shiftTeam:'A',shiftLeader:'Synthetic',elecRecS1:1000,elecRecS2:1000,elecGenS1:0,elecGenS2:0,waterRecS1:24900,waterRecS2:24900,waterUsedS1:0,waterUsedS2:0,waterRatioS1:0,waterRatioS2:0,condenserRecS1:9950,condenserRecS2:9950,condenserUsedS1:0,condenserUsedS2:0,resinWaterS1_24h:0,resinWaterS2_24h:0};
  const readings=[{...base,logDate:'2026-09-30',shiftTime:'22h00'},
    {...base,logDate:'2026-10-01',shiftTime:'06h00',elecRecS1:1100,waterRecS1:100,waterAdjustmentS1:25000,condenserRecS1:50,condenserAdjustmentS1:10000},
    {...base,logDate:'2026-10-01',shiftTime:'22h00',elecRecS1:1200,waterRecS1:250,condenserRecS1:200}];
  const chain=recalculateWaterShiftChain(readings);
  assert.equal(chain[1].waterUsedS1,200);assert.equal(chain[1].waterRatioS1,2);
  assert.equal(chain[1].condenserUsedS1,100);assert.equal(chain[2].waterUsedS1,150);
  assert.equal(chain[2].condenserUsedS1,150);
  assert.equal(calculateDailyWaterUsages(readings).get('2026-10-01').totalWaterUsedS1,350);
});
