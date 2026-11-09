// Giai đoạn 3 (getRawDb → Prisma): khoá phiên bản đọc và mốc giờ phải y như lớp SQL cũ.
import test from 'node:test';
import assert from 'node:assert/strict';
import { operationalWriteKeys, operationalWriteKeysFor } from '../../../modules/ctktkt/lib/operational-query-policy.ts';
import { ktktUtcNow } from '../../../modules/ctktkt/db/prisma.ts';

// Đúng các câu SQL cũ của route và tham số tương ứng → khoá mà db/index.ts đã tăng.
const CASES = [
  ['chemical POST', `INSERT INTO chemical_usage_logs (
        usage_date, chemical_code, material_code, chemical_name, unit, quantity,
        purpose, plant_unit, reference, entered_by_user_id, entered_by_name,
        entered_by_position, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    d => [d, 'NAOCL', 'm', 'n', 'Tấn', 1, 'p', 'Chung', '', 'u', 'U', 'TC'], d => operationalWriteKeysFor('chemical_usage_logs', [d])],
  ['chemical PUT', `UPDATE chemical_usage_logs SET
        usage_date = ?, chemical_code = ?, material_code = ?, chemical_name = ?, unit = ?,
        quantity = ?, purpose = ?, plant_unit = 'Chung', reference = ?,
        updated_by_user_id = ?, updated_by_name = ?, updated_by_position = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`, d => [d, 'NAOCL', 'm', 'n', 'Tấn', 1, 'p', '', 'u', 'U', 'TC', 5], () => operationalWriteKeysFor('chemical_usage_logs')],
  ['chemical DELETE', `UPDATE chemical_usage_logs
      SET deleted_at = CURRENT_TIMESTAMP, deleted_by_user_id = ?, deleted_by_name = ?, deleted_by_position = ?
      WHERE id = ? AND deleted_at IS NULL`, () => ['u', 'U', 'TC', 5], () => operationalWriteKeysFor('chemical_usage_logs')],
  // Lượng nước: thêm/sửa ca (route chính + nạp file), tính lại chuỗi, xoá theo ngày/ca và theo id.
  ['water upsert ca', `INSERT INTO water_shift_logs (
            log_date, shift_time, shift_team, shift_leader,
            elec_rec_s1, elec_rec_s2, elec_gen_s1, elec_gen_s2,
            water_rec_s1, water_rec_s2, water_used_s1, water_used_s2,
            water_ratio_s1, water_ratio_s2,
            condenser_rec_s1, condenser_rec_s2, condenser_used_s1, condenser_used_s2,
            resin_water_s1_24h, resin_water_s2_24h, note, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, 0, 0, 0, ?, ?, 0, 0, ?, ?, '', CURRENT_TIMESTAMP)
          ON CONFLICT(log_date, shift_time) DO UPDATE SET shift_team = excluded.shift_team, updated_at = CURRENT_TIMESTAMP`,
    d => [d, '06h00', 'Kíp 1', 'A', 1, 2, 3, 4, 5, 6, 7, 8], d => operationalWriteKeysFor('water_shift_logs', [d])],
  ['water tính lại chuỗi', `UPDATE water_shift_logs
             SET elec_gen_s1 = ?, elec_gen_s2 = ?,
                 water_used_s1 = ?, water_used_s2 = ?,
                 water_ratio_s1 = ?, water_ratio_s2 = ?,
                 condenser_used_s1 = ?, condenser_used_s2 = ?
             WHERE log_date = ? AND shift_time = ?`, d => [1, 2, 3, 4, 5, 6, 7, 8, d, '06h00'], d => operationalWriteKeysFor('water_shift_logs', [d])],
  ['water xoá theo ngày + ca', 'DELETE FROM water_shift_logs WHERE log_date = ? AND shift_time = ?', d => [d, '14h00'], d => operationalWriteKeysFor('water_shift_logs', [d])],
  ['water xoá theo id', 'DELETE FROM water_shift_logs WHERE id = ?', () => [7], () => operationalWriteKeysFor('water_shift_logs')],
  ['trưởng ca (không phải dữ liệu vận hành)', `INSERT INTO water_shift_leaders (name, is_active, display_order)
         VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET is_active = excluded.is_active, display_order = excluded.display_order`, () => ['A', 1, 0], () => operationalWriteKeysFor('water_shift_leaders')],
];

for (const [name, sql, args, keys] of CASES) {
  test(`khoá phiên bản đọc khớp SQL cũ: ${name}`, () => {
    for (const date of ['2026-09-17', '2026-12-31', '1999-12-31', '2026-02-30', '']) {
      assert.deepEqual([...keys(date)].sort(), [...operationalWriteKeys(sql, args(date))].sort(), date);
    }
  });
}

test('operationalWriteKeysFor: nhiều ngày gộp theo tháng; bảng ngoài danh sách không có khoá', () => {
  assert.deepEqual(operationalWriteKeysFor('daily_inputs', ['2026-09-01', '2026-09-30', '2026-10-01']), ['daily_inputs', 'daily_inputs:2026-09', 'daily_inputs:2026-10']);
  assert.deepEqual(operationalWriteKeysFor('daily_inputs', ['2026-09-01', 'x']), ['daily_inputs', 'daily_inputs:all']);
  assert.deepEqual(operationalWriteKeysFor('measurements', ['2026-09-01']), []);
});

test("ktktUtcNow: cùng dạng to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')", () => {
  assert.equal(ktktUtcNow(new Date('2026-11-09T01:02:03.987Z')), '2026-11-09 01:02:03');
  assert.equal(ktktUtcNow(new Date('2026-12-31T23:59:59.999+07:00')), '2026-12-31 16:59:59');
  assert.match(ktktUtcNow(), /^20\d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});
