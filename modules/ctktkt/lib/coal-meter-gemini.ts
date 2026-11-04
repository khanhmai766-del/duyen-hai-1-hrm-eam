import { CoalMeterReadingSchema, CoalMeterVisionError, COAL_METER_SYSTEM_PROMPT } from "./coal-meter-vision";

// Keep the wire schema small, as in VibraControl; still validate the answer locally.
const nullableString={type:"STRING",nullable:true};
const readingResponseSchema={type:"OBJECT",properties:{
  screen_type:{type:"STRING",enum:["led_total","touch_material_total","no_total_visible","not_a_meter"]},
  meter_label:nullableString,total_display:nullableString,total_unit:nullableString,photo_timestamp:nullableString,
  confidence:{type:"STRING",enum:["high","medium","low"]},note:{type:"STRING"},
},required:["screen_type","meter_label","total_display","total_unit","photo_timestamp","confidence","note"]};

function fastReadingConfig(model:string){
  // These levels are supported by the documented model families. Leave custom
  // models alone rather than sending a parameter they might reject with 400.
  if(/^gemini-3\.(5|1)-flash-lite(?:$|-)/.test(model))return {thinkingConfig:{thinkingLevel:"minimal"}};
  if(/^gemini-3\.(8|7)-flash(?:$|-)/.test(model))return {thinkingConfig:{thinkingLevel:"low"}};
  return {};
}

export async function coalGeminiHttpError(response: Response) {
  // Only enumerated reasons are used. Provider messages may echo credentials.
  const failure = await response.json().catch(() => null) as {error?:{details?:{reason?:string}[]}} | null;
  const reasons = Array.isArray(failure?.error?.details) ? failure.error.details.map(item=>item?.reason) : [];
  const knownReasons = new Set(["API_KEY_INVALID","API_KEY_EXPIRED","ACCESS_TOKEN_TYPE_UNSUPPORTED","API_KEY_SERVICE_BLOCKED","API_KEY_HTTP_REFERRER_BLOCKED","API_KEY_IP_ADDRESS_BLOCKED","CREDENTIALS_MISSING","SERVICE_DISABLED","ACCESS_TOKEN_SCOPE_INSUFFICIENT"]);
  const safeReason = reasons.find(reason=>typeof reason==="string"&&knownReasons.has(reason));
  const message = reasons.some(reason=>reason==="API_KEY_INVALID"||reason==="API_KEY_EXPIRED")
    ? "Khóa Gemini không hợp lệ hoặc đã hết hiệu lực. Mở Cấu hình Gemini để nhập lại khóa, rồi kiểm tra kết nối."
    : response.status===401
    ? "Google không xác thực được khóa cho yêu cầu này. Kiểm tra hoặc thay khóa trong Google AI Studio. Đây là lỗi xác thực, chưa phải lỗi chất lượng ảnh."
    : response.status===403
    ? "Google từ chối quyền truy cập. Kiểm tra quyền của khóa, giới hạn API và dự án Google AI Studio."
    : response.status===404
    ? "Không tìm thấy model Gemini hoặc khóa chưa được cấp quyền dùng model này. Kiểm tra model trong Cấu hình Gemini."
    : response.status===429
    ? "Gemini đã hết hạn mức hoặc đang quá tải. Chờ rồi bấm Đọc lại; gửi lại ngay có thể vẫn lỗi."
    : response.status===400
    ? "Google không chấp nhận yêu cầu hoặc cấu hình Gemini. Kiểm tra khóa và model; phản hồi này chưa kết luận ảnh khó đọc."
    : response.status===503
    ? "Dịch vụ Gemini đang quá tải hoặc tạm thời không khả dụng. Giữ nguyên ảnh và thử Đọc lại sau; phản hồi này không phải lỗi xác thực khóa."
    : "Google Gemini đang gặp lỗi dịch vụ. Giữ ảnh và thử lại sau.";
  return new CoalMeterVisionError(`${message} (Google HTTP ${response.status}${safeReason?` · ${safeReason}`:""})`,response.status===429?429:response.status===503?503:502);
}

/** Small, explicit generation check using the same endpoint/authentication as OCR.
 * Catalog/metadata access alone cannot verify that generateContent will work. */
export async function checkCoalGeminiConnection(key:string,model:string,call:typeof fetch=fetch) {
  if(!/^gemini-[A-Za-z0-9.-]{1,100}$/.test(model)) throw new CoalMeterVisionError("Tên model Gemini không hợp lệ.",400);
  let response:Response;
  try {
    response=await call(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
      method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},signal:AbortSignal.timeout(12000),cache:"no-store",
      body:JSON.stringify({contents:[{role:"user",parts:[{text:"Reply OK."}]}],generationConfig:{...fastReadingConfig(model),maxOutputTokens:256}}),
    });
  } catch {
    throw new CoalMeterVisionError("Google chưa trả kết quả kiểm tra trong 12 giây. Chưa gửi ảnh; nếu yêu cầu đã tới Google thì vẫn có thể dùng hạn mức.",504);
  }
  if(!response.ok)throw await coalGeminiHttpError(response);
  const result=await response.json().catch(()=>null) as {candidates?:{finishReason?:unknown}[]}|null;
  // A tiny test may consume its output budget: that still verifies that Google
  // authenticated and ran the request. Refusals/invalid responses aren't success.
  if(!Array.isArray(result?.candidates)||!result.candidates.some(item=>item?.finishReason==="STOP"||item?.finishReason==="MAX_TOKENS"))throw new CoalMeterVisionError("Google chưa trả kết quả kiểm tra hợp lệ. Chưa thể xác nhận gọi được Gemini.",502);
  return {model,message:"Đã gọi thử Gemini thành công bằng yêu cầu văn bản ngắn. Khóa/model hiện dùng được. Chưa gửi ảnh hoặc ghi số liệu vận hành; kết quả này chưa kiểm tra độ chính xác đọc ảnh."};
}

