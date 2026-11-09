import {ALL_COAL_METER_KEYS,COAL_SLOTS,coalMeterCell,coalEntriesMatchUnit,type CoalUnit} from "./coal-meter-ocr";
import {normalizeCtktktInputValue} from "./ctktkt-extra-fields";

type Entry={cell:string;value:string};
/** Cách gửi/đọc lại (trang truyền hook TanStack vào): lỗi máy chủ ném Error mang câu báo của máy chủ. */
export type CoalSaveTransport={
  save:(input:{operatingDate:string;coalUnit:CoalUnit;entries:Entry[]})=>Promise<unknown>;
  readStored:(period:string,date:string)=>Promise<Array<{operatingDate:string;cell:string;value:string}>|undefined>;
};
/** Save only the explicitly reviewed coal cells; read them back before reporting success. */
export async function saveReviewedCoalEntries(transport:CoalSaveTransport,date:string,entries:Entry[],expectedUnit?:CoalUnit) {
  const cells=new Set(ALL_COAL_METER_KEYS.flatMap(key=>COAL_SLOTS.map(slot=>coalMeterCell(key,slot))));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+"T00:00:00Z"))||new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date)throw new Error("Ngày ghi chỉ số không hợp lệ.");
  if(!entries.length||entries.some(entry=>!cells.has(entry.cell)||!/^\d+(?:\.\d+)?$/.test(entry.value)||!Number.isFinite(Number(entry.value)))||new Set(entries.map(entry=>entry.cell)).size!==entries.length)throw new Error("Danh sách công tơ xác nhận không hợp lệ.");
  const unit=expectedUnit??(coalEntriesMatchUnit(entries,"S1")?"S1":"S2");
  if((unit!=="S1"&&unit!=="S2")||!coalEntriesMatchUnit(entries,unit))throw new Error("Danh sách công tơ bị lẫn S1/S2 hoặc khác tổ máy đang chọn. Chưa gửi số liệu.");
  await transport.save({operatingDate:date,coalUnit:unit,entries}).catch(error=>{throw error instanceof Error&&error.message?error:new Error("Chưa lưu được chỉ số công tơ.");});
  const stored=await transport.readStored(date.slice(0,7),date).catch(error=>{throw error instanceof Error&&error.message?error:new Error("Đã gửi nhưng chưa kiểm tra lại được số liệu; giữ ảnh và kiểm tra trước khi lưu lại.");});
  if(!Array.isArray(stored))throw new Error("Đã gửi nhưng chưa kiểm tra lại được số liệu; giữ ảnh và kiểm tra trước khi lưu lại.");
  const persisted=Object.fromEntries(stored.filter(item=>item.operatingDate===date).map(item=>[item.cell,item.value]));
  if(entries.some(entry=>normalizeCtktktInputValue(entry.cell,persisted[entry.cell]??"")!==normalizeCtktktInputValue(entry.cell,entry.value)))throw new Error("Số liệu đọc lại chưa khớp. Chưa xác nhận lưu thành công; giữ nguyên ảnh để kiểm tra.");
  return entries.map(entry=>({cell:entry.cell,value:persisted[entry.cell]}));
}
