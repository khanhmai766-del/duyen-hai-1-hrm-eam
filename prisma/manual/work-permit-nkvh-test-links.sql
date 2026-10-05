-- DỮ LIỆU PRODUCTION: chỉ gỡ liên kết NKVH của hai phiếu TEST đã hủy 4154 và 4178
-- (Điện, năm 2026). Giữ nguyên số, trạng thái và mọi hồ sơ/lượt giữ số.
-- Lưu toàn bộ bản trước/sau vào WorkPermitHistory; 4155 và 4179 giữ liên kết NKVH.
-- Chỉ chạy sau khi chủ hệ thống phê duyệt. Chạy trước work-permit-nkvh-saved-sync.sql.
-- Dừng toàn bộ nếu hồ sơ không còn đúng thông tin đã đối chiếu; chạy lại không tạo lịch sử trùng.
BEGIN;
DO $$
DECLARE
  target RECORD;
  old_row "WorkPermit"%ROWTYPE;
  new_row "WorkPermit"%ROWTYPE;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('cmuq9llgc04ovjbd31na4thh6', 4154, 'cmuq9umwr04s3jbd3v8ywbtio', 4155, 'a17cc6f9-52b3-428d-b5a3-0267b6b1a6a5'::uuid),
    ('cmuroin0f02fu8xn6t5hieyvk', 4178, 'cmuros4y702je8xn6m8vv43gr', 4179, 'a61243be-42ee-4b22-8b74-d328f0eb3f98'::uuid)
  ) AS targets(cancelled_id, cancelled_number, retained_id, retained_number, nkvh_id)
  LOOP
    PERFORM 1 FROM "WorkPermit"
      WHERE "id" = target.retained_id AND "kind" = 'ELECTRICAL' AND "year" = 2026
        AND "number" = target.retained_number AND "status" = 'CLOSED'
        AND "format" = 'ELECTRONIC' AND "nkvhPctId" = target.nkvh_id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Phiếu giữ liên kết % không còn đúng dữ liệu đã đối chiếu', target.retained_number;
    END IF;

    SELECT * INTO old_row FROM "WorkPermit"
      WHERE "id" = target.cancelled_id AND "kind" = 'ELECTRICAL' AND "year" = 2026
        AND "number" = target.cancelled_number AND "status" = 'CANCELLED' AND "format" = 'ELECTRONIC'
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Phiếu test đã hủy % không còn đúng dữ liệu đã đối chiếu', target.cancelled_number;
    END IF;
    IF old_row."nkvhPctId" IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM "WorkPermitHistory" WHERE "id" = 'nkvh-test-link-' || target.cancelled_id) THEN
        RAISE EXCEPTION 'Phiếu % đã mất liên kết nhưng chưa có lịch sử xử lý', target.cancelled_number;
      END IF;
      CONTINUE;
    END IF;
    IF old_row."nkvhPctId" <> target.nkvh_id THEN
      RAISE EXCEPTION 'Liên kết NKVH phiếu % đã thay đổi', target.cancelled_number;
    END IF;

    UPDATE "WorkPermit" SET "nkvhPctId" = NULL, "version" = "version" + 1, "updatedAt" = now()
      WHERE "id" = target.cancelled_id RETURNING * INTO new_row;
    INSERT INTO "WorkPermitHistory" ("id", "permitId", "actorId", "actorName", "action", "before", "after", "createdAt")
      VALUES ('nkvh-test-link-' || target.cancelled_id, target.cancelled_id,
        'system:deploy-nkvh-test-links', 'Đối chiếu phiếu test khi triển khai', 'NKVH_TEST_LINK_RELEASED',
        to_jsonb(old_row), to_jsonb(new_row), now());
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM "WorkPermit" WHERE "nkvhPctId" IS NOT NULL
      GROUP BY "kind", "nkvhPctId" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Vẫn còn liên kết NKVH trùng; hoàn tác để đối chiếu thêm';
  END IF;
END $$;
COMMIT;
