-- Đổi tên loại vòi IKSH → IKSL (17/10/2026, hiện trường gọi vòi thổi bụi SCR là "IKSL"): tag IKSH-A1…B6 → IKSL-A1…B6.
-- CHẠM DỮ LIỆU THẬT: chỉ đổi cột "tag" của các dòng IKSH-* trong "SootBlower" (trạng thái vòi) và "SootBlowerDefect"
-- (khiếm khuyết), mọi tổ máy. Prod 17/10/2026 có đúng 1 dòng: SootBlower S1 IKSH-A1 (từ migrate-iksh-tags-a-b.sql).
-- Idempotent: chạy lại không còn dòng IKSH-* nên không đổi gì. Bỏ qua dòng mà tổ máy đã có tag mới (unique machine+tag).
BEGIN;
UPDATE "SootBlower" s SET tag = 'IKSL' || substr(s.tag, 5)
WHERE s.tag LIKE 'IKSH-%'
  AND NOT EXISTS (SELECT 1 FROM "SootBlower" x WHERE x.machine = s.machine AND x.tag = 'IKSL' || substr(s.tag, 5));

UPDATE "SootBlowerDefect" SET tag = 'IKSL' || substr(tag, 5) WHERE tag LIKE 'IKSH-%';
COMMIT;
