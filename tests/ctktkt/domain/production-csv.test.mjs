import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCsvProduction } from '../../../modules/ctktkt/lib/production-csv.ts';
import { deriveDailyValuesFromCtktkt } from '../../../modules/ctktkt/lib/daily-source-links.ts';
import { calculateCtktktSummary } from '../../../modules/ctktkt/lib/ctktkt-report.ts';

const csv = (code, date = '18/11/2026', values = Array(48).fill(200000)) => ({
  name: `Meter_${code}.csv`, text: `${date};KwhGiao;${values.join(';')}`,
});
const files = () => [csv('6001'), csv('6303'), csv('6002'), csv('6301')];

test('CSV keeps grid imports separate from generation and auxiliary percentage', () => {
  const date = '14/11/2026';
  const meter = (code, kwh) => csv(code, date, Array(48).fill(kwh));
  const stoppedPointOfSale = meter('6301', 0);
  stoppedPointOfSale.text += `\n${date};KwhNhan;${Array(48).fill(1_500).join(';')}`;
  const result = calculateCsvProduction([meter('6001', 10_000), meter('6303', 9_000), meter('6002', 0), stoppedPointOfSale]);
  assert.deepEqual(result.gridReceived, [{ cell: 'GRID_RECEIVE_S2', label: 'Điện nhận lưới S2', value: '72' }]);
  const current = Object.fromEntries([...result.entries, ...result.gridReceived].map(({ cell, value }) => [cell, value]));
  const summary = calculateCtktktSummary(current);
  assert.equal(summary.s2.grossMwh, 0);
  assert.equal(summary.s2.netMwh, 0);
  assert.equal(summary.s2.auxiliaryPercent, null);
  assert.equal(summary.plant.auxiliaryMwh, 48);
  assert.equal(summary.plant.auxiliaryPercent, 10);
});

test('daily ZIP input can include other compact meters without treating them as production', () => {
  const extra = { name: '18116102.CSV', text: `18-11-26,KwhGiao,${Array(48).fill(0).join(',')}` };
  const result = calculateCsvProduction([extra, ...files()]);
  assert.deepEqual(result.sourceFiles, files().map(file => file.name));
  assert.throws(() => calculateCsvProduction([extra]), /6001/);
  assert.equal(calculateCsvProduction([extra, ...files().slice(1)]).entries[0].defaulted, true);
  const day11 = ['6201', '6001', '6202', '6103', '6303', '6306'].map(code => ({
    name: `1111${code}.CSV`, text: `11-11-26,KwhGiao,${Array(48).fill(0).join(',')}`,
  }));
  const partial = calculateCsvProduction(day11);
  assert.equal(partial.operatingDate, '2026-11-11');
  assert.deepEqual(partial.entries.map(e => [e.cell, e.value, e.defaulted]), [
    ['J157', '0', false], ['K157', '0', false], ['J158', '0', true], ['K158', '0', true],
  ]);
  assert.equal(calculateCsvProduction([...day11, csv('6002', '11/11/2026'), csv('6301', '11/11/2026')]).sourceFiles.length, 4);
});

test('sums 48 energy intervals and converts kWh to MWh without power factor', () => {
  const result = calculateCsvProduction(files());
  assert.equal(result.operatingDate, '2026-11-18');
  assert.deepEqual(result.entries.map(e => [e.cell, e.meter, e.kwh, e.value]), [
    ['J157', 'DHA_S1', 9600000, '9600'], ['K157', 'DH1_285M', 9600000, '9600'],
    ['J158', 'DHA_S2', 9600000, '9600'], ['K158', 'DH1_283M', 9600000, '9600'],
  ]);
});
test('a CSV zero is retained and distinguished from a missing file', () => {
  const input = files(); input[0] = csv('6001', '18/11/2026', Array(48).fill(0));
  const result = calculateCsvProduction(input);
  assert.equal(result.entries[0].value, '0');
  assert.equal(result.entries[0].defaulted, false);
  const missing = calculateCsvProduction(input.slice(1)).entries[0];
  assert.equal(missing.value, '0');
  assert.equal(missing.defaulted, true);
});
test('saved CSV cells feed the existing daily table and CTKTKT production summary', () => {
  const input = files(); input[1] = csv('6303', '18/11/2026', Array(48).fill(180000));
  const cells = Object.fromEntries(calculateCsvProduction(input).entries.map(e => [e.cell, e.value]));
  const daily = deriveDailyValuesFromCtktkt(cells);
  assert.equal(Number(daily.B), 9.6);
  assert.equal(Number(daily.C), 8.64);
  const summary = calculateCtktktSummary(cells);
  assert.equal(summary.s1.grossMwh, 9600);
  assert.equal(summary.s1.netMwh, 8640);
});
test('rejects mixed dates before deduplicating meters', () => {
  assert.throws(() => calculateCsvProduction([...files(), csv('6001', '17/11/2026')]), /nhiều ngày/);
});
test('identical duplicates do not double count; conflicting duplicates fail', () => {
  assert.equal(calculateCsvProduction([...files(), csv('6001')]).entries[0].kwh, 9600000);
  const extraDot = { ...csv('6001'), name: '18116001..csv' };
  assert.equal(calculateCsvProduction([...files(), extraDot]).entries[0].kwh, 9600000);
  assert.throws(() => calculateCsvProduction([...files(), { ...extraDot, text: csv('6001', '18/11/2026', Array(48).fill(100)).text }]), /trùng/);
});
test('rejects missing intervals, negative energy, invalid calendar dates', () => {
  for (const values of [Array(47).fill(1), [...Array(47).fill(1), -1], [...Array(47).fill(1), 'bad']]) {
    const input = files(); input[0] = csv('6001', '18/11/2026', values);
    assert.throws(() => calculateCsvProduction(input));
  }
  assert.throws(() => calculateCsvProduction(files().map(f => ({...f, text: f.text.replace('18/11', '31/11')}))), /Ngày/);
});
test('full-format CSV rejects a reported total that differs from interval sum', () => {
  const header = ['Tên điểm đo', 'Kênh', 'Ngày', 'Tổng', ...Array.from({length: 48}, (_, i) => `H${i+1}`)].join(';');
  const rows = ['DHA_S1','DH1_285M','DHA_S2','DH1_283M'].map(m => [m,'kWhGiao','18/11/2026',48,...Array(48).fill(1)].join(';'));
  const result = calculateCsvProduction([{name:'meters.csv', text: [header,...rows].join('\n')}]);
  assert.equal(result.entries[0].value, '0.048');
  assert.throws(() => calculateCsvProduction([{name:'meters.csv', text: [header,...rows].join('\n').replace(';48;', ';49;')}]), /khớp/);
});
