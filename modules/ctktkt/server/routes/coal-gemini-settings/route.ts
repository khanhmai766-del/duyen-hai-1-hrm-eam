import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { ok, fail } from "@/lib/api";
import {getRawDb} from "@/modules/ctktkt/db";
import {getSessionUser} from "@/modules/ctktkt/lib/auth/server";
import {canEditCtktktGroup} from "@/modules/ctktkt/lib/ctktkt-permissions";
import {coalGeminiConfig} from "@/modules/ctktkt/lib/coal-gemini-config";
import {sharedGeminiStatus,saveSharedGemini,updateSharedGeminiModel,SharedGeminiConflict} from "@/modules/ctktkt/lib/coal-gemini-shared-store";
export const runtime="nodejs";
export const dynamic="force-dynamic";
// Lỗi ({error}) → fail(), còn lại → ok() — phong bì chung của web; cổng [[...path]] đặt Cache-Control.
const json=(body:unknown,status=200)=>{
  const response=body&&typeof body==="object"&&"error" in body?fail(String((body as {error:unknown}).error),status):ok(body);
  response.headers.set("X-Content-Type-Options","nosniff");
  return response;
};
async function guard(){
  const user=await getSessionUser();
  if(!user) return {ok:false as const,response:json({error:"Chưa đăng nhập."},401)};
  if(!canEditCtktktGroup(user,"may_nghien_coal_s1")&&!canEditCtktktGroup(user,"may_nghien_coal_s2")) return {ok:false as const,response:json({error:"Chỉ VHV có quyền nhập công tơ than được cấu hình khóa dùng chung."},403)};
  return {ok:true as const,user};
}
export async function GET(){
  const session=await guard();if(!session.ok)return session.response;
  try{return json({shared:await sharedGeminiStatus(getRawDb()),environmentConfigured:Boolean(process.env.GEMINI_API_KEY)});}catch{return json({error:"Chưa tải được trạng thái khóa dùng chung."},503);}
}
export async function PUT(request:Request){
  const session=await guard();if(!session.ok)return session.response;
  if (!isCtktktSameOrigin(request, true))return json({error:"Nguồn yêu cầu không hợp lệ."},403);
  if(!request.headers.get("content-type")?.includes("application/json"))return json({error:"Yêu cầu phải là JSON."},415);
  const reader=request.body?.getReader();if(!reader)return json({error:"Thiếu dữ liệu."},400);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return json({error:"Dữ liệu quá lớn."},413);}chunks.push(value);}
  let body:{key?:unknown;model?:unknown;expectedVersion?:unknown};
  try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(!body||typeof body!=="object")throw new Error();}catch{return json({error:"JSON không hợp lệ."},400);}
  if(typeof body.key!=="string"||typeof body.model!=="string"||!Number.isSafeInteger(body.expectedVersion)||Number(body.expectedVersion)<0)return json({error:"Khóa/model/phiên bản không hợp lệ."},400);
  // Validate first, without ever returning credentials to a client.
  if(body.key.length>256||body.model.length>110||/[^\x20-\x7e]/.test(body.key+body.model))return json({error:"Định dạng khóa/model không hợp lệ."},400);
  if(!body.key.trim()){
    const model=body.model.trim();
    if(!/^gemini-[a-zA-Z0-9.-]{1,100}$/.test(model))return json({error:"Tên model Gemini không hợp lệ."},400);
    try{
      const shared=await updateSharedGeminiModel(getRawDb(),{model,expectedVersion:Number(body.expectedVersion),actorId:session.user.id,actorName:session.user.displayName});
      return json({shared});
    }catch(error){return json({error:error instanceof SharedGeminiConflict?error.message:"Chưa cập nhật được model dùng chung."},error instanceof SharedGeminiConflict?409:503);}
  }
  const config=coalGeminiConfig(new Headers({"x-coal-gemini-key":body.key,"x-coal-gemini-model":body.model}));
  if(!config.ok)return json({error:config.error},400);
  try{
    const shared=await saveSharedGemini(getRawDb(),process.env.AUTH_SECRET,{key:config.key,model:config.model,expectedVersion:Number(body.expectedVersion),actorId:session.user.id,actorName:session.user.displayName});
    return json({shared});
  }catch(error){return json({error:error instanceof SharedGeminiConflict?error.message:"Chưa lưu được khóa dùng chung. Kiểm tra CSDL và cấu hình mã hóa máy chủ."},error instanceof SharedGeminiConflict?409:503);}
}
