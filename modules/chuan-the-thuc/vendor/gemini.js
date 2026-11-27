// Nguồn: repo chuan-the-thuc @ e87042a — tệp sinh tự động bởi scripts/build/chuan-the-thuc.mjs, không sửa tay
const console = { log() {} };
// Rà soát chính tả, viết hoa, dấu câu bằng Gemini. AI chỉ ĐỀ XUẤT; người dùng chọn áp dụng.
import { checkSpelling } from './spelling.js';

// Quy tắc viết hoa, trình bày (NĐ 30/2020 Phụ lục II; QĐ 739/QĐ-EVN Chương V) đưa cho AI
const RULES_NOTE = `
QUY TẮC VIẾT HOA, TRÌNH BÀY BẮT BUỘC (NĐ 30/2020/NĐ-CP Phụ lục II, QĐ 739/QĐ-EVN Chương V):
- Viết hoa chữ đầu câu: sau dấu chấm, chấm hỏi, chấm than và khi xuống dòng. Dòng bắt đầu bằng gạch đầu dòng "-" trong danh sách thì viết thường (trừ tên riêng).
- Tên người: viết hoa chữ đầu mọi âm tiết. Tên địa lý: danh từ chung viết thường + tên riêng viết hoa ("tỉnh Trà Vinh", "huyện Duyên Hải"); ngoại lệ "Thành phố Hồ Chí Minh", "Thủ đô Hà Nội", đơn vị gắn số ("Quận 1").
- Tên cơ quan, tổ chức, đơn vị: viết hoa chữ đầu của từ chỉ loại hình và chữ đầu của cụm từ chỉ chức năng, lĩnh vực ("Phòng Kỹ thuật và An toàn", "Phân xưởng Vận hành 1", "Tổ Sửa chữa lò hơi"); khi là danh từ chung không chỉ đơn vị cụ thể thì viết thường ("các phòng, tổ").
- Chức vụ: viết hoa khi đi kèm tên người hoặc tên đơn vị cụ thể ("Phó Quản đốc Phân xưởng Vận hành 1"); dùng chung thì viết thường.
- Văn bản cụ thể: viết hoa chữ đầu tên loại khi có số, ký hiệu ("Quyết định số 739/QĐ-EVN", "Công văn số 12/PXVH1"); viện dẫn: "Điều", "Chương", "Mục", "Phần" viết hoa, "khoản", "điểm" viết thường ("điểm a khoản 2 Điều 5").
- "Nhà nước" luôn viết hoa.
- GIỮ NGUYÊN: chữ viết tắt in hoa (KTV, MFT, NMNĐ, PXVH1, VT), số hiệu, ký hiệu, dấu ";" hoặc "." ở cuối dòng danh sách, dấu "./." kết thúc văn bản.
- Mỗi đoạn có ghi thành phần thể thức ([số đoạn | thành phần]): sửa phù hợp với thành phần đó.`;
export const DEFAULT_MODEL = (typeof process !== 'undefined' && process.env?.GEMINI_MODEL) || 'gemini-3.5-flash-lite'; // mặc định: bản nhẹ, ít bị quá tải; người dùng đổi trong "Cài đặt AI"
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
// Mô hình Pro suy luận lâu hơn nên được chờ lâu hơn.
const timeoutFor = model => (/pro/i.test(model) ? 180_000 : 90_000);

