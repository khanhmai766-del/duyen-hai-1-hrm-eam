import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annualPlan } from '../../../modules/ctktkt/lib/annual-plan.ts';
const base = { year: 2026, closedMonth: 8, kind: 'material', target: 0.012, used: 52000, actualProduction: 4e9, future: [9,10,11,12].map(month => ({ month, production: 5e8, usage: null })) };
test('August example: 20000 kg remaining, 5000 kg/month, annual ratio achieved', () => {
  const r = annualPlan(base);
  assert.equal(r.annualAllowance, 72000); assert.equal(r.remaining, 20000);
  assert.equal(r.currentRate, 0.013); assert.equal(r.projectedRate, 0.012);
  assert.deepEqual(r.months.map(m => m.allowance), [5000,5000,5000,5000]); assert.ok(r.achieved);
});
test('Unequal production allocates proportionately, not equally', () => {
  const r = annualPlan({ ...base, future: base.future.map((m,i) => ({ ...m, production: [2e8,4e8,6e8,8e8][i] })) });
  assert.deepEqual(r.months.map(m => m.allowance), [2000,4000,6000,8000]);
});
test('Manual zero is not blank; overspending raises annual failure', () => {
  const zero = annualPlan({ ...base, future: base.future.map(m => ({ ...m, usage: 0 })) });
  assert.equal(zero.plannedRemaining, 0); assert.ok(zero.achieved);
  const over = annualPlan({ ...base, future: base.future.map(m => ({ ...m, usage: 6000 })) });
  assert.equal(over.balance, -4000); assert.equal(over.achieved, false);
});
test('Already above annual allowance remains impossible even with no future usage', () => {
  const r = annualPlan({ ...base, used: 80000 });
  assert.equal(r.remaining, -8000); assert.equal(r.feasible, false); assert.equal(r.achieved, false);
  assert.ok(r.months.every(m => m.allowance === 0));
});
test('Zero future production and year-end are handled without division by zero', () => {
  const r = annualPlan({ ...base, future: base.future.map(m => ({ ...m, production: 0 })) });
  assert.ok(r.months.every(m => m.allowance === 0)); assert.equal(r.achieved, false);
  const end = annualPlan({ ...base, closedMonth: 12, used: 48000, future: [] });
  assert.equal(end.projectedRate, 0.012); assert.ok(end.achieved);
});
test('Electricity uses percent and gross generation; mill balls use g/t conversion', () => {
  const electric = annualPlan({ ...base, kind: 'electricity', target: 8, used: 90000, actualProduction: 1e6, future: base.future.map(m => ({ ...m, production: 250000 })) });
  assert.equal(electric.remaining, 70000); assert.equal(electric.months[0].allowance, 17500); assert.equal(electric.projectedRate, 8);
  const balls = annualPlan({ ...base, target: 206.47, used: 25000, actualProduction: 100000, future: base.future.map(m => ({ ...m, production: 25000 })) });
  assert.equal(balls.annualAllowance, 41294); assert.equal(balls.remaining, 16294);
});
test('Reject missing/negative months, zero cumulative denominator, nonfinite and invalid electricity', () => {
  for (const change of [{ actualProduction: 0 }, { used: -1 }, { target: 0 }, { year: 2026.5 }, { closedMonth: 0 }, { future: [] }, { target: Infinity }, { kind: 'invalid' }]) assert.throws(() => annualPlan({ ...base, ...change }));
  assert.throws(() => annualPlan({ ...base, future: base.future.map(m => ({ ...m, production: NaN })) }));
  assert.throws(() => annualPlan({ ...base, kind: 'electricity', used: 5e9 }));
  assert.throws(() => annualPlan({ ...base, kind: 'electricity', future: base.future.map(m => ({ ...m, usage: 6e8 })) }));
});
test('Rounded allocations never exceed available quantity; unused capacity is allowed', () => {
  const r = annualPlan({ ...base, target: 0.0131234567 });
  assert.ok(r.plannedRemaining <= r.remaining); assert.ok(r.achieved);
  const e = annualPlan({ ...base, kind: 'electricity', target: 100, used: 0 });
  assert.ok(e.months.every(m => m.allowance <= m.production));
});
