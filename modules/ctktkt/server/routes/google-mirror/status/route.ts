import {getRawDb} from '@/modules/ctktkt/db';
import {requireSession} from '@/modules/ctktkt/lib/auth/server';
import {mirrorAuthorized} from '@/modules/ctktkt/lib/google-mirror-auth';
import {GOOGLE_MIRROR_FILES,validMirrorPeriod} from '@/modules/ctktkt/lib/google-mirror';
import {storedMirrorHash} from '@/modules/ctktkt/lib/google-mirror-credentials';
async function database(){return getRawDb();}
export async function GET(){
 const guard=await requireSession();if(!guard.ok)return guard.response;
 try{const db=await database();const {results}=await db.prepare('SELECT file_key AS fileKey,period,synced_at AS syncedAt FROM google_mirror_status').all();return Response.json({configured:Boolean(process.env.GOOGLE_MIRROR_TOKEN||await storedMirrorHash()),entries:results},{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({configured:Boolean(process.env.GOOGLE_MIRROR_TOKEN),entries:[],error:'Chưa đọc được trạng thái đồng bộ.'},{status:503});}
}
export async function POST(request:Request){
 if(!await mirrorAuthorized(request))return Response.json({error:'Không có quyền.'},{status:401});
 try{
  const raw=await request.text();if(raw.length>2000)return Response.json({error:'Yêu cầu quá lớn.'},{status:413});
  const b=JSON.parse(raw);if(!GOOGLE_MIRROR_FILES.some(f=>f.key===b.key)||!validMirrorPeriod(b.period)||!/^\d{4}-\d{2}-\d{2}T/.test(b.syncedAt)||!Number.isFinite(Date.parse(b.syncedAt))||!(/^[a-f0-9]{64}$/).test(b.hash))return Response.json({error:'Trạng thái không hợp lệ.'},{status:400});
  const db=await database();await db.prepare('INSERT INTO google_mirror_status(file_key,period,synced_at,content_hash) VALUES(?,?,?,?) ON CONFLICT(file_key) DO UPDATE SET period=excluded.period,synced_at=excluded.synced_at,content_hash=excluded.content_hash').bind(b.key,b.period,b.syncedAt,b.hash).run();return Response.json({ok:true});
 }catch{return Response.json({error:'Chưa lưu được trạng thái đồng bộ.'},{status:503});}
}