const PROMPT = `Bạn là chuyên viên văn thư rà soát văn bản hành chính Việt Nam theo Nghị định 30/2020/NĐ-CP.
Nhiệm vụ: tìm LỖI CHÍNH TẢ, lỗi gõ sai dấu tiếng Việt, lỗi VIẾT HOA (theo Phụ lục II Nghị định 30/2020/NĐ-CP), lỗi DẤU CÂU và lỗi DÙNG TỪ rõ ràng trong các đoạn dưới đây.
Quy tắc BẮT BUỘC:
- Chỉ sửa cách VIẾT của từ (dấu thanh, chữ cái gõ nhầm, hoa/thường, dấu câu). TUYỆT ĐỐI KHÔNG thay một từ/tên bằng từ/tên khác, KHÔNG đổi địa danh, tên người, tên cơ quan, số liệu, ngày tháng, số hiệu, thuật ngữ kỹ thuật, KHÔNG suy đoán sự thật (vd. địa điểm của nhà máy).
- KHÔNG sửa định dạng (phông, cỡ chữ, căn lề) — phần đó đã có công cụ khác xử lý.
- KHÔNG viết lại câu, KHÔNG đổi văn phong, KHÔNG thêm/bớt nội dung.
- Viết hoa theo Phụ lục II NĐ 30/2020: tên cơ quan, tổ chức viết hoa chữ cái đầu của các từ chỉ loại hình và chức năng (vd. "Phòng Kỹ thuật và An toàn"); chức vụ đi kèm tên cơ quan cụ thể viết hoa chữ đầu; danh từ chung không viết hoa.
- Từ viết tắt, mã thiết bị, ký hiệu (vd. MFT, DH1, NMNĐ, S1) giữ nguyên.
- "before" phải là chuỗi con CHÍNH XÁC (đúng từng ký tự) của đoạn số "i", càng ngắn càng tốt (một từ hoặc cụm từ chứa lỗi).
- Chỉ nêu lỗi bạn CHẮC CHẮN là sai. Phân vân thì bỏ qua. Không có lỗi thì trả mảng rỗng.
Trả về JSON: {"suggestions":[{"i":<số đoạn>,"before":"...","after":"...","type":"Chính tả|Viết hoa|Dấu câu|Dùng từ","reason":"giải thích ngắn"}]}`;

