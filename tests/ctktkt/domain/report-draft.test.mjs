import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acknowledgeReportDraft, mergeReportDraft, readReportDraft, reportDraftKey, writeReportDraft } from '../../../modules/ctktkt/lib/report-draft.ts';

const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};

test('reload restores zeros, decimal typing and intentional deletion for the same account/day only', () => {
  const storage = memoryStorage();
  const key = reportDraftKey('operator', '2026-11-07');
  const entered = { AJ91: '0', AK91: '0.00', I35: '8.', I36: '' };
  writeReportDraft(storage, key, entered);
  assert.deepEqual(readReportDraft(storage, key), entered);
  assert.deepEqual(readReportDraft(storage, reportDraftKey('other', '2026-11-07')), {});
  assert.deepEqual(readReportDraft(storage, reportDraftKey('operator', '2026-11-08')), {});
});

test('late server reads and save acknowledgement preserve edits made while requests were pending', () => {
  const sent = [{ cell: 'I35', value: '150' }, { cell: 'AJ91', value: '0' }, { cell: 'I36', value: '' }];
  const pending = { I35: '160', AJ91: '0', I36: '', AK91: '0' };
  assert.deepEqual(mergeReportDraft({ I35: '140', AJ91: '8.5', I36: '3000', W87: '10' }, pending), { ...pending, W87: '10' });
  assert.deepEqual(acknowledgeReportDraft(pending, sent), { I35: '160', AK91: '0' });
  assert.deepEqual(pending, { I35: '160', AJ91: '0', I36: '', AK91: '0' });
});

test('confirmed save removes the draft; a failed save can be restored again', () => {
  const storage = memoryStorage(), key = reportDraftKey('operator', '2026-11-07');
  const pending = { AJ91: '0' };
  writeReportDraft(storage, key, pending);
  assert.deepEqual(readReportDraft(storage, key), pending);
  writeReportDraft(storage, key, acknowledgeReportDraft(pending, [{ cell: 'AJ91', value: '0' }]));
  assert.equal(storage.getItem(key), null);
});

test('corrupt or unavailable browser storage is reported instead of silently discarding data', () => {
  const storage = memoryStorage();
  storage.setItem('bad', JSON.stringify({ values: { AJ91: 0 } }));
  assert.throws(() => readReportDraft(storage, 'bad'), /không hợp lệ/);
  storage.setItem('bad', '{');
  assert.throws(() => readReportDraft(storage, 'bad'));
  assert.throws(() => writeReportDraft({ ...storage, setItem: () => { throw new Error('quota'); } }, 'key', { AJ91: '0' }), /quota/);
});
