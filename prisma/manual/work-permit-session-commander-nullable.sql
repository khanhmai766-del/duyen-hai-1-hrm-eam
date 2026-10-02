-- Cho phép Quản trị xoá hồ sơ nhân sự nhà thầu (kể cả CHTT) sau khi mọi PCT có người đó đã kết thúc và người đó
-- đã ra khỏi khu vực. Lần làm việc đã kết thúc vẫn giữ commanderCode/commanderName (bản chụp) nên lịch sử còn đọc
-- được; chỉ khoá ngoại tới hồ sơ được gỡ (SET NULL). Chỉ nới ràng buộc — không xoá dữ liệu, chạy lại an toàn.
ALTER TABLE "WorkPermitSession" ALTER COLUMN "commanderId" DROP NOT NULL;
ALTER TABLE "WorkPermitSession" DROP CONSTRAINT IF EXISTS "WorkPermitSession_commanderId_fkey";
ALTER TABLE "WorkPermitSession" ADD CONSTRAINT "WorkPermitSession_commanderId_fkey"
  FOREIGN KEY ("commanderId") REFERENCES "WorkPermitPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