// Chế độ thứ hai: chuẩn hóa thuật ngữ, câu chữ theo văn phong hành chính (được đổi từ ngữ, KHÔNG đổi nội dung, số liệu)
const STYLE_PROMPT = `Bạn là kỹ sư trưởng nhiều năm kinh nghiệm vận hành – sửa chữa nhà máy nhiệt điện than (lò hơi, tua bin, máy phát, hệ thống khử lưu huỳnh FGD, khử bụi tĩnh điện ESP, khử NOx SCR, hệ thống nước, hệ thống điện tự dùng, trạm biến áp, DCS/điều khiển – đo lường), đồng thời là chuyên viên văn thư – pháp chế thành thạo văn bản hành chính và văn bản kỹ thuật của EVN.
Nhiệm vụ: BIÊN TẬP CHUYÊN SÂU từng câu của văn bản dưới đây để đạt chuẩn văn bản kỹ thuật – hành chính: thuật ngữ chính xác, diễn đạt khoa học, chặt chẽ, đúng văn phong hành chính. Văn bản kỹ thuật do kỹ sư soạn thường có NHIỀU chỗ cần biên tập — hãy rà kỹ TỪNG CÂU, kể cả bảng biểu, và đề xuất đầy đủ, không bỏ sót.

NHÓM 1 – THUẬT NGỮ KỸ THUẬT (type "Thuật ngữ")
- Thay khẩu ngữ, tiếng lóng hiện trường, từ tiếng Anh xen ngang bằng thuật ngữ chính thức tiếng Việt, giữ thuật ngữ gốc trong ngoặc khi cần. Ví dụ: thiết bị "bị trip/nhảy" (sự kiện) → "ngừng sự cố (trip)", còn "giá trị trip", "ngưỡng trip", "cài đặt trip" → "ngưỡng tác động bảo vệ (trip)" — phân biệt sự kiện với giá trị cài đặt; "cắt máy" → "tách tổ máy khỏi lưới"; "lên tải/xuống tải" → "tăng/giảm công suất"; "chạy bơm" → "đưa bơm vào vận hành"; "dừng bơm" → "ngừng bơm"; "lock/cô lập" → "cô lập"; "check" → "kiểm tra"; "fix" → "khắc phục"; "line ống" → "đường ống"; "van bị kẹt" → "van bị kẹt, không thao tác được"; "báo alarm" → "xuất hiện cảnh báo (alarm)"; "online/offline" → "đang vận hành/ngừng vận hành"; "đề xuất ngừng" → "đề xuất ngừng thiết bị".
- Dùng đúng động từ chuyên ngành: van thì "mở/đóng"; máy cắt, dao cách ly thì "đóng/cắt"; thiết bị thì "đưa vào vận hành / ngừng / chuyển dự phòng"; tổ máy thì "hòa lưới / tách lưới"; mức nước, áp suất, nhiệt độ thì "tăng/giảm", "vượt ngưỡng cảnh báo", "đạt giá trị".
- Tên hệ thống, thiết bị: gọi đầy đủ, thống nhất trong toàn văn bản (vd. "tháp hấp thụ", "bơm tuần hoàn tháp hấp thụ", "quạt tăng áp (BUF)", "quạt khói (IDF)", "quạt gió cấp 1 (PAF)", "quạt gió cấp 2 (FDF)", "bộ khử bụi tĩnh điện (ESP)", "bộ khử NOx (SCR)", "bơm nước cấp", "bình khử khí", "bình ngưng").
- Chữ viết tắt kỹ thuật xuất hiện LẦN ĐẦU mà chưa giải thích: đề xuất ghi tên đầy đủ kèm viết tắt trong ngoặc (vd. "FGD" → "hệ thống khử lưu huỳnh khói thải (FGD)").

NHÓM 2 – ĐƠN VỊ ĐO, SỐ LIỆU (type "Đơn vị đo")
- Ký hiệu theo hệ SI và TCVN 7870: "MW", "kV", "kW", "A", "°C", "bar", "MPa", "t/h", "m³/h", "m³"; có dấu cách giữa số và đơn vị ("3,045 m", "158 mg/Nm³") trừ "°", "%".
- Nồng độ khí thải viết theo điều kiện chuẩn "mg/Nm³" (QCVN 22:2009/BTNMT); "m3" → "m³".
- Dấu thập phân tiếng Việt là dấu phẩy, nhóm nghìn bằng dấu chấm ("3.045m" nếu là ba phẩy không bốn lăm mét thì phải là "3,045 m") — CHỈ đề xuất khi ngữ cảnh chắc chắn, giữ nguyên các chữ số.
- Thời gian: "10 giờ 15 phút" hoặc "10h15" thống nhất trong văn bản. "lúc" chỉ đi với giờ; khoảng ngày viết "từ ngày 11/11/2026 đến ngày 12/11/2026".

NHÓM 3 – VĂN PHONG HÀNH CHÍNH (type "Văn phong hành chính")
- Trang trọng, khách quan, một nghĩa; bỏ khẩu ngữ, cảm thán, từ mơ hồ ("khá", "hơi", "chắc là", "bị làm sao đó", "cũng", "thì", "là" thừa); không dùng ngôi thứ nhất số ít; nêu rõ chủ thể thực hiện (Trưởng ca, Trực ca, Phân xưởng...).
- Báo cáo sự cố nêu theo trình tự: diễn biến – nguyên nhân – biện pháp xử lý – kiến nghị; dùng "Kiến nghị", "Đề nghị" đúng đối tượng (cấp trên: "kính đề nghị", ngang cấp: "đề nghị").

NHÓM 4 – DIỄN ĐẠT (type "Diễn đạt" hoặc "Dùng từ")
- Câu đủ chủ ngữ – vị ngữ, không lủng củng, không lặp từ, trật tự logic thời gian – nhân quả; tách câu quá dài; dùng từ đúng nghĩa ("tiến hành", "thực hiện", "triển khai", "khắc phục", "xử lý" đúng ngữ cảnh).

QUY TẮC BẮT BUỘC
- GIỮ NGUYÊN mọi chữ số (giá trị đo, ngày giờ, số hiệu), mã thiết bị (S1, DH1, #1A...), tên người, tên cơ quan, địa danh và sự thật đã nêu. KHÔNG thêm thông tin mới, KHÔNG bỏ ý, KHÔNG suy đoán nguyên nhân kỹ thuật.
- KHÔNG sửa lỗi chính tả, viết hoa, dấu câu đơn thuần (đã có công cụ khác) và KHÔNG sửa định dạng.
- Mỗi đề xuất là MỘT cụm từ hoặc MỘT câu: "before" là chuỗi con CHÍNH XÁC (đúng từng ký tự) của đoạn số "i"; ngắn nhất có thể nhưng đủ để "after" đọc liền mạch.
- Tối đa 5 đề xuất mỗi đoạn. "reason" nêu ngắn gọn lý do kỹ thuật/căn cứ (TCVN, QCVN, quy trình vận hành, NĐ 30, QĐ 739).
Trả về JSON: {"suggestions":[{"i":<số đoạn>,"before":"...","after":"...","type":"Thuật ngữ|Đơn vị đo|Văn phong hành chính|Diễn đạt|Dùng từ","reason":"..."}]}`;

