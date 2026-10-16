-- Chỉ bổ sung cột lịch sử vi phạm, không sửa dữ liệu nhân sự hiện có.
ALTER TABLE "WorkPermitPerson" ADD COLUMN IF NOT EXISTS "violations" JSONB NOT NULL DEFAULT '[]'::jsonb;
