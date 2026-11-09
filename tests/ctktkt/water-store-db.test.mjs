// Sổ nước đọc bằng Prisma trên DB dev THẬT: hiệu chỉnh công tơ hỏng đã lưu (âm) không làm hỏng cả tháng.
// Dữ liệu thử: tháng 1998-12 (không có dữ liệu thật), dọn trước và sau. Không dùng 2001-xx (data-backup-db.test chạy song song
// ghi 2001-11 → thành ca mốc, lệch kết quả) hay 1999-12 (kiểm hợp đồng ctktkt-contract --writes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { testClient, closeImplementationConnections } from './helpers/corrections-db.mjs';
import { loadWaterChain } from '../../modules/ctktkt/lib/water-report/store.ts';
import { prisma } from '../../lib/prisma.ts';

test('tháng có hiệu chỉnh âm vẫn đọc được: bỏ qua giá trị hỏng khi tính và báo đúng ca', async () => {
  const c = await testClient();
  const clean = () => c.query("DELETE FROM public.ctktkt_water_shift_logs WHERE log_date LIKE '1998-12-%'");
  try {
    await clean();
    await c.query(`INSERT INTO public.ctktkt_water_shift_logs(log_date,shift_time,elec_rec_s1,water_rec_s1,water_adjustment_s1,condenser_adjustment_s2,updated_at) VALUES
      ('1998-12-01','06h00',1000,500,NULL,NULL,'1998-12-01 06:00:00'),
      ('1998-12-01','14h00',1100,560,-5,NULL,'1998-12-01 14:00:00'),
      ('1998-12-01','22h00',1200,600,-7,3,'1998-12-01 22:00:00')`);
    const { shifts, invalidAdjustments } = await loadWaterChain(prisma, '1998-12');
    assert.deepEqual(invalidAdjustments, [{ field: 'waterAdjustmentS1', value: -5, logDate: '1998-12-01', shiftTime: '14h00' }, { field: 'waterAdjustmentS1', value: -7, logDate: '1998-12-01', shiftTime: '22h00' }]);
    assert.deepEqual(shifts.map(s => [s.shiftTime, s.waterAdjustmentS1, s.waterUsedS1, s.condenserAdjustmentS2]), [['06h00', null, 0, null], ['14h00', null, 60, null], ['22h00', null, 40, 3]]);
    // Tháng sau: ca hỏng chỉ còn là ca mốc → không báo (hiệu chỉnh ca mốc không vào phép tính).
    const next = await loadWaterChain(prisma, '1999-01');
    assert.equal(next.baseline?.shiftTime, '22h00'); assert.deepEqual(next.invalidAdjustments, []);
  } finally { await clean().catch(() => {}); await c.end(); await closeImplementationConnections(); }
});
