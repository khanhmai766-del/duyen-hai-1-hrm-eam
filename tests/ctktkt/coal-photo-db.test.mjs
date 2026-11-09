// Kho ảnh công tơ than, dọn ảnh hết hạn, bộ đếm lượt đọc và khoá Gemini dùng chung — chạy trên DB dev THẬT
// (giai đoạn 3: thay giả lập câu SQL). Dùng được cho cả bản SQL cũ (getRawDb) lẫn bản Prisma để so hai bản.
// Dòng thử: owner_id 'test-coal-%' (dọn trước/sau); kho tệp S3 thay bằng kho giả trong bộ nhớ.
import test from 'node:test';
import assert from 'node:assert/strict';
import { testClient, closeImplementationConnections } from './helpers/corrections-db.mjs';
import { coalPhotoExpiry } from '../../modules/ctktkt/lib/coal-photo-retention.ts';
import * as store from '../../modules/ctktkt/lib/coal-photo-store.ts';
import { cleanupCoalPhotos } from '../../modules/ctktkt/lib/coal-photo-cleanup.ts';
import * as gemini from '../../modules/ctktkt/lib/coal-gemini-shared-store.ts';

const OWNER = 'test-coal-owner';
function fakeStorage({ failRemove = false } = {}) {
  const objects = new Map(), removed = [];
  return { objects, removed, storage: {
    upload: async (key, body) => { objects.set(key, body); },
    remove: async key => { if (failRemove) throw Error('s3 down'); removed.push(key); objects.delete(key); },
    read: async key => objects.get(key),
  } };
}
async function cleanup(c) {
  await c.query("DELETE FROM public.ctktkt_coal_meter_photos WHERE owner_id LIKE 'test-coal-%'");
  await c.query("DELETE FROM public.ctktkt_coal_photo_usage WHERE owner_id LIKE 'test-coal-%'");
}
const photoRows = async c => (await c.query("SELECT id,owner_id,report_date,slot,type,data,reading,expires_at,created_at FROM public.ctktkt_coal_meter_photos WHERE owner_id LIKE 'test-coal-%' ORDER BY created_at, id")).rows;
/** Hàm Gemini nhận kho dữ liệu ở tham số đầu: bản cũ getRawDb(), bản Prisma prisma. */
async function geminiDb() {
  return (await import('../../lib/prisma.ts')).prisma;
}