/** Đề xuất chuẩn hóa câu chữ chỉ hợp lệ khi giữ nguyên số liệu và không phình nội dung. Trả về lý do loại hoặc null. */
export function styleProblem(before, after) {
  const digits = t => (t.replace(/[⁰¹²³⁴-⁹]/g, c => '0123456789'['⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)]).match(/\d+/g) || []).join(',');
  if (digits(before) !== digits(after)) return 'đổi số liệu';
  // cho phép giải nghĩa viết tắt, gọi tên đầy đủ thiết bị ("FGD" → "hệ thống khử lưu huỳnh khói thải (FGD)"), nhưng không thêm câu mới
  if (after.trim().length > before.trim().length * 2 + 60) return 'thêm nội dung';
  const sentences = t => (t.match(/[.!?](\s|$)/g) || []).length;
  if (sentences(after) > sentences(before) + 1) return 'thêm nội dung';
  if (!after.trim()) return 'xóa nội dung';
  return null;
}

class GeminiError extends Error {
  constructor(msg, canFallback) { super(msg); this.canFallback = canFallback; }
}

/** Danh sách mô hình Gemini mà khóa này được dùng để sinh văn bản. */
export async function listModels(keyOrKeys) {
  const keys = (Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys]).map(k => String(k || '').trim()).filter(Boolean);
  if (!keys.length) throw new Error('Chưa có khóa Gemini API.');
  const errors = [];
  for (const k of keys) {
    try { return await listModelsOne(k); }
    catch (e) { errors.push(`khóa …${k.slice(-4)}: ${e.message}`); }
  }
  throw new Error(errors.join('\n'));
}
async function listModelsOne(apiKey) {
  const out = []; let page = '';
  do {
    const r = await fetch(`${BASE}/models?pageSize=1000${page ? '&pageToken=' + encodeURIComponent(page) : ''}`, { headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(20_000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `Gemini trả về lỗi ${r.status}`);
    for (const m of j.models || []) {
      const id = (m.name || '').replace(/^models\//, '');
      if (!/gemini/i.test(id) || !(m.supportedGenerationMethods || []).includes('generateContent')) continue;
      if (/embedding|tts|image|audio|live|vision|aqa/i.test(id)) continue;
      out.push({ id, name: m.displayName || id, description: m.description || '' });
    }
    page = j.nextPageToken;
  } while (page);
  // Pro trước, rồi Flash, rồi các loại khác; bản mới (số lớn) trước.
  const rank = id => (/pro/i.test(id) ? 0 : /flash-lite/i.test(id) ? 2 : /flash/i.test(id) ? 1 : 3);
  out.sort((a, b) => rank(a.id) - rank(b.id) || b.id.localeCompare(a.id, 'en', { numeric: true }));
  // Danh sách của Google không nói mô hình nào miễn phí → gửi thử 1 yêu cầu siêu nhỏ tới từng mô hình,
  // mô hình báo "hạn mức = 0" (gói miễn phí không dùng được) hoặc không có quyền thì ẩn đi.
  const status = await pool(out, 6, m => probe(apiKey, m.id));
  const models = out.filter((m, k) => status[k] !== 'no');
  return { models, hidden: out.filter((m, k) => status[k] === 'no').map(m => m.id) };
}
async function pool(list, n, fn) {
  const res = new Array(list.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (next < list.length) { const k = next++; res[k] = await fn(list[k]); } }));
  return res;
}
/** 'ok' dùng được; 'busy' có hạn mức nhưng đang hết lượt/quá tải (vẫn giữ); 'no' hạn mức 0 hoặc không có quyền. */
async function probe(apiKey, model) {
  try {
    const r = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 1 } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (r.ok) return 'ok';
    const msg = (await r.json().catch(() => ({})))?.error?.message || '';
    if (r.status === 429 && /limit:\s*0\b/.test(msg)) return 'no';
    if ([400, 403, 404].includes(r.status)) return 'no';
    return 'busy';
  } catch { return 'busy'; } // mạng chậm: không kết luận được → giữ lại
}

async function callGemini(apiKey, model, text) {
  const url = `${BASE}/models/${encodeURIComponent(model)}:generateContent`;
  const timeout = timeoutFor(model);
  let last = new GeminiError('Gemini không phản hồi.', true);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t0 = Date.now();
    let r;
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      const timedOut = e.name === 'TimeoutError' || e.name === 'AbortError';
      console.log(`[AI]   ${model} lần ${attempt}: ${timedOut ? 'quá thời gian' : 'lỗi mạng'} sau ${Date.now() - t0} ms`);
      if (timedOut) throw new GeminiError(`"${model}" không phản hồi sau ${timeout / 1000} giây.`, true);
      last = new GeminiError(`Không kết nối được Gemini: ${e.cause?.code || e.message}`, false);
      continue;
    }
    const j = await r.json().catch(() => ({}));
    console.log(`[AI]   ${model} lần ${attempt}: HTTP ${r.status} sau ${Date.now() - t0} ms`);
    if (r.ok) {
      const raw = j?.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('') || '';
      try { return JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim() || '{}'); }
      catch { throw new GeminiError(`"${model}" trả về kết quả không đọc được.`, true); }
    }
    const msg = j?.error?.message || `lỗi ${r.status}`;
    // 400 khóa sai / 403 không có quyền: đổi mô hình cũng vô ích (trừ khi mô hình không tồn tại → 404)
    if (r.status === 404) throw new GeminiError(`Không có mô hình "${model}" cho khóa này.`, true);
    if (r.status === 401 || r.status === 403 || (r.status === 400 && /api key|API_KEY/i.test(msg))) {
      const e = new GeminiError(r.status === 400 ? 'khóa không hợp lệ' : `khóa không có quyền dùng Gemini API (${msg})`, true);
      e.badKey = true;
      throw e;
    }
    if (![429, 500, 502, 503, 504].includes(r.status)) throw new GeminiError(`"${model}": ${msg}`, false);
    if (r.status === 429 && /limit:\s*0\b/.test(msg)) {
      // Khóa ở gói miễn phí và mô hình này có hạn mức 0 → thử lại vô ích
      const e = new GeminiError(`"${model}" không dùng được với khóa ở gói miễn phí (hạn mức = 0).`, true);
      e.freeTierZero = true;
      throw e;
    }
    last = new GeminiError(r.status === 429
      ? `"${model}" đã hết hạn mức (số lượt/phút hoặc/ngày). Thử lại sau ít phút hoặc dùng mô hình khác.`
      : `"${model}" đang quá tải (lỗi ${r.status}). Thử lại sau hoặc dùng mô hình khác.`, true);
    if (attempt < 2) await new Promise(res => setTimeout(res, 2500));
  }
  throw last;
}

