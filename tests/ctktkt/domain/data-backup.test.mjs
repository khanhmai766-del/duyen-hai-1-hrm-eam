import test from 'node:test';
import assert from 'node:assert/strict';
import {BACKUP_TABLES,backupRange,createDataBackup,validateDataBackup} from '../../../modules/ctktkt/lib/data-backup.ts';

const emptyTables=()=>Object.fromEntries(BACKUP_TABLES.map(table=>[table.name,[]]));
const makeFile=(overrides={},range=null)=>createDataBackup({...emptyTables(),...overrides},range);
const day=(value='10')=>({id:90,operating_date:'2026-11-01',field_code:'KTKT:TEST',value,note:'Synthetic',updated_at:'2026-11-01 08:00:00'});

test('backup validates real date ranges, checksum and allowlisted tables',()=>{
  assert.equal(backupRange(null,null),null);
  assert.throws(()=>backupRange('2026-02-29','2026-03-01'));
  assert.throws(()=>backupRange('2026-11-02','2026-11-01'));
  const good=makeFile({daily_inputs:[day()]});assert.deepEqual(validateDataBackup(good),good);
  const corrupt=structuredClone(good);corrupt.tables.daily_inputs[0].value='999';assert.throws(()=>validateDataBackup(corrupt),/thay đổi|hỏng/);
  assert.throws(()=>validateDataBackup(makeFile({users:[]})),/bảng/);
  assert.throws(()=>validateDataBackup(makeFile({daily_inputs:[day(),day()]})),/trùng lặp/);
  assert.throws(()=>validateDataBackup(makeFile({daily_inputs:[day()]},{from:'2026-10-01',to:'2026-10-31'})),/khoảng/);
});

// Tải / xem trước / nạp / hoàn tác / gói nhiều phần: kiểm trên DB dev THẬT qua route thật ở
// tests/ctktkt/data-backup-db.test.mjs (giai đoạn 4 — Prisma, bỏ SQLite + getRawDb giả).
