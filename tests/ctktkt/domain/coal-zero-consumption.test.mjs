import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateCoalShiftDetails, calculateCtktktSummary, createZeroCoalConsumptionCorrection } from '../../../modules/ctktkt/lib/ctktkt-report.ts';

function fixture(unit) {
  const current = {}, previous = {};
  const cols = unit === 'S1' ? ['X','Z','AB'] : ['AH','AJ','AL'];
  for (let row=16;row<=27;row++) {
    previous[`${cols[2]}${row}`]='100';
    for(const col of cols)current[`${col}${row}`]='100';
  }
  current[`${cols[1]}16`]='100.057';current[`${cols[2]}16`]='100.057';
  for(let row=87;row<=92;row++){current[`AJ${row}`]='0';current[`AK${row}`]='0';}
  return {current,previous};
}

for(const unit of ['S1','S2']) test(`${unit}: explicit no-consumption confirmation zeroes 0.057t residual, preserves meters and records a reason`,()=>{
  const {current,previous}=fixture(unit), original={...current};
  const index=unit==='S1'?1:4;
  const before=calculateCoalShiftDetails(current,previous)[index];
  assert.ok(Math.abs(before.rawCoalTonnes-0.057)<1e-9);
  assert.ok(Math.abs(before.adjustedCoalTonnes-0.057/0.915)<1e-9);
  const updates=createZeroCoalConsumptionCorrection(current,previous,unit,2);
  assert.deepEqual(current,original);
  assert.match(updates[`COAL_ADJ_NOTE_${unit}`],/không tiêu thụ than/);
  const corrected={...current,...updates};
  const after=calculateCoalShiftDetails(corrected,previous)[index];
  assert.equal(after.rawCoalTonnes,0);assert.equal(after.adjustedCoalTonnes,0);
  assert.equal(calculateCtktktSummary(corrected,previous)[unit.toLowerCase()].rawCoalTonnes,0);
  const col=unit==='S1'?'Z':'AJ';assert.equal(corrected[`${col}16`],'100.057');
});

test('existing adjustment is replaced with the total correction and its note is retained',()=>{
  const {current,previous}=fixture('S2');current.AI28='0.01';current.COAL_ADJ_NOTE_S2='Ghi chú trước';
  const update=createZeroCoalConsumptionCorrection(current,previous,'S2',2);
  assert.ok(update.COAL_ADJ_NOTE_S2.startsWith('Ghi chú trước | '));
  assert.equal(calculateCoalShiftDetails({...current,...update},previous)[4].rawCoalTonnes,0);
});

test('unknown readings and excessively long notes cannot be silently replaced by zero',()=>{
  const {current,previous}=fixture('S2');delete current.AJ20;
  assert.throws(()=>createZeroCoalConsumptionCorrection(current,previous,'S2',2),/Chưa đủ chỉ số/);
  const ready=fixture('S2');ready.current.COAL_ADJ_NOTE_S2='x'.repeat(490);
  assert.throws(()=>createZeroCoalConsumptionCorrection(ready.current,ready.previous,'S2',2),/500 ký tự/);
});