/**
 * Thử lần lượt: mô hình chính với từng khóa (khóa chính → khóa dự phòng), rồi mô hình dự phòng với từng khóa.
 * Khóa sai/không có quyền bị bỏ qua ở các lượt sau (badKeys dùng chung cho mọi phần văn bản).
 */
async function callAny(keys, models, text, badKeys) {
  const errors = []; let freeZero = false;
  const label = k => (keys.length > 1 ? `khóa ${k === 0 ? 'chính' : 'dự phòng ' + k}` : 'khóa') + ` (…${keys[k].slice(-4)})`;
  outer:
  for (const m of models) {
    for (let k = 0; k < keys.length; k++) {
      if (badKeys.has(k)) continue;
      try { return { res: await callGemini(keys[k], m, text), model: m, key: k }; }
      catch (e) {
        errors.push(e.badKey ? `${label(k)}: ${e.message}` : `${e.message}${keys.length > 1 ? ` [${label(k)}]` : ''}`);
        freeZero ||= !!e.freeTierZero;
        if (e.badKey) { badKeys.add(k); continue; }
        if (!e.canFallback) break outer;
        console.log(`[AI]   chuyển sang lựa chọn dự phòng sau lỗi: ${errors.at(-1)}`);
      }
    }
  }
  if (badKeys.size === keys.length) errors.push('Tất cả khóa đều không dùng được — kiểm tra lại khóa trong "Cài đặt AI".');
  if (freeZero) errors.push('Cách khắc phục: (1) chọn mô hình Flash làm mô hình chính hoặc dự phòng — gói miễn phí dùng được Flash; hoặc (2) bật thanh toán (Billing) cho dự án của khóa tại aistudio.google.com để dùng bản Pro. Lưu ý: gói Google AI Pro trong ứng dụng Gemini KHÔNG mở hạn mức cho API.');
  throw new Error(errors.join('\n'));
}

