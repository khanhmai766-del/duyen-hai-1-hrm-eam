import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { inspectUpload } from "@/lib/upload-guard";
import { getSessionUser } from "@/modules/ctktkt/lib/auth/server";
import { canEditCtktktGroup } from "@/modules/ctktkt/lib/ctktkt-permissions";
import { CoalMeterVisionError } from "@/modules/ctktkt/lib/coal-meter-vision";
import { readCoalMeterGemini } from "@/modules/ctktkt/lib/coal-meter-gemini";
import { saveCoalPhoto,reserveCoalPhotoRead } from "@/modules/ctktkt/lib/coal-photo-store";
import { coalPhotoExpiry } from "@/modules/ctktkt/lib/coal-photo-retention";
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
  if (!user) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (!canEditCtktktGroup(user, "may_nghien_coal_s1") && !canEditCtktktGroup(user, "may_nghien_coal_s2")) {
    return Response.json({ error: "Tài khoản của bạn không có quyền nhập công tơ than." }, { status: 403 });
  }
  if (!isCtktktSameOrigin(request)) return Response.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  let shared:{key:string;model:string}|null=null;
  if(!request.headers.get("x-coal-gemini-key")?.trim()){
    try{shared=await loadSharedGemini(getRawDb(),process.env.AUTH_SECRET);}catch{return Response.json({error:"Chưa đọc được khóa dùng chung. Có thể nhập khóa tạm để thử riêng hoặc lưu lại khóa dùng chung."},{status:503});}
  }
  const config=coalGeminiConfig(request.headers,shared?.key||process.env.GEMINI_API_KEY,shared?.model||process.env.GEMINI_VISION_MODEL);
  if(!config.ok) return Response.json({error:config.error},{status:config.status});

  if(Number(request.headers.get("content-length")||0)>4_000_000) return Response.json({error:"Ảnh quá lớn."},{status:413});
  const reader=request.body?.getReader();
  if(!reader) return Response.json({error:"Thiếu ảnh."},{status:400});
  const chunks:Uint8Array[]=[]; let size=0;
  while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>4_000_000){await reader.cancel();return Response.json({error:"Ảnh quá lớn."},{status:413});} chunks.push(value); }
  let body:{data?:unknown;mediaType?:unknown;reportDate?:unknown;slot?:unknown;exifDate?:unknown;exifSlot?:unknown}|null=null;
  try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{/* invalid JSON */}
  const data = typeof body?.data === "string" ? body.data : "";
  const mediaType = typeof body?.mediaType === "string" ? body.mediaType : "";
  if (!data || !MEDIA_TYPES.has(mediaType)) return Response.json({ error: "Ảnh không hợp lệ." }, { status: 400 });
  if (data.length > MAX_BASE64_LENGTH) return Response.json({ error: "Ảnh quá lớn." }, { status: 413 });
  const reportDate=String(body?.reportDate||""),slot=String(body?.slot||"");
  try{if(coalPhotoExpiry(reportDate,slot)>Date.now()+40*3600000)throw new Error("future");}catch{return Response.json({error:"Ngày hoặc mốc ca không hợp lệ hoặc ở tương lai."},{status:400});}
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(data)||data.length%4!==0) return Response.json({error:"Mã ảnh không hợp lệ."},{status:400});
  const bytes=Buffer.from(data,"base64");
  const signature=mediaType==="image/jpeg"?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mediaType==="image/png"?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
  if(!signature) return Response.json({error:"Nội dung ảnh không đúng định dạng."},{status:400});
  await inspectUpload(bytes,{fileName:"cong-to-than",kinds:["jpeg","png","webp"],label:"ảnh"});
  try {
    if(!await reserveCoalPhotoRead(user.id)) return Response.json({error:"Đã đủ 72 lượt đọc ảnh/kiểm tra Gemini trong giờ này. Hãy thử lại giờ tiếp theo."},{status:429});
  } catch {
    return Response.json({error:"Chưa kết nối được kho ảnh để kiểm tra lượt đọc. Chưa gửi ảnh tới Gemini; giữ ảnh và bấm Đọc lại sau."},{status:503});
  }
  try {
    const reading = await readCoalMeterGemini({data,mediaType},config.key,config.model);
    const timestamp=parseVisionTimestamp(reading.photo_timestamp),timing=timestamp?slotForPhotoTime(timestamp):null;
    const photoDate=typeof body?.exifDate==="string"?body.exifDate:timing?.operatingDate;
    const photoSlot=typeof body?.exifSlot==="string"?body.exifSlot:timing?.slot;
    let photo = null;
    let warning = "";
    if (photoDate && photoDate !== reportDate) {
      warning = "Chưa lưu ảnh: ngày chụp khác ngày báo cáo. Kiểm tra lại ngày trước khi nhập.";
    } else {
      try {
        photo = await saveCoalPhoto(user.id,reportDate,photoSlot||slot,mediaType,data,reading);
        if (!photo) warning = "Chưa lưu ảnh: ca này đã quá hạn giữ 4 mốc ca.";
      } catch {
        // Preserve a successful OCR result even when storage is unavailable. Do not make
        // operators call Gemini again just to see the digits it already returned.
        warning = "Đã đọc số nhưng chưa lưu được ảnh đối chiếu lên máy chủ. Ảnh chỉ còn trong lượt nhập này; đọc lại sau nếu cần lưu ảnh cho TKĐ.";
      }
    }
    return Response.json({ reading, photo, warning },{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    if (error instanceof CoalMeterVisionError) return Response.json({ error: error.message }, { status: error.status });
    // Never log provider errors, keys or photo content.
    return Response.json({ error: "Chưa xử lý được kết quả đọc ảnh. Ảnh vẫn ở đây; bấm Đọc lại hoặc thay ảnh rõ hơn." }, { status: 502 });
  }
}
