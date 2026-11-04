import {requireAdmin} from '@/modules/ctktkt/lib/auth/server';
import {GOOGLE_MIRROR_SCRIPT} from '@/modules/ctktkt/lib/google-mirror-script';
import {GOOGLE_MIRROR_ACCESS_SCRIPT} from '@/modules/ctktkt/lib/google-mirror-access-script';
import {GOOGLE_MIRROR_FILES} from '@/modules/ctktkt/lib/google-mirror';
import {mirrorSetupToken} from '@/modules/ctktkt/lib/google-mirror-credentials';
export async function GET(request:Request){
 const guard=await requireAdmin();if(!guard.ok)return guard.response;
 let token:string;try{token=await mirrorSetupToken();}catch{return Response.json({error:'Chưa tạo được kết nối an toàn; thử lại sau.'},{status:503});}
 const config={base:new URL(request.url).origin,token,initialPeriod:'2026-10',files:GOOGLE_MIRROR_FILES.map(({key,id})=>({key,id}))};
 return new Response('const CONFIG = '+JSON.stringify(config)+';\n'+GOOGLE_MIRROR_SCRIPT+'\n'+GOOGLE_MIRROR_ACCESS_SCRIPT,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Content-Disposition':'attachment; filename="CTKTKT_Google_Sheets.gs"','X-Content-Type-Options':'nosniff'}});
}
