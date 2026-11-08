import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { ok, fail } from "@/lib/api";
import { inspectUpload } from "@/lib/upload-guard";
import { getSessionUser } from "@/modules/ctktkt/lib/auth/server";
import { canEditCtktktGroup } from "@/modules/ctktkt/lib/ctktkt-permissions";
import { CoalMeterVisionError } from "@/modules/ctktkt/lib/coal-meter-vision";
import { readCoalMeterGemini } from "@/modules/ctktkt/lib/coal-meter-gemini";
import { reserveCoalPhotoRead, saveCoalPhoto } from "@/modules/ctktkt/lib/coal-photo-store";
import { COAL_PHOTO_FUTURE_LIMIT_MS, coalPhotoExpiry } from "@/modules/ctktkt/lib/coal-photo-retention";
import {parseVisionTimestamp,slotForPhotoTime} from "@/modules/ctktkt/lib/coal-meter-ocr";
import {coalGeminiConfig} from "@/modules/ctktkt/lib/coal-gemini-config";
import {loadSharedGemini} from "@/modules/ctktkt/lib/coal-gemini-shared-store";
import {getRawDb} from "@/modules/ctktkt/db";

// Reading one photo with the vision model usually takes a few seconds, occasionally longer.
export const maxDuration = 60;

const MAX_BASE64_LENGTH = 5_000_000;
const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);


export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("Chưa đăng nhập.", 401);
  if (!canEditCtktktGroup(user, "may_nghien_coal_s1") && !canEditCtktktGroup(user, "may_nghien_coal_s2")) {
    return fail("Tài khoản của bạn không có quyền nhập công tơ than.", 403);
  }
  if (!isCtktktSameOrigin(request)) return fail("Nguồn yêu cầu không hợp lệ.", 403);
  let shared:{key:string;model:string}|null=null;
  if(!request.headers.get("x-coal-gemini-key")?.trim()){
    try{shared=await loadSharedGemini(getRawDb(),process.env.AUTH_SECRET);}catch{return fail("Chưa đọc được khóa dùng chung. Có thể nhập khóa tạm để thử riêng hoặc lưu lại khóa dùng chung.", 503);}
  }
  const config=coalGeminiConfig(request.headers,shared?.key||process.env.GEMINI_API_KEY,shared?.model||process.env.GEMINI_VISION_MODEL);
  if(!config.ok) return fail(config.error, config.status);

  if(Number(request.headers.get("content-length")||0)>4_000_000) return fail("Ảnh quá lớn.", 413);
  const reader=request.body?.getReader();
  if(!reader) return fail("Thiếu ảnh.", 400);
  const chunks:Uint8Array[]=[]; let size=0;
  while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>4_000_000){await reader.cancel();return fail("Ảnh quá lớn.", 413);} chunks.push(value); }
  let body:{data?:unknown;mediaType?:unknown;reportDate?:unknown;slot?:unknown;exifDate?:unknown;exifSlot?:unknown}|null=null;
  try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{/* invalid JSON */}
  const data = typeof body?.data === "string" ? body.data : "";
  const mediaType = typeof body?.mediaType === "string" ? body.mediaType : "";
  if (!data || !MEDIA_TYPES.has(mediaType)) return fail("Ảnh không hợp lệ.", 400);
  if (data.length > MAX_BASE64_LENGTH) return fail("Ảnh quá lớn.", 413);
  const reportDate=String(body?.reportDate||""),slot=String(body?.slot||"");
  try{if(coalPhotoExpiry(reportDate,slot)>Date.now()+COAL_PHOTO_FUTURE_LIMIT_MS)throw new Error("future");}catch{return fail("Ngày hoặc mốc ca không hợp lệ hoặc ở tương lai.", 400);}
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(data)||data.length%4!==0) return fail("Mã ảnh không hợp lệ.", 400);
  const bytes=Buffer.from(data,"base64");
  const signature=mediaType==="image/jpeg"?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mediaType==="image/png"?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
  if(!signature) return fail("Nội dung ảnh không đúng định dạng.", 400);
  await inspectUpload(bytes,{fileName:"cong-to-than",kinds:["jpeg","png","webp"],label:"ảnh"});
  try {
    if(!await reserveCoalPhotoRead(user.id)) return fail("Đã đủ 72 lượt đọc ảnh/kiểm tra Gemini trong giờ này. Hãy thử lại giờ tiếp theo.", 429);
  } catch {
    return fail("Chưa kiểm tra được giới hạn lượt đọc. Chưa gửi ảnh tới Gemini; giữ ảnh và bấm Đọc lại sau.", 503);
  }
  try {
    const reading = await readCoalMeterGemini({data,mediaType},config.key,config.model);
    const timestamp=parseVisionTimestamp(reading.photo_timestamp),timing=timestamp?slotForPhotoTime(timestamp):null;
    const photoDate=typeof body?.exifDate==="string"?body.exifDate:timing?.operatingDate;
    const photoSlot=typeof body?.exifSlot==="string"?body.exifSlot:timing?.slot;
    let photo:{id:string;expiresAt:number}|null = null;
    let warning = "";
    if (photoDate && photoDate !== reportDate) {
      warning = "Chưa lưu ảnh: ngày chụp khác ngày báo cáo. Kiểm tra lại ngày trước khi nhập.";
    } else {
      try {
        // Ảnh lưu trên kho tệp Server 3 trong 30 giờ để TKĐ đối chiếu, sau đó tự xoá.
        photo = await saveCoalPhoto(user.id,reportDate,photoSlot||slot,mediaType,bytes,reading);
        if (!photo) warning = "Chưa lưu ảnh: mốc ca này đã quá 30 giờ giữ ảnh.";
      } catch {
        // Giữ kết quả đọc số khi kho ảnh lỗi; không bắt người nhập gọi Gemini lại.
        warning = "Đã đọc số nhưng chưa lưu được ảnh đối chiếu lên máy chủ. Ảnh chỉ còn trong lượt nhập này; đọc lại sau nếu cần lưu ảnh cho TKĐ.";
      }
    }
    // Kết quả đọc ảnh không bao giờ được lưu đệm (kể cả khi gọi route trực tiếp, không qua cổng [[...path]]).
    const response = ok({ reading, photo, imageStored: Boolean(photo), warning });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof CoalMeterVisionError) return fail(error.message, error.status);
    // Never log provider errors, keys or photo content.
    return fail("Chưa xử lý được kết quả đọc ảnh. Ảnh vẫn ở đây; bấm Đọc lại hoặc thay ảnh rõ hơn.", 502);
  }
}