// ---- Lọc đề xuất: AI chỉ được sửa CÁCH VIẾT, không được thay từ/tên khác ----
const looseLetters = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** true nếu "after" chỉ khác "before" ở dấu, hoa/thường, dấu câu, hoặc vài ký tự gõ nhầm. */
export function isWritingFix(before, after) {
  const digits = t => (t.match(/\d+/g) || []).join(',');
  if (digits(before) !== digits(after)) return false; // không bao giờ đổi số liệu, ngày tháng, số hiệu
  const a = looseLetters(before), b = looseLetters(after);
  if (a === b) return true;
  const dist = editDistance(a, b);
  return dist <= Math.min(3, Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.2)));
}
// Các thành phần đã có quy tắc thể thức cố định — không đưa cho AI (phần mềm tự sửa đúng hơn)
const SKIP_ROLES = /Quốc hiệu|Tiêu ngữ|Số, ký hiệu|Địa danh|Họ tên|Nơi nhận|Quyền hạn|Chức vụ|Tên cơ quan|Tên loại|Thẩm quyền/;

/**
 * Đối chiếu một đề xuất của AI với bộ quy tắc thể thức: áp đề xuất vào đoạn rồi kiểm tra lại bằng quy tắc;
 * nếu sinh thêm lỗi (vd. viết thường chữ đầu câu, viết hoa sai bảng EVN, bỏ dấu chấm cuối) thì loại. Trả về lý do hoặc null.
 */
export function ruleConflict(text, s, role = '', standard = 'nd30') {
  const nddh = standard === 'nddh';
  const body = /Nội dung|Điều|Căn cứ/.test(role), evn = standard === 'evn' || nddh;
  const opts = { sentenceCase: body, colonCase: evn && body, evnCase: evn, nddh, capRules: true };
  const at = text.indexOf(s.before);
  const after = text.slice(0, at) + s.after + text.slice(at + s.before.length);
  const key = x => `${x.code}|${x.before}`;
  const beforeSet = new Set(checkSpelling(text, opts).map(key));
  const added = checkSpelling(after, opts).filter(x => !beforeSet.has(key(x)));
  if (added.length) return added[0].msg;
  // chữ viết tắt IN HOA (KTV, MFT, NMNĐ…) giữ nguyên dạng
  for (const w of s.before.match(/\p{L}+/gu) || []) if (w.length >= 2 && w === w.toUpperCase() && !s.after.includes(w)) return `Chữ viết tắt "${w}" phải giữ nguyên.`;
  // không bỏ dấu kết thúc dòng (";" hoặc ".")
  if (text.trimEnd().endsWith(s.before.trimEnd()) && /[.;]$/.test(s.before.trimEnd()) && !/[.;]$/.test(s.after.trimEnd())) return 'Không được bỏ dấu kết thúc dòng.';
  return null;
}

/**
 * paragraphs: [{i, text, role}] → { suggestions: [{i, before, after, type, reason, votes}], passes, models, keys, rejected }
 * passes = 2: rà soát hai lần độc lập; đề xuất được cả hai lần đồng ý có votes = 2.
 */
const EVN_NOTE = `\nVăn bản thuộc Tập đoàn Điện lực Việt Nam (EVN) — áp dụng thêm Quy định 739/QĐ-EVN: viết hoa theo bảng của EVN (vd. "Tổng giám đốc", "Phó Tổng giám đốc", "Trưởng phòng", "Phó Trưởng phòng", "Chánh Văn phòng", "Kế toán trưởng", "Tổng công ty", "Nhà nước"); chức danh kèm tên ban thì viết hoa chữ đầu tên ban (vd. "Trưởng ban Kỹ thuật sản xuất"); viết hoa chữ đầu sau dấu hai chấm.`;

const NDDH_NOTE = `\nVăn bản của Công ty Nhiệt điện Duyên Hải: giữ nguyên cách viết "Trưởng Phòng", "Phó Trưởng Phòng" và "phòng" viết thường (theo biểu mẫu của Công ty), không đề xuất sửa các chức danh này.`;

