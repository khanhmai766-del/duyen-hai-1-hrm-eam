export const COAL_PHOTO_SLOTS=["08","16","24"] as const;
/** Ảnh công tơ than giữ 30 giờ kể từ mốc ca của ảnh để TKĐ đối chiếu, sau đó tự xoá. */
export const COAL_PHOTO_RETENTION_HOURS=30;
/** Chỉ nhận ảnh cho mốc ca không quá 8 giờ sau hiện tại (ca đang chạy). */
export const COAL_PHOTO_FUTURE_LIMIT_MS=(COAL_PHOTO_RETENTION_HOURS+8)*3600000;
export function coalPhotoExpiry(date:string, slot:string) {
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !COAL_PHOTO_SLOTS.some(s=>s===slot)) throw new Error("Ngày/ca không hợp lệ.");
  const start=Date.parse(`${date}T00:00:00+07:00`);
  if(!Number.isFinite(start)||new Date(start+7*3600000).toISOString().slice(0,10)!==date) throw new Error("Ngày không tồn tại.");
  return start+(Number(slot)+COAL_PHOTO_RETENTION_HOURS)*3600000;
}