test('kho ảnh công tơ than trên DB thật', async t => {
  const c = await testClient();
  try {
    await cleanup(c);
    const now = Date.parse('2026-11-08T09:00:00+07:00');

    await t.test('lưu ảnh: DB chỉ giữ khoá kho tệp + kết quả đọc; đọc lại đúng nội dung', async () => {
      const { objects, storage } = fakeStorage(), bytes = Buffer.from([255, 216, 255, 1, 2]);
      const photo = await store.saveCoalPhoto(OWNER, '2026-11-08', '08', 'image/jpeg', bytes, { total_display: '1', meter_label: 'S1-A' }, undefined, storage, now);
      assert.equal(photo.expiresAt, coalPhotoExpiry('2026-11-08', '08'));
      const [row] = await photoRows(c);
      assert.equal(row.id, photo.id);
      assert.match(row.data, /^s3:ctktkt\/coal-meter-photos\/2026-11-08\/[0-9a-f-]+\.jpg$/);
      assert.deepEqual([row.owner_id, row.report_date, row.slot, row.type, JSON.parse(row.reading), Number(row.expires_at), Number(row.created_at)],
        [OWNER, '2026-11-08', '08', 'image/jpeg', { total_display: '1', meter_label: 'S1-A' }, photo.expiresAt, now]);
      assert.deepEqual(await store.readCoalPhotoBytes(row.data, storage), bytes);
      assert.deepEqual(await store.readCoalPhotoBytes(Buffer.from([7, 8]).toString('base64'), storage), Buffer.from([7, 8]));
      assert.equal(objects.size, 1);
    });

    await t.test('quá 30 giờ → null; ca tương lai → lỗi; định dạng lạ → lỗi; không tải tệp nào', async () => {
      const { objects, storage } = fakeStorage();
      assert.equal(await store.saveCoalPhoto(OWNER, '2026-11-06', '08', 'image/png', Buffer.from([1]), {}, undefined, storage, now), null);
      await assert.rejects(() => store.saveCoalPhoto(OWNER, '2026-11-10', '08', 'image/png', Buffer.from([1]), {}, undefined, storage, now), /tương lai/);
      await assert.rejects(() => store.saveCoalPhoto(OWNER, '2026-11-08', '08', 'image/gif', Buffer.from([1]), {}, undefined, storage, now), /Định dạng/);
      assert.equal(objects.size, 0);
    });

    await t.test('kho đầy (600 ảnh còn hạn) → lỗi và xoá tệp vừa tải', async () => {
      await cleanup(c);
      // Giới hạn tính trên CẢ bảng: đổ thêm ảnh còn hạn bằng SQL (nhanh) cho đủ 599 kể cả ảnh có sẵn, rồi lưu 1 ảnh qua code → 600.
      const existing = (await c.query('SELECT count(*)::int n FROM public.ctktkt_coal_meter_photos WHERE expires_at > $1', [now])).rows[0].n;
      await c.query(`INSERT INTO public.ctktkt_coal_meter_photos(id,owner_id,report_date,slot,type,data,reading,expires_at,created_at)
        SELECT 'test-coal-fill-'||g, 'test-coal-fill', '2026-11-08', '08', 'image/png', 'AA==', '{}', $1::bigint, $2::bigint FROM generate_series(1,$3::int) g`, [coalPhotoExpiry('2026-11-08', '08'), now, 599 - existing]);
      const { objects, storage } = fakeStorage();
      assert.ok(await store.saveCoalPhoto(OWNER, '2026-11-08', '16', 'image/png', Buffer.from([1]), {}, undefined, storage, now));
      await assert.rejects(() => store.saveCoalPhoto(OWNER, '2026-11-08', '16', 'image/webp', Buffer.from([2]), {}, undefined, storage, now), /Kho ảnh tạm đầy/);
      assert.equal(objects.size, 1);
      assert.equal((await c.query('SELECT count(*)::int n FROM public.ctktkt_coal_meter_photos WHERE expires_at > $1', [now])).rows[0].n, 600);
      // Ảnh đã hết hạn không tính vào 600.
      await c.query("UPDATE public.ctktkt_coal_meter_photos SET expires_at = $1 WHERE id = 'test-coal-fill-1'", [now - 1]);
      assert.ok(await store.saveCoalPhoto(OWNER, '2026-11-08', '16', 'image/webp', Buffer.from([3]), {}, undefined, storage, now));
      await cleanup(c);
    });

    await t.test('dọn ảnh: chỉ ảnh hết hạn; xoá tệp trước rồi dòng; lỗi kho tệp giữ dòng; ảnh base64 cũ xoá thẳng; bucket cũ', async () => {
      await cleanup(c);
      // Mốc giờ rất sớm (500 ms sau 1970): chỉ ảnh/bucket thử của test này hết hạn — không đụng ảnh mẫu của hợp đồng (hạn 1000 ms).
      const at = 500, hour = Math.floor(at / 3600000);
      await c.query(`INSERT INTO public.ctktkt_coal_meter_photos(id,owner_id,report_date,slot,type,data,reading,expires_at,created_at) VALUES
        ('test-coal-a','test-coal-x','2001-05-30','08','image/jpeg','s3:ctktkt/coal-meter-photos/2001-05-30/a.jpg','{}',$1,1),
        ('test-coal-b','test-coal-x','2001-05-30','08','image/jpeg','QUJD','{}',$1,2),
        ('test-coal-c','test-coal-x','2001-05-31','08','image/jpeg','s3:ctktkt/coal-meter-photos/2001-05-31/c.jpg','{}',$2,1)`, [at, at + 1]);
      await c.query(`INSERT INTO public.ctktkt_coal_photo_usage(owner_id,bucket,requests) VALUES ('test-coal-x',$1,5),('test-coal-x',$2,6),('test-coal-x',$3,7)`, [hour - 30, hour - 25, hour - 24]);
      const broken = fakeStorage({ failRemove: true });
      assert.equal(await store.cleanupExpiredCoalPhotos(at, undefined, broken.storage), 1); // chỉ ảnh base64 'b' (không có tệp)
      assert.deepEqual((await photoRows(c)).map(r => r.id), ['test-coal-a', 'test-coal-c']);
      const ok = fakeStorage(), readings = async () => (await c.query('SELECT count(*)::int n FROM public.ctktkt_daily_inputs')).rows[0].n;
      const readingsBefore = await readings();
      const result = await cleanupCoalPhotos(at, undefined, ok.storage);
      assert.equal(await readings(), readingsBefore); // không chạm số liệu báo cáo
      assert.equal(result.photos, 1);
      assert.ok(result.usageBuckets >= 2);
      assert.deepEqual(ok.removed, ['ctktkt/coal-meter-photos/2001-05-30/a.jpg']);
      assert.deepEqual((await photoRows(c)).map(r => r.id), ['test-coal-c']);
      assert.deepEqual((await c.query("SELECT bucket FROM public.ctktkt_coal_photo_usage WHERE owner_id='test-coal-x' ORDER BY bucket")).rows.map(r => r.bucket), [hour - 24]);
      await cleanup(c);
    });

    await t.test('bộ đếm: 72 lượt/giờ/người; lượt 73 bị chặn; người khác không ảnh hưởng; dọn bucket quá 24 giờ', async () => {
      await cleanup(c);
      const hour = Math.floor(Date.now() / 3600000);
      await c.query("INSERT INTO public.ctktkt_coal_photo_usage(owner_id,bucket,requests) VALUES ('test-coal-old',$1,9)", [hour - 25]);
      const results = [];
      for (let i = 0; i < 73; i++) results.push(await store.reserveCoalPhotoRead('test-coal-quota'));
      assert.deepEqual([results.filter(Boolean).length, results.at(71), results.at(72)], [72, true, false]);
      assert.equal(await store.reserveCoalPhotoRead('test-coal-other'), true);
      const usage = (await c.query("SELECT owner_id,requests FROM public.ctktkt_coal_photo_usage WHERE owner_id LIKE 'test-coal-%' ORDER BY owner_id")).rows;
      assert.deepEqual(usage, [{ owner_id: 'test-coal-other', requests: 1 }, { owner_id: 'test-coal-quota', requests: 72 }]);
      // Đồng thời: 10 lượt cùng lúc khi còn 2 lượt → đúng 2 lượt được nhận.
      await c.query("UPDATE public.ctktkt_coal_photo_usage SET requests = 70 WHERE owner_id = 'test-coal-other'");
      const race = await Promise.all(Array.from({ length: 10 }, () => store.reserveCoalPhotoRead('test-coal-other')));
      assert.equal(race.filter(Boolean).length, 2);
      await cleanup(c);
    });
  } finally { await cleanup(c).catch(() => {}); await c.end(); }
});

