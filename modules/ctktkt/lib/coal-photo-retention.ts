export const COAL_PHOTO_SLOTS=["08","16","24"] as const;
export function coalPhotoExpiry(date:string, slot:string) {
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !COAL_PHOTO_SLOTS.some(s=>s===slot)) throw new Error("Ngày/ca không hợp lệ.");
  const start=Date.parse(`${date}T00:00:00+07:00`);
  if(!Number.isFinite(start)||new Date(start+7*3600000).toISOString().slice(0,10)!==date) throw new Error("Ngày không tồn tại.");
  // At a shift boundary, discard the oldest of the four completed shift endpoints.
  return start+(Number(slot)+32)*3600000;
}
