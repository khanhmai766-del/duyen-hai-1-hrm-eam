-- Xóa danh sách thiết bị công tác khỏi phiếu PCT; dữ liệu trong cột sẽ bị xóa.
ALTER TABLE "WorkPermit" DROP COLUMN IF EXISTS "equipmentItems";
