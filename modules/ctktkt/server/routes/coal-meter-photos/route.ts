import { getSessionUser } from "@/modules/ctktkt/lib/auth/server";
import { ok, fail } from "@/lib/api";
import { canEditCtktktGroup } from "@/modules/ctktkt/lib/ctktkt-permissions";
import { coalPhotoDb } from "@/modules/ctktkt/lib/coal-photo-store";
import {canReviewCoalPhotos} from "@/modules/ctktkt/lib/coal-photo-review";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  const user=await getSessionUser();
  if(!user) return fail("Chưa đăng nhập.", 401);
  const url=new URL(request.url),review=url.searchParams.get("scope")==="review";
  if(review?!canReviewCoalPhotos(user):!canEditCtktktGroup(user,"may_nghien_coal_s1")&&!canEditCtktktGroup(user,"may_nghien_coal_s2")) return fail("Không có quyền xem ảnh công tơ.", 403);
  try {
    const db=await coalPhotoDb(),id=url.searchParams.get("id");
    if(id){
      const photo=review
        ?await db.prepare("SELECT type,data FROM coal_meter_photos WHERE id=? AND expires_at>?").bind(id,Date.now()).first()
        :await db.prepare("SELECT type,data FROM coal_meter_photos WHERE id=? AND owner_id=? AND expires_at>?").bind(id,user.id,Date.now()).first();
      if(!photo) return fail("Ảnh hết hạn hoặc không có quyền xem.", 404);
      return new Response(Buffer.from(String(photo.data),"base64"),{headers:{"Content-Type":String(photo.type),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}});
    }
    const date=url.searchParams.get("date")||"";
    if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)) return fail("Ngày không hợp lệ.", 400);
    const photos=review
      ?await db.prepare("SELECT id,slot,reading,expires_at AS expiresAt FROM coal_meter_photos WHERE report_date=? AND expires_at>? ORDER BY created_at DESC LIMIT 200").bind(date,Date.now()).all()
      :await db.prepare("SELECT id,slot,reading,expires_at AS expiresAt FROM coal_meter_photos WHERE owner_id=? AND report_date=? AND expires_at>? ORDER BY created_at DESC LIMIT 72").bind(user.id,date,Date.now()).all();
    return ok({photos:photos.results.map(p=>({...p,reading:JSON.parse(String(p.reading))}))});
  }catch{return fail("Chưa truy cập được kho ảnh.", 503);}
}
