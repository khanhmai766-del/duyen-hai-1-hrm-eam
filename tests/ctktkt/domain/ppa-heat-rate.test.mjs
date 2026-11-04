import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateActualHeatRate, calculatePpaHeatRate, compareHeatRate, parseMeterCsv } from '../../../modules/ctktkt/lib/ppa-heat-rate.ts';
import { normalizeQlktValue } from '../../../modules/ctktkt/lib/qlkt-sync.ts';
import { calculateDailyProduction } from '../../../modules/ctktkt/lib/daily-production-calculations.ts';

const source1409 = {
  grossS1: [218280,218120,218240,218200,218240,218280,222360,218240,222560,222560,218480,218400,218520,218480,218520,218280,218360,218560,218320,218440,218440,218400,218400,218480,218360,218680,218360,218280,218400,220320,230520,263400,301920,306840,304440,303560,303560,303440,303560,303560,303440,303560,303440,286880,253360,221160,218200,218240],
  netS1: [200236.59,199818.33,200000.94,199759.95,199862.96,199721.25,203909.94,199662.05,203713.14,203934.59,200406.26,200626.36,200476.91,199949.31,200458.46,200387.65,200474.28,200676.23,200551.83,200761.41,200864.39,200927.56,200716.12,201019.5,200401.37,200306.42,200098.96,200540.39,200651.68,202172.53,211855.99,243618.05,281130.74,285697.16,283403.28,282376.83,282047.04,281982.53,282014.12,282067.68,282273.42,282232.65,282391.01,266636.82,234250.91,202621.93,199678.03,199860.52],
  grossS2: [218200,218280,218280,218200,218280,218200,222640,218360,223080,222640,218160,218320,218240,218200,218240,218120,218080,218200,218120,218160,218240,218120,218200,218120,218200,218320,218080,218120,218080,220280,230640,263240,300240,303840,303600,303680,303480,303680,303720,303640,303760,303720,303640,287520,253720,221480,218200,218160],
  netS2: [200002.2,199913.25,199956.79,199863.06,199950.32,199941.02,204190.08,200048.6,204628.22,204356.82,200116.29,200259.54,200069.87,199902.6,199713.11,199676.44,199589.13,199664.96,199740.08,199845.14,199878.18,199981.64,199939.91,200025.32,199843.3,199969.74,199827.84,200007.75,199892.16,202128.27,211988.04,243160.68,278370.03,281631.6,281426.82,281077.12,280884.21,281081.02,281030.85,281068.12,281284.14,281117.14,281473.27,265819.61,234028.96,202863.21,199688.27,199868.12],
};

test('14/09/2026 reproduces the supplied workbook PPA results', () => {
  const result = calculatePpaHeatRate(source1409, 2026);
  assert.ok(Math.abs(result.ppaPlant - 10439.230679073466) < 1e-8);
  assert.ok(Math.abs(result.ppaS1 - 10438.751854637501) < 1e-8);
  assert.ok(Math.abs(result.ppaS2 - 10439.710781024767) < 1e-8);
  assert.equal(result.grossS1Kwh, 11598640);
  assert.ok(Math.abs(result.netS1Kwh - 10689226.07) < 1e-6);
});

test('PPA reports the exact unit whose point-of-sale total is zero', () => {
  const source = { ...source1409, netS2: Array(48).fill(0) };
  assert.throws(() => calculatePpaHeatRate(source, 2026), /Tổng sản lượng điểm bán S2 đang bằng 0/);
});

test('PPA keeps the running unit and plant result when S1 is stopped', () => {
  const source = { ...source1409, grossS1: Array(48).fill(0), netS1: Array(48).fill(0) };
  const result = calculatePpaHeatRate(source, 2026);
  assert.equal(result.ppaS1, 0);
  assert.equal(result.grossS1Kwh, 0);
  assert.equal(result.netS1Kwh, 0);
  assert.ok(Math.abs(result.ppaS2 - 10439.710781024767) < 1e-8);
  assert.ok(Math.abs(result.ppaPlant - result.ppaS2) < 1e-12);
});

