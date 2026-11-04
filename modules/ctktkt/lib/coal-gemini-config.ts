// Matches the lightweight image-reading model used by VibraControl.
export const DEFAULT_COAL_GEMINI_MODEL = "gemini-3.5-flash-lite";

/** Browser-to-server headers shared by OCR and its active-key diagnostic.
 * The server alone forwards the raw key as x-goog-api-key to Google. */
export function coalGeminiRequestHeaders(temporaryKey:string,model:string):Record<string,string> {
  const key=temporaryKey.trim();
  return {"Content-Type":"application/json",...(key?{"x-coal-gemini-key":key,"x-coal-gemini-model":model.trim()}:{})};
}

export function coalGeminiConfig(headers:Headers, serverKey?:string, serverModel?:string) {
  const temporaryKey=headers.get("x-coal-gemini-key")?.trim();
  const key=temporaryKey || serverKey?.trim();
  if(!key) return {ok:false as const,status:503,error:"Nhập khóa Gemini tạm trong cửa sổ đọc ảnh hoặc cấu hình GEMINI_API_KEY trên máy chủ."};
  if(!/^[A-Za-z0-9._-]{20,256}$/.test(key)) return {ok:false as const,status:400,error:"Định dạng khóa Gemini không hợp lệ. Chưa gửi ảnh tới Google."};
  // A caller can choose a model only with their own temporary key, never charge a different model to the server key.
  const model=(temporaryKey?headers.get("x-coal-gemini-model")?.trim():serverModel?.trim()) || DEFAULT_COAL_GEMINI_MODEL;
  if(!/^gemini-[a-zA-Z0-9.-]{1,100}$/.test(model)) return {ok:false as const,status:400,error:"Tên model Gemini không hợp lệ."};
  return {ok:true as const,key,model};
}
