// Sao lưu / khôi phục dữ liệu vận hành chạy trên DB dev THẬT, qua route thật (chỉ giả lập đăng nhập/quyền và quét tệp).
// Dùng được cho cả bản SQL cũ (getRawDb) lẫn bản Prisma để so hai bản (giai đoạn 4).
// Dữ liệu thử: tháng 2001-11, mã ô 'TEST-BK-%', trưởng ca 'test-backup-%', id 1019900+ (hoá chất, sự kiện, chỉ tiêu kỳ).
// Dọn trước và sau; trả bộ đếm id (sequence) về như cũ để không lệch hợp đồng API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import JSZip from 'jszip';
import { testClient, closeImplementationConnections } from './helpers/corrections-db.mjs';
import { BACKUP_TABLES, createDataBackup, validateDataBackup } from '../../modules/ctktkt/lib/data-backup.ts';
import { isCtktktSameOrigin } from '../../modules/ctktkt/lib/request-origin.ts';

const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url);
const SERIAL = ['operating_events', 'chemical_usage_logs', 'measurements'];

function loadRoute(path, user) {
  const deps = {
    '@/modules/ctktkt/lib/request-origin': { isCtktktSameOrigin },
    '@/lib/upload-guard': { inspectUpload: async () => {} },
    '@/modules/ctktkt/lib/auth/server': { requirePermission: async () => user ? { ok: true, user } : { ok: false, response: Response.json({ error: 'Forbidden' }, { status: 403 }) } },
  };
  const source = readFileSync(new URL(path, root), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  const local = name => { const base = fileURLToPath(new URL(name.slice(2), root)); return [base, base + '.ts', base + '/index.ts'].find(p => /\.(ts|json)$/.test(p) && existsSync(p)); };
  const resolve = name => deps[name] ?? require(name.startsWith('@/') ? local(name) : name);
  vm.runInThisContext('(function(exports,require,module){' + code + '\n})')(mod.exports, resolve, mod);
  return mod.exports;
}
/** Route trả phong bì chung {data, meta, error}: lỗi → {error}, thành công → data (giai đoạn 4). */
const unwrap = envelope => envelope.error ? { error: envelope.error } : envelope.data;
const admin = { id: 'test-backup-admin', role: 'admin', permissions: [] };
const emptyTables = () => Object.fromEntries(BACKUP_TABLES.map(t => [t.name, []]));
const makeFile = (tables = {}, range = null) => createDataBackup({ ...emptyTables(), ...tables }, range);
const day = (value, field = 'TEST-BK-A', extra = {}) => ({ id: 1, operating_date: '2001-11-05', field_code: field, value, note: 'Ghi chú thử', updated_at: '2001-11-05 08:00:00', ...extra });

async function sequences(c) {
  const out = {};
  for (const t of SERIAL) out[t] = (await c.query(`SELECT last_value::bigint AS v, is_called FROM public.ctktkt_${t}_id_seq`)).rows[0];
  return out;
}
async function restoreSequences(c, saved) {
  for (const t of SERIAL) await c.query(`SELECT setval('public.ctktkt_${t}_id_seq', $1, $2)`, [saved[t].v, saved[t].is_called]);
}
async function cleanup(c) {
  await c.query("DELETE FROM public.ctktkt_daily_inputs WHERE operating_date LIKE '2001-11-%' OR field_code LIKE 'TEST-BK-%'");
  await c.query("DELETE FROM public.ctktkt_shift_readings WHERE operating_date LIKE '2001-11-%'");
  await c.query("DELETE FROM public.ctktkt_operating_events WHERE operating_date LIKE '2001-11-%' OR id >= 1019900 AND id < 1020000");
  await c.query("DELETE FROM public.ctktkt_ppa_heat_rate_daily WHERE operating_date LIKE '2001-11-%'");
  await c.query("DELETE FROM public.ctktkt_water_shift_logs WHERE log_date LIKE '2001-11-%'");
  await c.query("DELETE FROM public.ctktkt_chemical_usage_logs WHERE usage_date LIKE '2001-11-%' OR id >= 1019900 AND id < 1020000");
  await c.query("DELETE FROM public.ctktkt_measurements WHERE period LIKE '2001-11%' OR id >= 1019900 AND id < 1020000");
  await c.query("DELETE FROM public.ctktkt_water_shift_leaders WHERE name LIKE 'test-backup-%'");
  await c.query("DELETE FROM public.ctktkt_data_restore_audit WHERE actor_id LIKE 'test-backup-%'");
}

test('sao lưu / khôi phục trên DB thật', async t => {
  const c = await testClient(), saved = await sequences(c);
  const json = loadRoute('modules/ctktkt/server/routes/admin/data-backup/route.ts', admin);
  const archive = loadRoute('modules/ctktkt/server/routes/admin/data-backup/archive/route.ts', admin);
  const post = async (file, action = 'preview', mode = 'missing', body = {}) => {
    const res = await json.POST(new Request('https://test.local/api/admin/data-backup', { method: 'POST', headers: { origin: 'https://test.local', 'content-type': 'application/json' }, body: JSON.stringify({ file, action, mode, confirmed: true, ...body }) }));
    return { status: res.status, body: unwrap(await res.json()) };
  };
  const value = async (field = 'TEST-BK-A') => (await c.query("SELECT id,value,note FROM public.ctktkt_daily_inputs WHERE operating_date='2001-11-05' AND field_code=$1", [field])).rows[0] ?? null;
  const versions = async () => Object.fromEntries((await c.query("SELECT cache_key,version FROM public.ctktkt_operational_read_versions")).rows.map(r => [r.cache_key, Number(r.version)]));
  try {
    await cleanup(c);

    await t.test('tải sao lưu theo khoảng ngày: đúng bảng, đúng dòng, đúng thứ tự khoá; không có tài khoản/bí mật', async () => {
      await c.query(`INSERT INTO public.ctktkt_daily_inputs(operating_date,field_code,value,note,updated_at) VALUES
        ('2001-10-31','TEST-BK-OLD','1','','2001-10-31 00:00:00'),('2001-11-02','TEST-BK-B','0.080','ghi chú tiếng Việt','2001-11-02 01:02:03'),('2001-11-01','TEST-BK-A','5','','2001-11-01 00:00:00')`);
      await c.query(`INSERT INTO public.ctktkt_water_shift_logs(log_date,shift_time,water_rec_s1,water_adjustment_s1,water_adjustment_s2,updated_at) VALUES ('2001-11-01','22h00',12.5,0,NULL,'2001-11-01 22:00:00')`);
      await c.query(`INSERT INTO public.ctktkt_measurements(id,metric_code,metric_name,period,actual,limit_value,note,created_at) VALUES (1019901,'HR','Thử','2001-11','10','9','','2001-11-01 00:00:00'),(1019902,'HR','Thử','2001-10','11','9','','2001-10-01 00:00:00')`);
      const res = await json.GET(new Request('https://test.local/api/admin/data-backup?from=2001-11-01&to=2001-11-30'));
      assert.equal(res.status, 200); assert.match(res.headers.get('cache-control'), /no-store/); assert.match(res.headers.get('content-disposition'), /attachment; filename="ctktkt-backup-2001-11-01_2001-11-30-/);
      const file = validateDataBackup(JSON.parse(await res.text()));
      assert.deepEqual(file.range, { from: '2001-11-01', to: '2001-11-30' });
      assert.deepEqual(file.tables.daily_inputs.map(r => [r.operating_date, r.field_code, r.value, r.note, r.updated_at]), [['2001-11-01', 'TEST-BK-A', '5', '', '2001-11-01 00:00:00'], ['2001-11-02', 'TEST-BK-B', '0.080', 'ghi chú tiếng Việt', '2001-11-02 01:02:03']]);
      assert.deepEqual(Object.keys(file.tables.daily_inputs[0]), ['id', 'operating_date', 'field_code', 'value', 'note', 'updated_at']);
      const water = file.tables.water_shift_logs[0];
      assert.deepEqual([water.log_date, water.shift_time, water.water_rec_s1, water.water_adjustment_s1, water.water_adjustment_s2, water.elec_rec_s1], ['2001-11-01', '22h00', 12.5, 0, null, 0]);
      assert.deepEqual(Object.keys(water), (await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='ctktkt_water_shift_logs' ORDER BY ordinal_position")).rows.map(r => r.column_name));
      assert.deepEqual(file.tables.measurements.map(r => [r.id, r.period]), [[1019901, '2001-11']]);
      assert.ok(file.tables.water_shift_leaders.length >= 2); // trưởng ca không theo ngày → luôn có cả danh sách
      assert.deepEqual(file.tables.water_shift_leaders.map(r => r.name), [...file.tables.water_shift_leaders.map(r => r.name)].sort());
      await cleanup(c);
    });

    await t.test('xem trước không ghi; cột lạ / ô bắt buộc trống / sai kiểu bị chặn trước khi ghi', async () => {
      const before = await versions();
      const preview = await post(makeFile({ daily_inputs: [day('1')] }));
      assert.equal(preview.status, 200); assert.equal(preview.body.total, 1); assert.deepEqual(preview.body.tables.find(r => r.name === 'daily_inputs'), { name: 'daily_inputs', label: 'KTKT / PMIS và dữ liệu ngày', count: 1 });
      for (const [row, message] of [[{ ...day('1'), unexpected: 'x' }, /cột chưa được hỗ trợ/], [{ ...day('1'), value: null }, /bắt buộc bị trống/], [{ ...day('1'), id: '9' }, /Kiểu số/], [{ ...day('1'), field_code: null }, /khóa nhận diện/]]) {
        const res = await post(makeFile({ daily_inputs: [row] }), 'restore');
        assert.equal(res.status, 400); assert.match(res.body.error, message);
      }
      assert.equal(await value(), null);
      assert.deepEqual(await versions(), before);
    });

    await t.test('nạp "thiếu": chỉ thêm dòng chưa có, giữ id đích, lặp lại không nhân đôi; "ghi đè" cập nhật; số 0/rỗng giữ đúng; nhật ký nạp', async () => {
      await c.query("INSERT INTO public.ctktkt_daily_inputs(operating_date,field_code,value,note,updated_at) VALUES ('2001-11-05','TEST-BK-A','existing','', '2001-11-05 00:00:00')");
      const existingId = (await value()).id;
      const file = makeFile({
        daily_inputs: [day('changed'), day('new', 'TEST-BK-B')],
        water_shift_logs: [{ id: 7, log_date: '2001-11-05', shift_time: '06h00', water_adjustment_s1: 0, water_adjustment_s2: null }],
        operating_events: [{ id: 1019901, operating_date: '2001-11-05', unit: 'S1', start_at: '2001-11-05 08:00', end_at: '', event_type: 1, description: 'Thử', updated_at: '2001-11-05 08:00:00' }],
        chemical_usage_logs: [{ id: 1019901, usage_date: '2001-11-05', chemical_code: 'NAOCL', material_code: 'm', chemical_name: 'NaOCl', unit: 'Tấn', quantity: 1.25, purpose: 'Thử', entered_by_user_id: 'u', entered_by_name: 'U', entered_by_position: 'P', source_key: 'test-backup-src-1' }],
        measurements: [{ id: 1019901, metric_code: 'HR', metric_name: 'Thử', period: '2001-11', actual: '10', limit_value: '9' }],
        water_shift_leaders: [{ name: 'test-backup-leader', is_active: 1, display_order: 9 }],
      });
      const before = await versions();
      const first = await post(file, 'restore');
      assert.equal(first.status, 200); assert.equal(first.body.changed, 6); assert.equal(first.body.total, 7);
      assert.match(first.body.message, /^Đã nạp 6 bản ghi\. Bản ghi đã có được giữ nguyên\./);
      assert.deepEqual(await value(), { id: existingId, value: 'existing', note: '' });
      assert.equal((await value('TEST-BK-B')).value, 'new');
      const water = (await c.query("SELECT id,water_adjustment_s1,water_adjustment_s2,water_rec_s1 FROM public.ctktkt_water_shift_logs WHERE log_date='2001-11-05'")).rows[0];
      assert.notEqual(Number(water.id), 7); assert.equal(water.water_adjustment_s1, 0); assert.equal(water.water_adjustment_s2, null); assert.equal(water.water_rec_s1, 0);
      assert.equal((await c.query('SELECT count(*)::int n FROM public.ctktkt_operating_events WHERE id = 1019901')).rows[0].n, 1);
      // Bộ đếm id được đẩy qua id lớn nhất vừa nạp (không cấp trùng id sau khi khôi phục).
      for (const table of SERIAL) assert.ok(Number((await c.query(`SELECT last_value::bigint v FROM public.ctktkt_${table}_id_seq`)).rows[0].v) >= 1019901, table);
      const after = await versions();
      const bumped = Object.keys(after).filter(k => after[k] !== (before[k] ?? 0)).sort();
      assert.deepEqual(bumped, ['chemical_usage_logs', 'chemical_usage_logs:all', 'daily_inputs', 'daily_inputs:2001-11', 'operating_events', 'operating_events:all', 'water_shift_logs', 'water_shift_logs:2001-11']);
      const second = await post(file, 'restore');
      assert.equal(second.body.changed, 0);
      const overwrite = await post(file, 'restore', 'overwrite');
      assert.equal(overwrite.status, 200); assert.equal(overwrite.body.changed, 7);
      assert.match(overwrite.body.message, /Các bản ghi trùng khóa đã được cập nhật từ tệp\./);
      assert.deepEqual(await value(), { id: existingId, value: 'changed', note: 'Ghi chú thử' });
      const audit = (await c.query("SELECT actor_id,mode,row_count,length(checksum) AS n FROM public.ctktkt_data_restore_audit WHERE actor_id='test-backup-admin' ORDER BY id")).rows;
      assert.deepEqual(audit, [{ actor_id: 'test-backup-admin', mode: 'missing', row_count: 7, n: 64 }, { actor_id: 'test-backup-admin', mode: 'missing', row_count: 7, n: 64 }, { actor_id: 'test-backup-admin', mode: 'overwrite', row_count: 7, n: 64 }]);
      await cleanup(c);
    });

    await t.test('lỗi ở bảng sau → hoàn tác cả lượt (kể cả bảng trước và nhật ký nạp)', async () => {
      await c.query("INSERT INTO public.ctktkt_chemical_usage_logs(id,usage_date,chemical_code,material_code,chemical_name,quantity,entered_by_user_id,entered_by_name,entered_by_position,source_key) VALUES (1019950,'2001-11-05','NAOCL','m','NaOCl',5,'u','U','P','test-backup-same')");
      const file = makeFile({ daily_inputs: [day('1')], chemical_usage_logs: [{ id: 1019951, usage_date: '2001-11-05', chemical_code: 'NAOCL', material_code: 'm', chemical_name: 'NaOCl', quantity: 10, entered_by_user_id: 'u', entered_by_name: 'U', entered_by_position: 'P', source_key: 'test-backup-same' }] });
      const res = await post(file, 'restore', 'overwrite');
      assert.equal(res.status, 503);
      assert.equal(await value(), null);
      assert.equal((await c.query("SELECT quantity FROM public.ctktkt_chemical_usage_logs WHERE id=1019950")).rows[0].quantity, 5);
      assert.equal((await c.query("SELECT count(*)::int n FROM public.ctktkt_data_restore_audit WHERE actor_id='test-backup-admin'")).rows[0].n, 0);
      await cleanup(c);
    });

    await t.test('nhiều dòng (125, chia lô 50) giữ đủ, nạp lại không nhân đôi; tải → nạp vòng tròn giữ nguyên giá trị', async () => {
      const file = makeFile({ daily_inputs: Array.from({ length: 125 }, (_, i) => day(String(i), 'TEST-BK-' + i)) });
      assert.equal((await post(file, 'restore')).body.changed, 125);
      assert.equal((await post(file, 'restore')).body.changed, 0);
      assert.equal((await c.query("SELECT count(*)::int n FROM public.ctktkt_daily_inputs WHERE operating_date='2001-11-05'")).rows[0].n, 125);
      const res = await json.GET(new Request('https://test.local/api/admin/data-backup?from=2001-11-05&to=2001-11-05'));
      const downloaded = await res.json();
      await cleanup(c);
      assert.equal((await post(downloaded, 'restore')).body.changed, 125); // trưởng ca trong tệp đã có sẵn → giữ nguyên
      const back = (await c.query("SELECT field_code,value,note FROM public.ctktkt_daily_inputs WHERE operating_date='2001-11-05' ORDER BY field_code")).rows;
      assert.deepEqual(back, downloaded.tables.daily_inputs.map(r => ({ field_code: r.field_code, value: r.value, note: r.note })).sort((a, b) => a.field_code < b.field_code ? -1 : 1));
      await cleanup(c);
    });

    await t.test('gói ZIP: xem trước, nạp, trùng khoá giữa các phần bị chặn', async () => {
      const part = (rows, name) => [name, JSON.stringify(makeFile({ daily_inputs: rows }))];
      const zipOf = async parts => { const zip = new JSZip(); for (const [n, body] of parts) zip.file(n, body); return Buffer.from(await zip.generateAsync({ type: 'uint8array' })); };
      const send = async (bytes, action, mode = 'missing') => {
        const form = new FormData(); form.set('file', new File([bytes], 'goi.zip')); form.set('action', action); form.set('mode', mode); form.set('confirmed', 'true');
        const res = await archive.POST(new Request('https://test.local/api/admin/data-backup/archive', { method: 'POST', body: form }));
        return { status: res.status, body: unwrap(await res.json()) };
      };
      const good = await zipOf([part([day('1', 'TEST-BK-Z1')], 'a.json'), part([day('2', 'TEST-BK-Z2')], 'b.json')]);
      const preview = await send(good, 'preview');
      assert.equal(preview.status, 200); assert.equal(preview.body.total, 2); assert.equal(preview.body.files, 2);
      const restored = await send(good, 'restore');
      assert.equal(restored.status, 200); assert.equal(restored.body.changed, 2); assert.match(restored.body.message, /Đã nạp 2 bản ghi từ 2 tệp/);
      assert.equal((await value('TEST-BK-Z2')).value, '2');
      const duplicate = await zipOf([part([day('1', 'TEST-BK-Z1')], 'a.json'), part([day('9', 'TEST-BK-Z1')], 'b.json')]);
      const rejected = await send(duplicate, 'restore');
      assert.equal(rejected.status, 400); assert.match(rejected.body.error, /trùng khoá/);
      await cleanup(c);
    });
  } finally {
    await cleanup(c).catch(() => {});
    await restoreSequences(c, saved).catch(() => {});
    await c.end(); await closeImplementationConnections();
  }
});
