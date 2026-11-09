import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { ok, fail } from "@/lib/api";
import {getSessionUser} from "@/modules/ctktkt/lib/auth/server";
import {canEditCtktktGroup} from "@/modules/ctktkt/lib/ctktkt-permissions";
import {prisma} from "@/lib/prisma";
import {loadSharedGemini} from "@/modules/ctktkt/lib/coal-gemini-shared-store";
import {coalGeminiConfig} from "@/modules/ctktkt/lib/coal-gemini-config";
import {checkCoalGeminiConnection} from "@/modules/ctktkt/lib/coal-meter-gemini";
import {CoalMeterVisionError} from "@/modules/ctktkt/lib/coal-meter-vision";
import {reserveCoalPhotoRead} from "@/modules/ctktkt/lib/coal-photo-store";

export const runtime="nodejs";
export const maxDuration=30;
// Lỗi ({error}) → fail(), còn lại → ok() — phong bì chung của web; cổng [[...path]] đặt Cache-Control.
const json=(body:unknown,status=200)=>{
  const response=body&&typeof body==="object"&&"error" in body?fail(String((body as {error:unknown}).error),status):ok(body);
  response.headers.set("X-Content-Type-Options","nosniff");
  return response;
};

export async function POST(request:Request) {
  const user=await getSessionUser();
  if(!user)return json({error:"Chưa đăng nhập."},401);
  if(!canEditCtktktGroup(user,"may_nghien_coal_s1")&&!canEditCtktktGroup(user,"may_nghien_coal_s2"))return json({error:"Bạn không có quyền kiểm tra cấu hình công tơ than."},403);
  if (!isCtktktSameOrigin(request, true))return json({error:"Nguồn yêu cầu không hợp lệ."},403);
  let shared:{key:string;model:string}|null=null;
  try {if(!request.headers.get("x-coal-gemini-key")?.trim())shared=await loadSharedGemini(prisma,process.env.AUTH_SECRET);}
  catch {return json({error:"Chưa đọc được khóa dùng chung từ máy chủ. Đây là lỗi cấu hình/kho khóa, chưa gửi yêu cầu tới Google."},503);}
  const config=coalGeminiConfig(request.headers,shared?.key||process.env.GEMINI_API_KEY,shared?.model||process.env.GEMINI_VISION_MODEL);
  if(!config.ok)return json({error:config.error},config.status);
  // Probe now generates a small response, so include it in the same per-user cap.
  try {if(!await reserveCoalPhotoRead(user.id))return json({error:"Đã đủ 72 lượt đọc ảnh/kiểm tra Gemini trong giờ này. Hãy thử lại giờ tiếp theo."},429);}
  catch{return json({error:"Chưa kiểm tra được hạn mức nội bộ. Chưa gửi yêu cầu thử tới Google."},503);}
  try {return json(await checkCoalGeminiConnection(config.key,config.model));}
  catch(error){return json({error:error instanceof CoalMeterVisionError?error.message:"Chưa kiểm tra được kết nối Google. Không có ảnh hoặc số liệu nào được thay đổi."},error instanceof CoalMeterVisionError?error.status:502);}
}
