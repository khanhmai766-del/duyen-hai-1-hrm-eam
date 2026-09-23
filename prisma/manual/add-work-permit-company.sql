-- Danh sách đơn vị nhà thầu (23/09/2026): giữ được đơn vị vừa tạo khi chưa có nhân sự nào.
-- Hồ sơ người vẫn ghi tên đơn vị bằng chữ; bảng này KHÔNG có khoá ngoại tới WorkPermitPerson.
CREATE TABLE IF NOT EXISTS "WorkPermitCompany" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkPermitCompany_name_key" ON "WorkPermitCompany"("name");
-- Nạp sẵn các đơn vị đang có trên hồ sơ người (chạy lại nhiều lần vẫn an toàn).
INSERT INTO "WorkPermitCompany" ("id", "name")
SELECT 'wpc_' || md5("company"), "company"
FROM (SELECT DISTINCT "company" FROM "WorkPermitPerson" WHERE btrim("company") <> '') s
ON CONFLICT ("name") DO NOTHING;
