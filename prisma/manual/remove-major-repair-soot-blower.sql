-- =====================================================================
-- Bỏ hẳn hai nhóm lưu trữ "Sửa chữa lớn" (MAJOR_REPAIR) và
-- "Dữ liệu vòi thổi bụi" (SOOT_BLOWER_DATA).
--
-- Giao diện, API và ma trận phân quyền đã gỡ hai nhóm này; câu lệnh dưới
-- dọn nốt dữ liệu còn lại trong DB.
--
--   npx prisma db execute --file prisma/manual/remove-major-repair-soot-blower.sql --schema prisma/schema.prisma
--
-- LƯU Ý: thao tác này KHÔNG khôi phục lại được. Sao lưu trước khi chạy trên
-- máy chủ thật:
--   pg_dump -t '"DigitalDocument"' -t '"RbacConfig"' dh1db > backup-truoc-khi-xoa.sql
-- =====================================================================

-- 1. Hồ sơ thuộc hai nhóm đã bỏ.
DELETE FROM "DigitalDocument"
 WHERE category IN ('MAJOR_REPAIR', 'SOOT_BLOWER_DATA');

-- 2. Hai quyền riêng của hai tab, nằm trong khối JSON cấu hình RBAC.
-- Lọc bỏ phần tử có id tương ứng ở "permissions" và permissionId ở
-- "userOverrides", giữ nguyên toàn bộ phần còn lại của cấu hình.
UPDATE "RbacConfig" AS c
   SET value = jsonb_set(
                 jsonb_set(
                   c.value::jsonb,
                   '{permissions}',
                   COALESCE(
                     (SELECT jsonb_agg(p)
                        FROM jsonb_array_elements(c.value::jsonb -> 'permissions') AS p
                       WHERE p ->> 'id' NOT IN ('archive-major-repair', 'archive-soot-blower-data')),
                     '[]'::jsonb
                   )
                 ),
                 '{userOverrides}',
                 CASE
                   WHEN jsonb_typeof(c.value::jsonb -> 'userOverrides') = 'array' THEN COALESCE(
                     (SELECT jsonb_agg(o)
                        FROM jsonb_array_elements(c.value::jsonb -> 'userOverrides') AS o
                       WHERE o ->> 'permissionId' NOT IN ('archive-major-repair', 'archive-soot-blower-data')),
                     '[]'::jsonb
                   )
                   ELSE COALESCE(c.value::jsonb -> 'userOverrides', '[]'::jsonb)
                 END
               )::text
 WHERE jsonb_typeof(c.value::jsonb -> 'permissions') = 'array'
   AND (c.value LIKE '%archive-major-repair%' OR c.value LIKE '%archive-soot-blower-data%');