test('actual heat rate keeps S2 and plant result when S1 is stopped', () => {
  const result = calculateActualHeatRate({ C: '0', I: '10.3966124', AE: '0', AF: '5445.67', AJ: '20035.72206', Q181: '10460.9417' });
  assert.ok(result);
  assert.equal(result.actualS1, null);
  assert.equal(result.actualS2, 10460.9417);
  assert.equal(result.actualPlant, 10460.9417);
});

test('actual heat rate uses moisture-adjusted coal instead of raw coal', () => {
  const result = calculateActualHeatRate({
    C: '0', I: '10.3966124', AE: '0', AF: '5445.67',
    AE_ADJ: '0', AF_ADJ: '5428.22308415293', AJ: '20035.72206',
  });
  assert.ok(result);
  assert.equal(result.actualS1, null);
  assert.ok(Math.abs(result.actualS2 - 10460.942931157468) < 1e-9);
  assert.ok(Math.abs(result.actualPlant - 10460.942931157468) < 1e-9);
});

test('official QLKT 02-PD Q181 overrides only the plant result when both units run', () => {
  const result = calculateActualHeatRate({ C: '10', I: '10', AE: '5000', AF: '5000', AJ: '20000', Q181: '10321.45' });
  assert.ok(result);
  assert.equal(result.actualS1, 10000);
  assert.equal(result.actualS2, 10000);
  assert.equal(result.actualPlant, 10321.45);
});

test('actual heat rate matches day 13 in the supplied workbook', () => {
  const result = calculateActualHeatRate({ C:'9.8225493', I:'9.8288261', AE:'5107.331', AF:'5248.583', AJ:'20142.988' });
  assert.ok(result);
  assert.ok(Math.abs(result.actualPlant - 10614.98434912833) < 0.02);
  assert.ok(Math.abs(result.actualS1 - 10473.544023363267) < 0.02);
  assert.equal(compareHeatRate(result.actualS1, 10524.777350017212).status, 'Đạt');
});

test('17/09/2026 actual heat rate matches QLKT report 02-PD', () => {
  const result = calculateActualHeatRate({
    C: '10.1665842', I: '10.1327348',
    AE: '5341.111', AF: '5349.818', AJ: '20021.593',
  });
  assert.ok(result);
  assert.ok(Math.abs(result.actualS1 - 10518.53292178734) < 1e-9);
  assert.ok(Math.abs(result.actualS2 - 10570.875556722753) < 1e-9);
  assert.ok(Math.abs(result.actualPlant - 10544.6606) < 0.0001);
});

test('06/08/2026 matches QLKT 02-PD and excludes HFO from its coal heat rate', () => {
  const values = {
    B: '6.48144', C: '5.950515', AE: '3143.891',
    H: '12.7798', I: '11.7849275', AF: '6263.388',
    AJ: '20192.79', CJ: '8.5', X: '206.3441',
  };
  const result = calculateActualHeatRate(values);
  assert.ok(result);
  assert.ok(Math.abs(result.actualS1 - 10668.64477207267) < 1e-9);
  assert.ok(Math.abs(result.actualS2 - 10731.952196780167) < 1e-9);
  assert.ok(Math.abs(result.actualPlant - 10710.711577588774) < 1e-9);
  assert.ok(Math.abs(calculateDailyProduction(values).V - 9862.25234296494) < 1e-9);
  assert.ok(Math.abs(calculateDailyProduction(values).W - 10710.711577588774) < 1e-9);
});