test('khoá Gemini dùng chung trên DB thật: mã hoá, phiên bản, xung đột, đổi model giữ khoá', async () => {
  const c = await testClient(), secret = 'test-secret-for-coal-gemini-0123456789';
  const clear = async () => { await c.query("DELETE FROM public.ctktkt_coal_gemini_settings_events"); await c.query("DELETE FROM public.ctktkt_coal_gemini_settings"); };
  try {
    await clear();
    const db = await geminiDb(), actor = { actorId: 'test-coal-actor', actorName: 'Người thử' };
    assert.deepEqual(await gemini.sharedGeminiStatus(db), { configured: false, model: null, version: 0, updatedAt: null, updatedBy: null });
    assert.equal(await gemini.loadSharedGemini(db, secret), null);
    await assert.rejects(() => gemini.updateSharedGeminiModel(db, { model: 'gemini-2.0-flash', expectedVersion: 0, ...actor }), gemini.SharedGeminiConflict);
    const saved = await gemini.saveSharedGemini(db, secret, { key: 'AIzaTestKey123', model: 'gemini-2.5-flash', expectedVersion: 0, ...actor });
    assert.deepEqual([saved.configured, saved.model, saved.version, saved.updatedBy], [true, 'gemini-2.5-flash', 1, 'Người thử']);
    assert.match(saved.updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const row = (await c.query("SELECT name,cipher,model,version,updated_by,operation FROM public.ctktkt_coal_gemini_settings")).rows;
    assert.equal(row.length, 1); assert.equal(row[0].name, 'coal-meter'); assert.ok(!row[0].cipher.includes('AIzaTestKey123'));
    assert.deepEqual(await gemini.loadSharedGemini(db, secret), { key: 'AIzaTestKey123', model: 'gemini-2.5-flash' });
    await assert.rejects(() => gemini.saveSharedGemini(db, secret, { key: 'AIzaOther', model: 'gemini-2.5-flash', expectedVersion: 0, ...actor }), gemini.SharedGeminiConflict);
    const model = await gemini.updateSharedGeminiModel(db, { model: 'gemini-2.0-flash', expectedVersion: 1, ...actor });
    assert.deepEqual([model.configured, model.model, model.version], [true, 'gemini-2.0-flash', 2]);
    assert.deepEqual(await gemini.loadSharedGemini(db, secret), { key: 'AIzaTestKey123', model: 'gemini-2.0-flash' });
    await assert.rejects(() => gemini.updateSharedGeminiModel(db, { model: 'gemini-x', expectedVersion: 1, ...actor }), gemini.SharedGeminiConflict);
    const events = (await c.query("SELECT version,actor_id,actor_name,action FROM public.ctktkt_coal_gemini_settings_events ORDER BY version")).rows;
    assert.deepEqual(events, [{ version: 1, actor_id: 'test-coal-actor', actor_name: 'Người thử', action: 'replace' }, { version: 2, actor_id: 'test-coal-actor', actor_name: 'Người thử', action: 'model' }]);
    assert.equal((await c.query("SELECT operation FROM public.ctktkt_coal_gemini_settings")).rows[0].operation.length, 36);
    // Lưu khoá mới thay khoá cũ, tăng phiên bản.
    const replaced = await gemini.saveSharedGemini(db, secret, { key: 'AIzaNewKey', model: 'gemini-2.0-flash', expectedVersion: 2, ...actor });
    assert.equal(replaced.version, 3);
    assert.deepEqual(await gemini.loadSharedGemini(db, secret), { key: 'AIzaNewKey', model: 'gemini-2.0-flash' });
  } finally { await clear().catch(() => {}); await c.end(); await closeImplementationConnections(); }
});