export async function aiReview(paragraphs, { apiKey, apiKeys, models, passes = 1, standard, kind = 'spelling' } = {}) {
  const style = kind === 'style';
  passes = style ? 1 : Math.min(3, Math.max(1, Number(passes) || 1)); // câu viết lại mỗi lần một khác → không đối chiếu 2 lần
  const prompt = (style ? STYLE_PROMPT : PROMPT) + RULES_NOTE + (standard === 'evn' || standard === 'nddh' ? EVN_NOTE : '') + (standard === 'nddh' ? NDDH_NOTE : '');
  const runs = await Promise.all(Array.from({ length: passes }, () => aiReviewOnce(paragraphs.filter(p => !SKIP_ROLES.test(p.role || '')), { apiKey, apiKeys, models, standard, prompt, style })));
  const merged = new Map(); let rejected = 0, conflicts = 0;
  runs.forEach(r => {
    rejected += r.rejected; conflicts += r.conflicts;
    const seen = new Set();
    for (const s of r.suggestions) {
      const key = `${s.i}|${s.before}|${s.after}`;
      if (seen.has(key)) continue; seen.add(key);
      if (merged.has(key)) merged.get(key).votes++; else merged.set(key, { ...s, votes: 1 });
    }
  });
  const suggestions = [...merged.values()].sort((a, b) => b.votes - a.votes || a.i - b.i);
  return {
    suggestions, passes, rejected, conflicts,
    models: [...new Set(runs.flatMap(r => r.models))], keys: [...new Set(runs.flatMap(r => r.keys))],
  };
}

async function aiReviewOnce(paragraphs, { apiKey, apiKeys, models, standard, prompt = PROMPT, style = false } = {}) {
  const keys = [...new Set([...(Array.isArray(apiKeys) ? apiKeys : []), apiKey].map(k => String(k || '').trim()).filter(Boolean))].slice(0, 5);
  const badKeys = new Set();
  if (!keys.length) throw new Error('Chưa có khóa Gemini API. Nhập khóa ở mục "Cài đặt AI" hoặc đặt biến môi trường GEMINI_API_KEY.');
  const list = [...new Set((models?.length ? models : [DEFAULT_MODEL]).filter(Boolean))];
  const byIdx = new Map(paragraphs.map(p => [p.i, p.text]));
  const roleOf = new Map(paragraphs.map(p => [p.i, p.role || '']));
  const chunks = []; let cur = [], size = 0;
  for (const p of paragraphs) {
    if (!p.text?.trim()) continue;
    if (size + p.text.length > 7000 && cur.length) { chunks.push(cur); cur = []; size = 0; }
    cur.push(p); size += p.text.length;
  }
  if (cur.length) chunks.push(cur);
  const results = await Promise.all(chunks.map(c =>
    callAny(keys, list, `${prompt}\n\nCÁC ĐOẠN VĂN (dạng [số đoạn | thành phần thể thức] nội dung):\n${c.map(p => `[${p.i} | ${p.role || 'Nội dung'}] ${p.text}`).join('\n')}`, badKeys)));
  const suggestions = []; let rejected = 0, conflicts = 0;
  for (const { res } of results) {
    for (const s of res?.suggestions || []) {
      const t = byIdx.get(Number(s.i));
      if (!t || !s.before || s.before === s.after || typeof s.after !== 'string' || !t.includes(s.before)) continue;
      const bad = style ? styleProblem(s.before, s.after) : !isWritingFix(s.before, s.after);
      if (bad) { rejected++; console.log(`[AI]   loại đề xuất thay nội dung: "${s.before}" → "${s.after}"`); continue; }
      const why = ruleConflict(t, s, roleOf.get(Number(s.i)), standard);
      if (why) { conflicts++; console.log(`[AI]   loại đề xuất trái quy định: "${s.before}" → "${s.after}" — ${why}`); continue; }
      suggestions.push({ i: Number(s.i), before: s.before, after: s.after, type: s.type || (style ? 'Diễn đạt' : 'Chính tả'), reason: s.reason || '' });
    }
  }
  return { suggestions, rejected, conflicts, models: [...new Set(results.map(r => r.model))], keys: [...new Set(results.map(r => r.key))] };
}