test('daily heat-rate columns use moisture-adjusted coal for each unit', () => {
  const result = calculateDailyProduction({
    B: '10', C: '9', H: '10', I: '9',
    AE: '1100', AF: '1200', AE_ADJ: '1000', AF_ADJ: '1100', AJ: '20000',
  });
  assert.ok(Math.abs(result.AG - 111.11111111111111) < 1e-12);
  assert.ok(Math.abs(result.AH - 122.22222222222223) < 1e-12);
  assert.ok(Math.abs(result.AI - 116.66666666666667) < 1e-12);
  assert.ok(Math.abs(result.AL - 2222.222222222222) < 1e-9);
  assert.ok(Math.abs(result.AM - 2444.4444444444446) < 1e-9);
  assert.ok(Math.abs(result.AN - 2200) < 1e-12);
  assert.ok(Math.abs(result.AO - 2400) < 1e-12);
  assert.ok(Math.abs(result.W - 2333.3333333333335) < 1e-9);
});

test('QLKT synchronization preserves source precision used by heat-rate calculations', () => {
  assert.equal(normalizeQlktValue('10.1665842'), '10.1665842');
  assert.equal(normalizeQlktValue('5341.111'), '5341.111');
  assert.equal(normalizeQlktValue('20021.593'), '20021.593');
});

test('daily web formulas use full QLKT precision and only the UI may round', () => {
  const result = calculateDailyProduction({
    B: '11.05364', C: '10.1665842', F: '24',
    H: '11.03056', I: '10.1327348', L: '24',
    AE: '5341.111', AF: '5349.818', AJ: '20021.593', CJ: '8.5',
  });
  assert.ok(Math.abs(result.AG - 525.3594417680621) < 1e-9);
  assert.ok(Math.abs(result.AH - 527.9737509758965) < 1e-9);
  assert.ok(Math.abs(result.W - 10544.660598214996) < 1e-9);
  assert.equal(new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(result.W), '10.544,66');
});

test('daily web adds received grid electricity to auxiliary MWh but not to auxiliary percentage', () => {
  const result = calculateDailyProduction({
    B: '10', C: '9', H: '10', I: '9',
    GRID_RECEIVE_S1: '5', GRID_RECEIVE_S2: '7',
  });
  assert.equal(result.D, 1005);
  assert.equal(result.E, 10);
  assert.equal(result.J, 1007);
  assert.equal(result.K, 10);
  assert.equal(result.P, 2012);
  assert.equal(result.Q, 10);
});

test('CSV parser accepts Vietnamese semicolon format and 48 intervals', () => {
  const headers = ['Tên điểm đo','Kênh','Ngày','Tổng',...Array.from({length:48},(_,i)=>`H${i+1}`)].join(';');
  const values = ['DHA_S1','kWhGiao','14/09/2026','4.800,00',...Array.from({length:48},()=> '100,00')].join(';');
  const rows = parseMeterCsv(`${headers}\n${values}`, 'test.csv');
  assert.equal(rows[0].operatingDate, '2026-09-14');
  assert.equal(rows[0].intervals.length, 48);
  assert.equal(rows[0].total, 4800);
});

test('CSV parser accepts QLKT compact files and infers meters from file codes', () => {
  const intervals = Array.from({length:48}, (_, index) => String(200000 + index));
  const csv = [
    ['12-09-26','KwhGiao',...intervals].join(','),
    ['12-09-26','KwhNhan',...Array.from({length:48}, () => '0')].join(','),
  ].join('\n');
  const expected = [
    ['12096001.CSV', 'DHA_S1'],
    ['12096002.CSV', 'DHA_S2'],
    ['12096301.CSV', 'DH1_283M'],
    ['12096303.CSV', 'DH1_285M'],
  ];
  for (const [fileName, meter] of expected) {
    const rows = parseMeterCsv(csv, fileName);
    assert.equal(rows[0].meter, meter);
    assert.equal(rows[0].channel, 'kWhGiao');
    assert.equal(rows[0].operatingDate, '2026-09-12');
    assert.equal(rows[0].intervals.length, 48);
    assert.equal(rows[0].total, intervals.reduce((sum, value) => sum + Number(value), 0));
  }
});

test('compact CSV reports a clear error when the meter file code is unknown', () => {
  const csv = ['12-09-26','KwhGiao',...Array.from({length:48}, () => '100')].join(',');
  assert.throws(() => parseMeterCsv(csv, 'unknown.CSV'), /Tên file phải kết thúc/);
});
