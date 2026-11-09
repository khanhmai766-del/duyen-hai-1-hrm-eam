import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {prisma} from '@/lib/prisma';
export async function credentialDb(){return prisma;}
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
export async function storedMirrorHash(){const db=await credentialDb();const row=await db.ctktktGoogleMirrorCredentials.findUnique({where:{id:1},select:{token_hash:true}});return row?String(row.token_hash):null;}
export async function mirrorSetupToken(){
 if(process.env.GOOGLE_MIRROR_TOKEN&&process.env.GOOGLE_MIRROR_TOKEN.length>=32)return process.env.GOOGLE_MIRROR_TOKEN;
 const secret=process.env.AUTH_SECRET;if(!secret)throw new Error('Máy chủ chưa có khóa bảo mật.');
 const key=createHash('sha256').update(secret+'google-mirror-v1').digest(),db=await credentialDb();
 const row=await db.ctktktGoogleMirrorCredentials.findUnique({where:{id:1},select:{token_enc:true}});
 if(row){const [iv,tag,data]=String(row.token_enc).split('.').map(s=>Buffer.from(s,'base64'));const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(data),cipher.final()]).toString();}
 const token=randomBytes(32).toString('hex'),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([cipher.update(token),cipher.final()]);
 await db.ctktktGoogleMirrorCredentials.createMany({data:[{id:1,token_hash:hash(token),token_enc:[iv,cipher.getAuthTag(),encrypted].map(b=>b.toString('base64')).join('.')}],skipDuplicates:true});
 // Re-read the winner if two administrator downloads arrive concurrently.
 return mirrorSetupToken();
}
