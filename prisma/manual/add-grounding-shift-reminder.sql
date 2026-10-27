-- Chỉ thêm bảng lưu lần nhắc trên web theo tài khoản/ngày vận hành/ca, không sửa dữ liệu nghiệp vụ.
CREATE TABLE IF NOT EXISTS "grounding_shift_reminders" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "inspectionDate" TEXT NOT NULL,
  "inspectionShift" TEXT NOT NULL,
  "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "grounding_shift_reminders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "grounding_shift_reminders_user_slot_key"
  ON "grounding_shift_reminders" ("userId", "inspectionDate", "inspectionShift");
