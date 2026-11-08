import test from 'node:test';
import assert from 'node:assert/strict';
import {REPORT_WRITABLE_FIELDS,REPORT_WRITABLE_CELLS} from '../../modules/ctktkt/lib/report-writable-fields.ts';
import {CTKTKT_BCSX_LINKED_CELLS} from '../../modules/ctktkt/lib/ctktkt-bcsx-link.ts';
import {NH3_DCS_START_METER_CELLS} from '../../modules/ctktkt/lib/ctktkt-report.ts';
import {canProposeCtktktCorrection} from '../../modules/ctktkt/lib/ctktkt-permissions.ts';

test('correction candidates exclude O4 and every BCSX/carryover cell rejected by API',()=>{
 assert.equal(REPORT_WRITABLE_CELLS.has('O4'),false);
 for(const cell of [...CTKTKT_BCSX_LINKED_CELLS,...NH3_DCS_START_METER_CELLS])assert.equal(REPORT_WRITABLE_CELLS.has(cell),false,cell);
 assert.equal(REPORT_WRITABLE_FIELDS.length,REPORT_WRITABLE_CELLS.size);
});
test('TKD can still propose the W8 and X16 counter corrections shown in the incident',()=>{
 const user={id:'tkd',username:'tkd',displayName:'TKĐ',role:'viewer',position:'Trưởng kíp điện',permissions:['view_all']};
 for(const cell of ['W8','X16']){
  assert.ok(REPORT_WRITABLE_CELLS.has(cell));assert.ok(canProposeCtktktCorrection(user,cell));
 }
});
