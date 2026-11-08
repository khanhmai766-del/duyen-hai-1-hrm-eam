import {getSessionUser} from "@/modules/ctktkt/lib/auth/server";
import { ok, fail } from "@/lib/api";
import {isCtktktSameOrigin} from "@/modules/ctktkt/lib/request-origin";
import {listCorrections,reviewCorrection,CorrectionError} from "@/modules/ctktkt/lib/report-corrections";
const failure=(e:unknown)=>fail(e instanceof CorrectionError?e.message:"Chưa truy cập được yêu cầu chỉnh sửa.", e instanceof CorrectionError?e.status:503);
export async function GET(){const user=await getSessionUser();if(!user)return fail("Chưa đăng nhập.", 401);try{return ok({entries:await listCorrections(user)});}catch(e){return failure(e);}}
export async function PATCH(request:Request){const user=await getSessionUser();if(!user)return fail("Chưa đăng nhập.", 401);if(user.role!=="admin")return fail("Chỉ tài khoản quản trị được duyệt yêu cầu.", 403);if(!isCtktktSameOrigin(request,true))return fail("Nguồn yêu cầu không hợp lệ.", 403);try{const raw=await request.text();if(raw.length>3000)return fail("Yêu cầu quá lớn.", 413);const b=JSON.parse(raw);if(typeof b.id!=="string"||!['approve','reject'].includes(b.action)||typeof b.note!=="string"||b.note.length>1000)throw new CorrectionError("Yêu cầu không hợp lệ.",400);return ok(await reviewCorrection(user,b.id,b.action==='approve',b.note));}catch(e){return failure(e);}}
