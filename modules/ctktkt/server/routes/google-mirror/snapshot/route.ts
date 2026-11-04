import {mirrorAuthorized} from '@/modules/ctktkt/lib/google-mirror-auth';
import {buildMirrorSnapshot} from '@/modules/ctktkt/lib/google-mirror-snapshot';
import {validMirrorPeriod} from '@/modules/ctktkt/lib/google-mirror';
import {vietnamDateIso} from '@/modules/ctktkt/lib/operating-date';
import {getOperationalReadVersions} from '@/modules/ctktkt/db';
import {createHash} from 'node:crypto';
export const maxDuration=60;
export async function GET(request:Request){
 if(!await mirrorAuthorized(request))return Response.json({error:'Không có quyền đồng bộ.'},{status:401});
 const period=new URL(request.url).searchParams.get('period')||vietnamDateIso().slice(0,7);
 if(!validMirrorPeriod(period)||period>vietnamDateIso().slice(0,7))return Response.json({error:'Tháng không hợp lệ.'},{status:400});
 try{
  const versions=await getOperationalReadVersions();
  // Include day/release as well as source versions: midnight advances the
  // active range, and a new exporter/template must never reuse an old ETag.
  const revision=['mirror-v2',process.env.VERCEL_GIT_COMMIT_SHA||'local',period,vietnamDateIso(),Object.entries(versions).filter(([key])=>!key.includes(':')).sort(([a],[b])=>a.localeCompare(b))];
  const etag='"'+createHash('sha256').update(JSON.stringify(revision)).digest('hex')+'"';
  const headers={'Cache-Control':'no-store',ETag:etag};
  if(process.env.CTKTKT_READ_CACHE!=='off'&&request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers});
  return Response.json(await buildMirrorSnapshot(period),{headers});
 }
 catch{return Response.json({error:'Không tạo được bản đồng bộ. File Google Sheets cũ được giữ nguyên.'},{status:503});}
}
