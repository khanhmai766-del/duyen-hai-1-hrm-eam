-- Đổi tag vòi thổi bụi IKSH01–12 (lẻ vách trái, chẵn vách phải) sang IKSH-A1…A6 / IKSH-B1…B6 (17/10/2026,
-- lib/soot-blower-layout.ts). CHẠM DỮ LIỆU THẬT: chỉ đổi cột "tag" của các dòng IKSH trong "SootBlower" (trạng thái vòi)
-- và "SootBlowerDefect" (khiếm khuyết), mọi tổ máy. Prod 17/10/2026 có đúng 1 dòng: SootBlower S1 IKSH11.
-- Ánh xạ theo VỊ TRÍ trên mô hình 3D (hàng dưới 1-2-3, hàng trên 4-5-6, số 1 phía trước lò; B đối diện A):
--   vách trái  IKSH11→A1 IKSH09→A2 IKSH07→A3 IKSH05→A4 IKSH03→A5 IKSH01→A6
--   vách phải  IKSH08→B1 IKSH10→B2 IKSH12→B3 IKSH02→B4 IKSH04→B5 IKSH06→B6
-- Idempotent: chạy lại không còn dòng tag cũ nên không đổi gì. Bỏ qua dòng mà tổ máy đã có tag mới (unique machine+tag).
BEGIN;
CREATE TEMP TABLE iksh_map (old_tag text PRIMARY KEY, new_tag text NOT NULL) ON COMMIT DROP;
INSERT INTO iksh_map VALUES
  ('IKSH11', 'IKSH-A1'), ('IKSH09', 'IKSH-A2'), ('IKSH07', 'IKSH-A3'), ('IKSH05', 'IKSH-A4'), ('IKSH03', 'IKSH-A5'), ('IKSH01', 'IKSH-A6'),
  ('IKSH08', 'IKSH-B1'), ('IKSH10', 'IKSH-B2'), ('IKSH12', 'IKSH-B3'), ('IKSH02', 'IKSH-B4'), ('IKSH04', 'IKSH-B5'), ('IKSH06', 'IKSH-B6');

UPDATE "SootBlower" s SET tag = m.new_tag
FROM iksh_map m
WHERE s.tag = m.old_tag
  AND NOT EXISTS (SELECT 1 FROM "SootBlower" x WHERE x.machine = s.machine AND x.tag = m.new_tag);

UPDATE "SootBlowerDefect" d SET tag = m.new_tag
FROM iksh_map m
WHERE d.tag = m.old_tag;
COMMIT;
