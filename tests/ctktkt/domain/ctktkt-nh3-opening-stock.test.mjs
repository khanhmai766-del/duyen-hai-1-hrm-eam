import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyNh3StartLevelCarryover, deriveNh3OpeningStock, previousIsoDate, calculateNh3Summary } from '../../../modules/ctktkt/lib/ctktkt-report.ts';
import { canEditCtktktField } from '../../../modules/ctktkt/lib/ctktkt-permissions.ts';
import { shouldShowCtktktMissingField } from '../../../modules/ctktkt/lib/ctktkt-missing-fields.ts';
import { extractCtktktEmailMetrics } from '../../../modules/ctktkt/lib/ctktkt-email-report.ts';

test('NH3 00h uses prior explicit closing stock and overrides legacy manual P73 without modifying saved entries', () => {
  const current = { P73: '999', P74: '80', P72: '5' };
  const previous = { P74: '100', P69: '10', P70: '20', P71: '30' };
  const linked = applyNh3StartLevelCarryover(current, previous);
  assert.equal(linked.P73, '100');
  assert.equal(calculateNh3Summary(linked, null, null).usedTonnes, 25);
  assert.equal(current.P73, '999');
  assert.equal(previous.P74, '100');
});

test('NH3 00h uses the same tank-sum fallback as the prior-day closing stock display', () => {
  const previous = { P69: '10.1', P70: '20.2', P71: '30.3' };
  assert.equal(Number(deriveNh3OpeningStock(previous)), calculateNh3Summary(previous, null, null).stock24h);
});

test('missing prior stock clears stale P73 and remains incomplete, while zero is valid', () => {
  for (const previous of [undefined, {}, { P74: '', P69: '10', P70: '20' }]) {
    const linked = applyNh3StartLevelCarryover({ P73: '999' }, previous);
    assert.equal(linked.P73, '');
    assert.equal(calculateNh3Summary(linked, null, null).usedTonnes, null);
  }
  assert.equal(deriveNh3OpeningStock({ P74: '0' }), '0');
});

test('NH3 opening stock links across month and year boundaries', () => {
  for (const day of ['2026-10-01', '2027-01-01']) {
    const saved = { [previousIsoDate(day)]: { P74: '123.5' } };
    assert.equal(applyNh3StartLevelCarryover({}, saved[previousIsoDate(day)]).P73, '123.5');
  }
});

test('P73 is read-only for all roles and is excluded from manual missing warnings', () => {
  for (const role of ['admin', 'editor', 'supervisor', 'technician']) {
    assert.equal(canEditCtktktField({ role, position: 'Trưởng kíp điện', permissions: ['edit_daily_inputs'] }, 'P73'), false);
  }
  assert.equal(shouldShowCtktktMissingField('P73', '2026-10-05', {}), false);
});

test('Excel export explicitly sets P73 from prior closing stock and import cannot overwrite it', () => {
  const exportSource = readFileSync(new URL('../../../modules/ctktkt/lib/report-exports/ctktkt.ts', import.meta.url), 'utf8');
  const importSource = readFileSync(new URL('../../../modules/ctktkt/lib/ctktkt-history-import.ts', import.meta.url), 'utf8');
  assert.match(exportSource, /sheet\.getCell\(NH3_OPENING_STOCK_CELL\)\.value = numeric\(deriveNh3OpeningStock\(ktktCells\(previousRow\)\)\)/);
  assert.match(importSource, /cell !== NH3_OPENING_STOCK_CELL/);
});

test('email consumption uses linked opening stock rather than legacy manual P73', () => {
  const result = extractCtktktEmailMetrics({ P73: '999', P74: '80', P72: '5' }, { P74: '100' });
  assert.equal(result.nh3UsedTonnes, 25);
});
