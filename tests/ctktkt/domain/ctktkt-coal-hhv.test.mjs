import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateCtktktSummary, calculateCtktktMeterSummary } from '../../../modules/ctktkt/lib/ctktkt-report.ts';

// Reconstructed from the displayed 06/11/2026 shift totals; no production writes.
function fixture(unit = 's1') {
  const current = { J157: '14603.24', K157: '13567.0812', J158: '0', K158: '0' };
  const previous = {};
  const columns = unit === 's1' ? ['X', 'Z', 'AB'] : ['AH', 'AJ', 'AL'];
  const end = columns[2];
  for (let row = 16; row <= 27; row++) {
    previous[`${end}${row}`] = '0';
    for (const column of columns) current[`${column}${row}`] = '0';
  }
  [2419.79, 4806.25, 7286.33].forEach((value, i) => { current[`${columns[i]}16`] = String(value); });
  previous[`${end}8`] = '0'; previous[`${end}9`] = '0';
  current[`${end}8`] = '14583'; current[`${end}9`] = '13543.7';
  const rows = unit === 's1' ? [87, 88, 89] : [90, 91, 92];
  rows.forEach((row, i) => { current[`AJ${row}`] = String([7.5, 9.27, 8.23][i]); current[`AK${row}`] = String([5222, 5218, 5218][i]); });
  return { current, previous };
}

const masses = [2419.79, 2386.46, 2480.08];
const moistures = [7.5, 9.27, 8.23];
const dry = [5222, 5218, 5218];
const adjusted = masses.reduce((t, m, i) => t + m * (100 - moistures[i]) / 91.5, 0);
const expectedHhv = masses.reduce((t, m, i) => t + m * dry[i] * (1 - moistures[i] / 100), 0) / adjusted * 4.1868;
const near = (actual, expected) => { assert.notEqual(actual, null); assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`); };

test('complete S1 keeps its measured HHV and both heat rates when S2 shifts are missing', () => {
  const { current, previous } = fixture();
  // S2 daily end reading is known but the two intermediate readings are absent.
  for (let row = 16; row <= 27; row++) { previous[`AL${row}`] = '100'; current[`AL${row}`] = '100'; }
  for (const row of [90, 91, 92]) { current[`AJ${row}`] = '0'; current[`AK${row}`] = '0'; }
  for (const [calculate, net] of [[calculateCtktktSummary, 13567.0812], [calculateCtktktMeterSummary, 13543.7]]) {
    const result = calculate(current, previous);
    near(result.s1.adjustedCoalTonnes, adjusted);
    near(result.s1.hhvKjKg, expectedHhv);
    near(result.s1.netHeatRate, adjusted / net * expectedHhv);
    assert.equal(result.s2.hhvKjKg, null);
    assert.equal(result.s2.netHeatRate, null);
    assert.equal(result.plant.hhvKjKg, null);
    assert.equal(result.plant.netHeatRate, null);
  }
});

test('fallback is symmetric for complete S2 when S1 is incomplete', () => {
  const { current, previous } = fixture('s2');
  current.J158 = '14603.24'; current.K158 = '13567.0812';
  for (const calculate of [calculateCtktktSummary, calculateCtktktMeterSummary]) {
    const result = calculate(current, previous);
    near(result.s2.hhvKjKg, expectedHhv);
    assert.equal(result.s1.hhvKjKg, null);
    assert.equal(result.plant.hhvKjKg, null);
  }
});

for (const [label, change] of [
  ['missing dry HHV', c => { delete c.AK88; }],
  ['zero dry HHV on a consuming shift', c => { c.AK88 = '0'; }],
  ['missing moisture', c => { delete c.AJ88; }],
  ['missing coal reading', c => { delete c.X20; }],
]) test(`${label} leaves HHV and heat rate unavailable`, () => {
  const { current, previous } = fixture(); change(current);
  for (const calculate of [calculateCtktktSummary, calculateCtktktMeterSummary]) {
    const result = calculate(current, previous);
    assert.equal(result.s1.hhvKjKg, null);
    assert.equal(result.s1.netHeatRate, null);
    assert.equal(result.plant.hhvKjKg, null);
  }
});

test('complete two-unit data retains the existing common weighted HHV convention', () => {
  const { current, previous } = fixture();
  const s2 = fixture('s2'); Object.assign(previous, s2.previous);
  for (const [cell, value] of Object.entries(s2.current)) if (!['J157', 'K157', 'J158', 'K158'].includes(cell)) current[cell] = value;
  for (const row of [90, 91, 92]) current[`AK${row}`] = '6000';
  const energyS1 = expectedHhv * adjusted;
  const energyS2 = masses.reduce((t, m, i) => t + m * 6000 * (1 - moistures[i] / 100), 0) * 4.1868;
  for (const calculate of [calculateCtktktSummary, calculateCtktktMeterSummary]) {
    const result = calculate(current, previous);
    near(result.plant.hhvKjKg, (energyS1 + energyS2) / (2 * adjusted));
    assert.equal(result.s1.hhvKjKg, result.plant.hhvKjKg);
    assert.equal(result.s2.hhvKjKg, result.plant.hhvKjKg);
  }
});

test('missing previous-day readings never produce an HHV', () => {
  const { current } = fixture();
  for (const calculate of [calculateCtktktSummary, calculateCtktktMeterSummary]) assert.equal(calculate(current).s1.hhvKjKg, null);
});
