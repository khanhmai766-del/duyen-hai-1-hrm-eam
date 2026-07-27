-- Chuẩn hóa tiền tố X0 thành 10 cho từng mã KKS con trong toàn bộ cây thiết bị.
-- Bao gồm lỗi nguồn "X O..." (X + khoảng trắng + chữ O) tương đương "X0...".
-- An toàn chạy lại: chỉ cập nhật các bản ghi vẫn còn token sai.
-- Không thay các chuỗi có X0 ở giữa mã hợp lệ, ví dụ A0GAX01.

BEGIN;

-- Ghi chú sai chính tả không phải mã KKS.
UPDATE "EquipmentNode"
SET
  "searchText" = btrim(replace("searchText", lower("kks"), '')),
  "kks" = NULL
WHERE btrim("kks") ~* '^[kx]hông có';

UPDATE "EquipmentNode"
SET "searchText" = btrim(
  regexp_replace(
    "searchText",
    '(^|[[:space:]])[kx]hong co ma kks(?=[[:space:]]|$)',
    ' ',
    'gi'
  )
)
WHERE "searchText" ~* '(^|[[:space:]])[kx]hong co ma kks([[:space:]]|$)';

UPDATE "EquipmentNode"
SET
  "kks" = regexp_replace(
    "kks",
    '(^|(?<=[^[:alnum:]]))X(0|[[:space:]]+O)',
    '10',
    'gi'
  ),
  "name" = regexp_replace(
    "name",
    '(^|(?<=[^[:alnum:]]))X(0|[[:space:]]+O)',
    '10',
    'gi'
  ),
  "searchText" = regexp_replace(
    "searchText",
    '(^|(?<=[^[:alnum:]]))x(0|[[:space:]]+o)',
    '10',
    'gi'
  )
WHERE
  "kks" ~* '(^|(?<=[^[:alnum:]]))X(0|[[:space:]]+O)'
  OR "name" ~* '(^|(?<=[^[:alnum:]]))X(0|[[:space:]]+O)';

COMMIT;
