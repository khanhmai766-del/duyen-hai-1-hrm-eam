import { getSessionUser } from "@/modules/ctktkt/lib/auth/server";
import { ok, fail } from "@/lib/api";
import { canEditCtktktGroup } from "@/modules/ctktkt/lib/ctktkt-permissions";
import { coalPhotoDb, readCoalPhotoBytes } from "@/modules/ctktkt/lib/coal-photo-store";
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
      // Người duyệt xem mọi ảnh còn hạn; người nhập chỉ ảnh của chính mình.
      const photo=await db.ctktktCoalMeterPhotos.findFirst({where:{id,...(review?{}:{owner_id:user.id}),expires_at:{gt:BigInt(Date.now())}},select:{type:true,data:true}});
      if(!photo) return fail("Ảnh hết hạn hoặc không có quyền xem.", 404);
      return new Response(new Uint8Array(await readCoalPhotoBytes(photo.data)),{headers:{"Content-Type":String(photo.type),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}});
    }
    const date=url.searchParams.get("date")||"";
    if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)) return fail("Ngày không hợp lệ.", 400);
    // Người duyệt: 200 ảnh mới nhất của ngày; người nhập: 72 ảnh mới nhất của chính mình. Hạn (BIGINT) trả dạng số.
    const photos=await db.ctktktCoalMeterPhotos.findMany({
      where:{...(review?{}:{owner_id:user.id}),report_date:date,expires_at:{gt:BigInt(Date.now())}},
      orderBy:{created_at:"desc"},take:review?200:72,select:{id:true,slot:true,reading:true,expires_at:true},
    });
    return ok({photos:photos.map(p=>({id:p.id,slot:p.slot,reading:JSON.parse(String(p.reading)),expiresAt:Number(p.expires_at)}))});
  }catch{return fail("Chưa truy cập được kho ảnh.", 503);}
}
