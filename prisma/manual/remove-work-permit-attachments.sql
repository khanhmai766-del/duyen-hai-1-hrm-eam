-- Xóa bảng metadata tệp PCT đã bỏ khỏi website.
-- Dừng nếu bảng còn dữ liệu để xử lý S3 và lưu trữ hồ sơ trước khi xóa.
DO $$
BEGIN
  IF to_regclass('"WorkPermitAttachment"') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "WorkPermitAttachment") THEN
      RAISE EXCEPTION 'WorkPermitAttachment còn dữ liệu; không xóa bảng hoặc tệp S3 tự động';
    END IF;
    DROP TABLE "WorkPermitAttachment";
  END IF;
END $$;
