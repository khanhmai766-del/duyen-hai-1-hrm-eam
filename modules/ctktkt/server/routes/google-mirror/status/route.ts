import {prisma} from '@/lib/prisma';
import {ok,fail} from '@/lib/api';
import {requireSession} from '@/modules/ctktkt/lib/auth/server';
import {mirrorAuthorized} from '@/modules/ctktkt/lib/google-mirror-auth';
import {GOOGLE_MIRROR_FILES,validMirrorPeriod} from '@/modules/ctktkt/lib/google-mirror';
import {storedMirrorHash} from '@/modules/ctktkt/lib/google-mirror-credentials';
export async function GET(){
 const guard=await requireSession();if(!guard.ok)return guard.response;
 try{const results=(await prisma.ctktktGoogleMirrorStatus.findMany({select:{file_key:true,period:true,synced_at:true}})).map(r=>({fileKey:r.file_key,period:r.period,syncedAt:r.synced_at}));return ok({configured:Boolean(process.env.GOOGLE_MIRROR_TOKEN||await storedMirrorHash()),entries:results});}
 catch{return fail('Chưa đọc được trạng thái đồng bộ.',503);}
}
export async function POST(request:Request){
 if(!await mirrorAuthorized(request))return Response.json({error:'Không có quyền.'},{status:401});
 try{
  const raw=await request.text();if(raw.length>2000)return Response.json({error:'Yêu cầu quá lớn.'},{status:413});
  const b=JSON.parse(raw);if(!GOOGLE_MIRROR_FILES.some(f=>f.key===b.key)||!validMirrorPeriod(b.period)||!/^\d{4}-\d{2}-\d{2}T/.test(b.syncedAt)||!Number.isFinite(Date.parse(b.syncedAt))||!(/^[a-f0-9]{64}$/).test(b.hash))return Response.json({error:'Trạng thái không hợp lệ.'},{status:400});
  await prisma.ctktktGoogleMirrorStatus.upsert({where:{file_key:b.key},create:{file_key:b.key,period:b.period,synced_at:b.syncedAt,content_hash:b.hash},update:{period:b.period,synced_at:b.syncedAt,content_hash:b.hash}});return Response.json({ok:true});
 }catch{return Response.json({error:'Chưa lưu được trạng thái đồng bộ.'},{status:503});}
}
