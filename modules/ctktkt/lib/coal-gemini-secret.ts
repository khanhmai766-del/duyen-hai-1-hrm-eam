import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from "node:crypto";
const context=Buffer.from("qlkt/coal-gemini-shared/v1");
function encryptionKey(secret:string|undefined) {
  if(!secret) throw new Error("Thiếu khóa mã hóa máy chủ.");
  return Buffer.from(hkdfSync("sha256",secret,context,"AES-256-GCM",32));
}
export function sealCoalGeminiKey(key:string,secret:string|undefined) {
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(secret),iv);
  cipher.setAAD(context);
  const data=Buffer.concat([cipher.update(key,"utf8"),cipher.final()]);
  return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),data.toString("base64url")].join(".");
}
export function openCoalGeminiKey(value:string,secret:string|undefined) {
  const parts=value.split(".");
  if(parts.length!==4 || parts[0]!=="v1" || value.length>1024) throw new Error("Không giải mã được khóa dùng chung.");
  const iv=Buffer.from(parts[1],"base64url"),tag=Buffer.from(parts[2],"base64url");
  if(iv.length!==12 || tag.length!==16) throw new Error("Không giải mã được khóa dùng chung.");
  const cipher=createDecipheriv("aes-256-gcm",encryptionKey(secret),iv);
  cipher.setAAD(context);cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(Buffer.from(parts[3],"base64url")),cipher.final()]).toString("utf8");
}