// Google trả 500/502/503/504 khi model đang quá tải ("high demand"); thường hết sau vài giây.
const TRANSIENT_GEMINI_STATUSES = new Set([500, 502, 503, 504]);
export type CoalGeminiRetryOptions = {
  /** Chờ trước mỗi lần thử lại (ms). Mặc định 2 lần: 2 s rồi 5 s. */
  delaysMs?: number[];
  /** Tổng thời gian tối đa cho mọi lần gọi, phải nằm trong maxDuration 60 s của route. */
  budgetMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};
const MIN_ATTEMPT_MS = 10000;

function retryAfterMs(response: Response) {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

export async function readCoalMeterGemini(image: {data:string;mediaType:string}, key:string, model:string, call:typeof fetch=fetch, retry:CoalGeminiRetryOptions={}) {
  if(!/^[a-zA-Z0-9.-]+$/.test(model)) throw new CoalMeterVisionError("Cấu hình GEMINI_VISION_MODEL không hợp lệ.",503);
  const delays = retry.delaysMs ?? [2000, 5000];
  const now = retry.now ?? Date.now;
  const sleep = retry.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const deadline = now() + (retry.budgetMs ?? 55000);
  const requestBody = JSON.stringify({systemInstruction:{parts:[{text:COAL_METER_SYSTEM_PROMPT}]},contents:[{role:"user",parts:[{inlineData:{mimeType:image.mediaType,data:image.data}},{text:"Read the cumulative coal total in metric tonnes, not the hourly flow. Return only JSON with screen_type, meter_label, total_display, total_unit, photo_timestamp, confidence, note. screen_type: led_total, touch_material_total, no_total_visible or not_a_meter. confidence: high, medium or low. Missing strings must be null except note. Never infer an unreadable label or digit."}]}],generationConfig:{...fastReadingConfig(model),temperature:0,responseMimeType:"application/json",responseSchema:readingResponseSchema,maxOutputTokens:4096}});
  let response!: Response;
  for (let attempt = 0; ; attempt++) {
    const timeoutMs = Math.min(45000, Math.max(MIN_ATTEMPT_MS, deadline - now()));
    let networkError: CoalMeterVisionError | null = null;
    try {
      response=await call(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
        method:"POST", headers:{"Content-Type":"application/json","x-goog-api-key":key}, signal:AbortSignal.timeout(timeoutMs), body:requestBody,
      });
    } catch (error) {
      const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
      // Hết thời gian chờ thì không gọi lại: đã dùng gần hết ngân sách thời gian của yêu cầu.
      if (timedOut) throw new CoalMeterVisionError(`Gemini chưa phản hồi sau ${Math.round(timeoutMs / 1000)} giây. Giữ nguyên ảnh và thử lại sau; có thể chọn model đọc nhanh trong Cấu hình Gemini. Đây chưa phải lỗi chất lượng ảnh.`, 504);
      networkError = new CoalMeterVisionError("Không kết nối được Google Gemini. Ảnh vẫn ở đây; kiểm tra kết nối và bấm Đọc lại.", 502);
    }
    const transient = networkError !== null || TRANSIENT_GEMINI_STATUSES.has(response.status);
    if (!transient) break;
    const wait = Math.max(delays[attempt] ?? -1, networkError ? 0 : Math.min(retryAfterMs(response), 8000));
    if (attempt >= delays.length || now() + wait + MIN_ATTEMPT_MS > deadline) {
      if (networkError) throw networkError;
      const failure = await coalGeminiHttpError(response);
      if (attempt > 0) failure.message = failure.message.replace(/ \(Google HTTP/, ` Đã tự thử lại ${attempt} lần. (Google HTTP`);
      throw failure;
    }
    await response?.body?.cancel().catch(() => undefined);
    await sleep(wait);
  }
  if (!response.ok) throw await coalGeminiHttpError(response);
  let body: {candidates?:{finishReason?:string;content?:{parts?:{text?:string;thought?:boolean}[]}}[]};
  try { body = await response.json(); }
  catch { throw new CoalMeterVisionError("Gemini trả phản hồi bị ngắt hoặc không hợp lệ. Bấm Đọc lại; chưa có số liệu nào được điền.",502); }
  const candidate=body.candidates?.[0];
  if(candidate?.finishReason!=="STOP") throw new CoalMeterVisionError("Gemini chưa đọc xong hoặc từ chối ảnh này.",422);
  const text=candidate.content?.parts?.filter(part=>!part.thought&&typeof part.text==="string").map(part=>part.text).join("")||"";
  let result;
  try {result=CoalMeterReadingSchema.parse(JSON.parse(text));} catch {throw new CoalMeterVisionError("Gemini trả kết quả không hợp lệ; chưa điền vào bảng.",502);}
  if(result.total_unit && !/^(t|ton|tons|tonne|tonnes|mtons|metric tons|tấn)$/i.test(result.total_unit.trim())) throw new CoalMeterVisionError("Đơn vị trong ảnh không phải tấn. Hãy đối chiếu thủ công.",422);
  if(!result.total_unit) {result.confidence="low"; result.note="Không đọc rõ đơn vị tấn; phải đối chiếu ảnh. "+result.note;}
  return result;
}
