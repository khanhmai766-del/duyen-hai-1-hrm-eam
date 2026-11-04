import {timingSafeEqual,createHash} from 'node:crypto';
export async function mirrorAuthorized(request:Request){
 const secret=process.env.GOOGLE_MIRROR_TOKEN||'',token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 if(secret)return secret.length>=32&&Buffer.byteLength(token)===Buffer.byteLength(secret)&&timingSafeEqual(Buffer.from(token),Buffer.from(secret));
 if(!/^[a-f0-9]{64}$/.test(token))return false;
 try{const {storedMirrorHash}=await import('./google-mirror-credentials');const hash=await storedMirrorHash();const actual=createHash('sha256').update(token).digest('hex');return Boolean(hash&&hash.length===actual.length&&timingSafeEqual(Buffer.from(hash),Buffer.from(actual)));}catch{return false;}
}
