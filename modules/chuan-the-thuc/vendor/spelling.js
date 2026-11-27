// Nguồn: repo chuan-the-thuc @ e87042a — tệp sinh tự động bởi scripts/build/chuan-the-thuc.mjs, không sửa tay
// Kiểm tra chính tả tiếng Việt KHÔNG cần AI:
//  1) Cấu trúc âm tiết (phụ âm đầu + vần + thanh) → bắt chữ gõ nhầm, gõ sót Telex, sai quy tắc c/k, g/gh, ng/ngh
//  2) Từ điển lỗi hay gặp trong văn bản hành chính (hỏi/ngã, ch/tr, s/x, d/gi/r…)
//  3) Viết hoa chữ đầu câu

// ---------- Âm tiết ----------
const TONE_MARKS = /[̣̀́̃̉]/g; // huyền, sắc, ngã, hỏi, nặng
const toneOf = w => { const m = w.normalize('NFD').match(TONE_MARKS) || []; return m; };
const stripTone = w => w.normalize('NFD').replace(TONE_MARKS, '').normalize('NFC');

const ONSETS = ['ngh', 'ng', 'nh', 'ch', 'tr', 'th', 'ph', 'kh', 'gh', 'gi', 'qu', 'b', 'c', 'd', 'đ', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'x', ''];
const RHYMES = new Set(`a ai ao au ay am an ang anh ac ach ap at
ă ăm ăn ăng ăc ăp ăt
â âu ây âm ân âng âc âp ât
e eo em en eng ec ep et
ê êu êm ên ênh êch êp êt
i ia iu im in inh ich ip it iêu iêm iên iêng iêc iêp iêt
o oi om on ong oc op ot oong ooc
ô ôi ôm ôn ông ôc ôp ôt
ơ ơi ơm ơn ơp ơt
u ua ui um un ung uc up ut uôi uôm uôn uông uôc uôt
ư ưa ưi ưu ưng ưc ưt ưm ưn ươi ươu ươm ươn ương ươc ươp ươt
y yêu yên yêm yêt
oa oai oay oan oang oanh oac oach oat oăn oăng oăc oăt oăm oăp oe oen oet oeo oam oap
uy uya uyu uyn uynh uych uyt uyên uyêt uân uâng uât uây uê uênh uêch uơ`.split(/\s+/));
const FRONT = /^[iyeê]/; // nguyên âm đứng sau k, gh, ngh

/** Phân tích một âm tiết (chữ thường). Trả về null nếu không hợp lệ. */
function parseSyllable(w) {
  const tones = toneOf(w);
  if (tones.length > 1) return null;
  const base = stripTone(w);
  for (const on of ONSETS) {
    if (!base.startsWith(on)) continue;
    let rhyme = base.slice(on.length);
    if (on === 'gi' && !/^[aăâeoôơuưy]/.test(rhyme)) rhyme = 'i' + rhyme; // gì, gìn, giếng = gi + i/in/iêng
    if (on === 'qu' && rhyme === '') continue;
    if (!rhyme || !RHYMES.has(rhyme)) continue;
    const front = FRONT.test(rhyme);
    if (['k', 'gh', 'ngh'].includes(on) && !front) continue; // k, gh, ngh chỉ đứng trước i, y, e, ê
    if (['c', 'g', 'ng'].includes(on) && front) continue;    // c, g, ng không đứng trước i, y, e, ê
    if (/[ptc]$|ch$/.test(rhyme) && !(tones.length && /[̣́]/.test(tones[0]))) continue; // vần tắc: chỉ sắc/nặng
    return { onset: on, rhyme, tone: tones[0] || '' };
  }
  return null;
}

// Quy tắc chính tả c/k/q, g/gh, ng/ngh — sửa được tự động
function onsetRule(w) {
  const lower = w.toLowerCase();
  const fixes = [
    [/^ngh(?=[^iyeêìíỉĩịèéẻẽẹềếểễệ])/u, 'ng'], [/^ng(?=[iyeêìíỉĩịèéẻẽẹềếểễệ])/u, 'ngh'],
    [/^gh(?=[^iyeêìíỉĩịèéẻẽẹềếểễệ])/u, 'g'], [/^g(?=[eêèéẻẽẹềếểễệ])/u, 'gh'],
    [/^c(?=[iyeêìíỉĩịèéẻẽẹềếểễệỳýỷỹỵ])/u, 'k'], [/^k(?=[aăâoôơuưàáảãạằắẳẵặầấẩẫậòóỏõọồốổỗộờớởỡợùúủũụừứửữự])/u, 'c'],
  ];
  for (const [re, rep] of fixes) if (re.test(lower)) {
    const fixed = lower.replace(re, rep);
    if (parseSyllable(fixed)) return fixed;
  }
  return null;
}

// Gõ sót kiểu Telex: aa→â, aw→ă, ee→ê, oo→ô, ow→ơ, uw→ư, dd→đ; s f r x j = sắc huyền hỏi ngã nặng
const TELEX_TONE = { s: '́', f: '̀', r: '̉', x: '̃', j: '̣' };
function placeTone(base, mark) {
  // Đặt dấu theo kiểu mới: ưu tiên nguyên âm có mũ/móc; "oa, oe, uy" đặt ở chữ sau; có âm cuối thì đặt ở nguyên âm cuối cùng
  const chars = [...base];
  const vIdx = chars.map((c, i) => (/[aăâeêioôơuưy]/.test(c) ? i : -1)).filter(i => i >= 0);
  if (!vIdx.length) return null;
  let pos = vIdx.find(i => /[ăâêôơư]/.test(chars[i]));
  if (pos === undefined) {
    const vs = vIdx.map(i => chars[i]).join('');
    const hasCoda = vIdx.at(-1) < chars.length - 1;
    if (base.startsWith('qu') || base.startsWith('gi')) pos = vIdx.filter(i => i > 1).at(hasCoda ? -1 : 0) ?? vIdx.at(-1);
    else if (vIdx.length === 1 || hasCoda || /^(oa|oe|uy)$/.test(vs)) pos = vIdx.at(vIdx.length === 1 ? 0 : -1);
    else pos = vIdx.at(-2);
  }
  chars[pos] = (chars[pos] + mark).normalize('NFC');
  return chars.join('');
}
function fromTelex(w) {
  let s = w.toLowerCase(), mark = '';
  // Chỉ coi là gõ sót Telex khi có ít nhất 2 dấu hiệu (tránh nhầm từ tiếng Anh như "seen", "max", "now")
  const signals = (s.match(/aa|aw|ee|oo|ow|uw|dd/g) || []).length + (/[sfrxj]$/.test(s) ? 1 : 0) + (/^(ngh|nh|ng|kh|dd|gh)/.test(s) ? 1 : 0);
  if (signals < 2) return null;
  const last = s.at(-1);
  if (TELEX_TONE[last] && s.length > 2) { mark = TELEX_TONE[last]; s = s.slice(0, -1); }
  const before = s;
  s = s.replace(/dd/g, 'đ').replace(/aa/g, 'â').replace(/aw/g, 'ă').replace(/ee/g, 'ê').replace(/oo/g, 'ô').replace(/ow/g, 'ơ').replace(/uw/g, 'ư').replace(/w/g, 'ư');
  if (s === before && !mark) return null;
  const out = mark ? placeTone(s, mark) : s;
  return out && parseSyllable(out) ? out : null;
}

const keepCase = (orig, fixed) => {
  if (orig === orig.toUpperCase() && orig.length > 1) return fixed.toLocaleUpperCase('vi');
  if (orig[0] === orig[0].toUpperCase()) return fixed[0].toLocaleUpperCase('vi') + fixed.slice(1);
  return fixed;
};
const hasVnMark = w => /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i.test(w);

// ---------- Từ điển lỗi hay gặp (chỉ những cặp không thể đúng trong văn bản hành chính) ----------
const COMMON = `triễn khai|triển khai; phát triễn|phát triển; triễn lãm|triển lãm; chiển khai|triển khai; quyết đinh|quyết định
sữa chữa|sửa chữa; sữa đổi|sửa đổi; chỉnh sữa|chỉnh sửa; sữa chửa|sửa chữa; sửa chửa|sửa chữa; chữa cháy|chữa cháy; chửa cháy|chữa cháy
giử gìn|giữ gìn; lưu giử|lưu giữ; dữ gìn|giữ gìn; giữ liệu|dữ liệu; cơ sở giữ liệu|cơ sở dữ liệu
sử lý|xử lý; sử lí|xử lí; xử dụng|sử dụng; sử phạt|xử phạt; sát nhập|sáp nhập; chuẩn đoán|chẩn đoán; thăm quan|tham quan
vô hình chung|vô hình trung; tựu chung|tựu trung; cọ sát|cọ xát; suất sắc|xuất sắc; chuyền đạt|truyền đạt; chuyền thông|truyền thông
chính sát|chính xác; xác xuất|xác suất; sơ xuất|sơ suất; suất khẩu|xuất khẩu; sản suất|sản xuất; đề suất|đề xuất
suất hiện|xuất hiện; năng xuất|năng suất; công xuất|công suất; hiệu xuất|hiệu suất; lãi xuất|lãi suất; tần xuất|tần suất
giành cho|dành cho; dành giật|giành giật; dành độc lập|giành độc lập; giáo giục|giáo dục; rèn rũa|rèn giũa; giao động|dao động
dõ ràng|rõ ràng; nổ lực|nỗ lực; lảnh đạo|lãnh đạo; cũng cố|củng cố; kỷ lưỡng|kỹ lưỡng; kỹ luật|kỷ luật; kỷ năng|kỹ năng; kỷ thuật|kỹ thuật; kỷ càng|kỹ càng
nghỉa vụ|nghĩa vụ; suy nghỉ|suy nghĩ; nghĩ phép|nghỉ phép; nghĩ ngơi|nghỉ ngơi; nghỉ định|nghị định; nghỉ quyết|nghị quyết; nghỉ rằng|nghĩ rằng
ý nghỉa|ý nghĩa; định nghỉa|định nghĩa; thực hiên|thực hiện; tổ chứt|tổ chức; trức năng|chức năng; trương trình|chương trình
dấy tờ|giấy tờ; hướng dẩn|hướng dẫn; dẩn đến|dẫn đến; chĩ đạo|chỉ đạo; chĩ thị|chỉ thị; kiễm tra|kiểm tra; kiễm soát|kiểm soát
tỗng hợp|tổng hợp; quãn lý|quản lý; quãn lí|quản lí; bão vệ|bảo vệ; bảo dưởng|bảo dưỡng; bão dưỡng|bảo dưỡng; sẳn sàng|sẵn sàng; sẳn có|sẵn có
giãi thích|giải thích; giãi pháp|giải pháp; giãi quyết|giải quyết; đầy đũ|đầy đủ; tiếng độ|tiến độ; hiệu quã|hiệu quả; kết quã|kết quả; hậu quã|hậu quả
chường hợp|trường hợp; chao đổi|trao đổi; chình bày|trình bày; chân trọng|trân trọng; chực tiếp|trực tiếp; sây dựng|xây dựng
xem sét|xem xét; sét duyệt|xét duyệt; sắp sếp|sắp xếp; chặc chẽ|chặt chẽ; chặt chẻ|chặt chẽ; lõng lẽo|lỏng lẻo; vửng chắc|vững chắc; vửng mạnh|vững mạnh
mạnh mẻ|mạnh mẽ; rộng rải|rộng rãi; dể dàng|dễ dàng; trấn chỉnh|chấn chỉnh; chuẫn bị|chuẩn bị; tiêu chuẫn|tiêu chuẩn
dám đốc|giám đốc; giám xát|giám sát; dám sát|giám sát; dới thiệu|giới thiệu; rũi ro|rủi ro; dủi ro|rủi ro; dà soát|rà soát; rà xoát|rà soát
kiểm xoát|kiểm soát; xự cố|sự cố; xự việc|sự việc; thiếc bị|thiết bị; thiếc kế|thiết kế; lắp đặc|lắp đặt; lấp đặt|lắp đặt; hệ thông|hệ thống
trách nghiệm|trách nhiệm; chách nhiệm|trách nhiệm; nhiệm dụ|nhiệm vụ; chịu chách nhiệm|chịu trách nhiệm; cán bộ công trức|cán bộ công chức
bàn dao|bàn giao; dao nhiệm vụ|giao nhiệm vụ; dao việc|giao việc; giải ngân|giải ngân; ngân xách|ngân sách; ngân sác|ngân sách
xinh hoạt|sinh hoạt; phụ trác|phụ trách; trịu trách nhiệm|chịu trách nhiệm; đôn đốc|đôn đốc; đông đốc|đôn đốc; khẩn chương|khẩn trương; khẩn trưong|khẩn trương`
  .split(/[;\n]/).map(x => x.trim()).filter(Boolean).map(x => x.split('|')).filter(([a, b]) => a && b && a !== b);

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const COMMON_RE = COMMON.map(([wrong, right]) => [new RegExp(`(?<![\\p{L}])${escRe(wrong)}(?![\\p{L}])`, 'giu'), right]);

// Bảng từ, cụm từ viết hoa của EVN (Phụ lục III QĐ 739/QĐ-EVN) — cụm dài đặt trước
const EVN_TERMS = ['Phó Bí thư thường trực Đảng ủy', 'Bí thư Đảng ủy', 'Phó Chủ tịch Công đoàn Điện lực Việt Nam', 'Chủ tịch Công đoàn Điện lực Việt Nam',
  'Chủ tịch Hội đồng thành viên', 'Thành viên Hội đồng thành viên', 'Chủ tịch Hội đồng quản trị', 'Ủy viên Hội đồng quản trị',
  'Kiểm soát viên Nhà nước', 'Cơ quan Tổng công ty', 'Tập đoàn Điện lực Việt Nam', 'Phó Tổng giám đốc', 'Tổng giám đốc', 'Kế toán trưởng', 'Bí thư chi bộ',
  'Phó Chánh Văn phòng', 'Chánh Văn phòng', 'Phó Trưởng ban', 'Trưởng ban', 'Phó Trưởng phòng', 'Trưởng phòng', 'Phó Quản đốc', 'Quản đốc',
  'Đội trưởng', 'Đội phó', 'Tổ trưởng', 'Tổ phó', 'Tổng công ty', 'Người đại diện phần vốn', 'Văn thư cơ quan', 'Lưu trữ cơ quan', 'Nhà nước'];
const EVN_RE = EVN_TERMS.map(t => [new RegExp(`(?<![\\p{L}])${t.replace(/ /g, '\\s+')}(?![\\p{L}])`, 'giu'), t]);

const up1 = s => s[0].toLocaleUpperCase('vi') + s.slice(1);
const low1 = s => s[0].toLocaleLowerCase('vi') + s.slice(1);
// Từ ghép: "hạng mục 1", "danh mục 2", "tiểu mục 3", "cổ phần II"… không phải viện dẫn nên không viết hoa
const after = words => `(?<!(?:^|\\s)(?:${words.split('|').flatMap(w => [w, w[0].toLocaleUpperCase('vi') + w.slice(1)]).join('|')})\\s+)`;
// [mẫu, cách sửa, căn cứ] — chỉ bắt dạng sai nên dòng IN HOA và dạng đúng không bị đụng tới
const CAP_RULES = [
  [/(?<![\p{L}])(nghị quyết|quyết định|nghị định|thông tư|chỉ thị|công văn|kế hoạch|tờ trình|báo cáo|thông báo|quy chế|quy định|hướng dẫn|biên bản|công điện|chương trình|đề án|phương án)(?=\s+số\s+\d)/gu, up1,
    'Tên loại văn bản cụ thể (có số) viết hoa chữ đầu (NĐ 30 Phụ lục II; QĐ 739 Điều 26)'],
  [/(?<![\p{L}])điều(?=\s+\d)/gu, up1, 'Viện dẫn Điều cụ thể viết hoa chữ "Điều" (QĐ 739 Điều 26 khoản 7)'],
  [new RegExp(`(?<![\\p{L}])${after('cổ|thành|bộ|một|từng|toàn|hết|phân|nửa|tiểu')}(chương|phần)(?=\\s+[IVXLC]+(?![\\p{L}]))`, 'gu'), up1, 'Viện dẫn Chương, Phần cụ thể viết hoa (QĐ 739 Điều 26 khoản 7)'],
  [new RegExp(`(?<![\\p{L}])${after('hạng|danh|tiểu|đề|chuyên|tên')}mục(?=\\s+\\d)`, 'gu'), up1, 'Viện dẫn Mục cụ thể viết hoa (QĐ 739 Điều 26 khoản 7)'],
  [/(?<=\p{L}\s)Khoản(?=\s+\d)/gu, low1, 'Khi viện dẫn, "khoản" viết thường (QĐ 739 Điều 26 khoản 7)'],
  [/(?<=\p{L}\s)Điểm(?=\s+[a-zđ]\)?(?![\p{L}]))/gu, low1, 'Khi viện dẫn, "điểm" viết thường (QĐ 739 Điều 26 khoản 7)'],
  [/(?<=\p{L}\s)(Tỉnh|Huyện|Thị xã|Thành phố)(?=\s+\p{Lu})(?!\s+Hồ Chí Minh)/gu, low1, 'Danh từ chung chỉ đơn vị hành chính viết thường (NĐ 30 Phụ lục II; QĐ 739 Điều 24)'],
  [/(?<![\p{L}])nhà nước(?![\p{L}])/gu, up1, '"Nhà nước" luôn viết hoa (NĐ 30 Phụ lục II; QĐ 739 Điều 26)'],
];

// Từ mượn kỹ thuật thường gặp (không phải lỗi gõ)
const LOANWORDS = new Set(['rulô', 'bulông', 'palăng', 'silô', 'ôxy', 'rơle', 'urê', 'tuýp', 'ôxít', 'ôxi', 'amiăng', 'ắcquy', 'mômen', 'mêtan', 'nitơ'].map(x => x.normalize('NFC')));
const VOWELS = 'aăâeêioôơuưyàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ';
// Viết tắt: không có nguyên âm (đc, đcc, dđ, kdđ…) hoặc IN HOA có cụm phụ âm không thể có trong tiếng Việt (TƯLĐTT)
const isAcronym = w => {
  const lw = w.toLocaleLowerCase('vi');
  if (![...lw].some(c => VOWELS.includes(c))) return true;
  if (w.length < 3 || w !== w.toLocaleUpperCase('vi')) return false;
  const rest = lw.replace(/^(ngh|ng|nh|ch|tr|th|ph|kh|gh|gi|qu)/, '');
  return new RegExp('[^' + VOWELS + ']{3}$|[^' + VOWELS + ']{4}', 'u').test(rest);
};

// URL, e-mail, tên tệp, mã kiểu "f.1", "x.y": không được viết hoa đầu câu
const isTechToken = t => /^(https?:|ftp:|www\.)|@|[\p{L}\d][./\\:_][\p{L}\d]/u.test(t);
// Chữ viết tắt thường gặp trước dấu chấm (không phải hết câu)
const ABBR = /^(TP|Tp|TS|ThS|PGS|GS|KS|BS|Ths|St|v\.v|vv|tr|Tr|đ|đc|Đc|ĐC|P|Q|KT|TM|TL|TUQ|No|Mr|Mrs|Ms|Dr|ca|tt|TT)$/;

/**
 * Trả về các lỗi chính tả trong một đoạn: [{start, end, before, after|null, code, msg}]
 * opts.sentenceCase: có kiểm tra viết hoa đầu câu không (chỉ áp dụng cho phần nội dung).
 */
export function checkSpelling(raw, opts = {}) {
  const out = [];
  const taken = [];
  const overlap = (s, e) => taken.some(([a, b]) => s < b && e > a);
  const push = x => { if (!overlap(x.start, x.end)) { out.push(x); taken.push([x.start, x.end]); } };

  // 2) Từ điển (ưu tiên vì là cụm từ)
  for (const [re, right] of COMMON_RE) {
    re.lastIndex = 0;
    for (const m of raw.matchAll(re)) push({ start: m.index, end: m.index + m[0].length, before: m[0], after: keepCase(m[0], right), code: 'chinh-ta-tu-dien', msg: `Viết sai chính tả: "${m[0]}" → "${keepCase(m[0], right)}".` });
  }

  // Quy tắc viết hoa của NĐ 30/2020 (Phụ lục II) và QĐ 739/QĐ-EVN (Chương V) — áp dụng cho cả hai chuẩn
  if (opts.capRules) {
    for (const [re, fix, msg] of CAP_RULES) {
      for (const m of raw.matchAll(re)) {
        const after = fix(m[0]);
        if (after !== m[0]) push({ start: m.index, end: m.index + m[0].length, before: m[0], after, code: 'viet-hoa-quy-dinh', msg: `${msg}: "${m[0]}" → "${after}".` });
      }
    }
  }

  // EVN: viết hoa chức danh, cụm từ theo bảng của Tập đoàn
  if (opts.evnCase) {
    for (const [re, right] of EVN_RE) {
      for (const m of raw.matchAll(re)) {
        if (m[0] === right || m[0] === m[0].toLocaleUpperCase('vi')) continue; // đúng rồi, hoặc dòng in hoa
        if (opts.nddh && (right === 'Trưởng phòng' || right === 'Phó Trưởng phòng')) continue; // NĐDH: biểu mẫu viết "Trưởng Phòng", "Phó Trưởng Phòng"
        push({ start: m.index, end: m.index + m[0].length, before: m[0], after: right, code: 'viet-hoa-evn', msg: `Viết hoa theo bảng của EVN: "${m[0]}" → "${right}".` });
      }
    }
  }

  // 1) Từng âm tiết
  for (const m of raw.matchAll(/[\p{L}\p{M}]+/gu)) {
    const s = m.index, e = s + m[0].length, w = m[0].normalize('NFC'); // dấu rời (Unicode tổ hợp) ghép lại; vị trí s, e vẫn theo chuỗi gốc
    if (overlap(s, e) || w.length > 7 || w === 'đ' || LOANWORDS.has(w.toLocaleLowerCase('vi')) || isAcronym(w)) continue;
    if (/[fjwz]/i.test(w) && !/(w|j|f|z)$/i.test(w) && !hasVnMark(w)) continue; // chữ nước ngoài
    const isAbbr = w === w.toUpperCase() && !hasVnMark(w.replace(/Đ/g, 'D')) && w.length <= 6; // NĐ, NMNĐ, UBND…
    if (isAbbr) continue;
    if (/[A-ZĐ]/.test(w.slice(1)) && w !== w.toUpperCase()) continue; // kiểu "iPhone", "ThS"
    const lower = w.toLocaleLowerCase('vi');
    if (parseSyllable(lower)) continue;
    const rule = onsetRule(lower);
    if (rule) { push({ start: s, end: e, before: m[0], after: keepCase(w, rule), code: 'chinh-ta-phu-am', msg: `Sai quy tắc c/k, g/gh, ng/ngh: "${w}" → "${keepCase(w, rule)}".` }); continue; }
    if (!hasVnMark(w)) {
      const t = fromTelex(lower);
      if (t && t !== lower) push({ start: s, end: e, before: m[0], after: keepCase(w, t), code: 'chinh-ta-telex', msg: `Gõ sót kiểu Telex: "${w}" → "${keepCase(w, t)}".` });
      continue; // chữ không dấu, không phải Telex → có thể là từ nước ngoài, bỏ qua
    }
    push({ start: s, end: e, before: m[0], after: null, code: 'chinh-ta-am-tiet', msg: `"${w}" không phải âm tiết tiếng Việt hợp lệ — có thể gõ nhầm, cần xem lại.` });
  }

  // 3) Viết hoa đầu câu
  if (opts.sentenceCase) {
    const lead = raw.match(/^(\s*(?:\d+(?:\.\d+)*\.\s+)?)(\p{Ll})/u);
    if (lead && !isTechToken(raw.slice(lead[1].length).match(/^\S+/)[0]) && !/^\s*[-–+•*]/.test(raw) && !/^\s*[a-zđ][).]\s/u.test(raw)) {
      const at = lead[1].length;
      push({ start: at, end: at + 1, before: lead[2], after: lead[2].toLocaleUpperCase('vi'), code: 'viet-hoa-dau-cau', msg: 'Chữ đầu đoạn phải viết hoa.' });
    }
    for (const m of raw.matchAll(/(\p{L}+)([.!?])\s+(\p{Ll})/gu)) {
      if (m[1].length === 1 || ABBR.test(m[1]) || m[1] === m[1].toUpperCase()) continue; // v.v., TP., A.
      const at = m.index + m[0].length - 1;
      if (isTechToken(raw.slice(0, m.index + m[1].length).match(/\S+$/)[0]) || isTechToken(raw.slice(at).match(/^\S+/)[0])) continue; // URL, e-mail, tên tệp: không đổi chữ
      push({ start: at, end: at + 1, before: m[3], after: m[3].toLocaleUpperCase('vi'), code: 'viet-hoa-dau-cau', msg: `Chữ sau dấu "${m[2]}" phải viết hoa.` });
    }
    // EVN (Điều 22 QĐ 739): sau dấu hai chấm
    if (opts.colonCase) {
      for (const m of raw.matchAll(/(\p{L}|\))\s*:\s+(\p{Ll})(?![\p{L}\p{M}]*\s*[.…_]{2,})/gu)) { // bỏ qua chỗ trống chờ điền ("ngày......tháng......")
        const at = m.index + m[0].length - 1;
        // Điều 22 chỉ yêu cầu viết hoa khi sau dấu hai chấm là MỘT CÂU HOÀN CHỈNH — máy không xác định chắc được → chỉ gợi ý, không tự sửa
        push({ start: at, end: at + 1, before: m[2], after: null, code: 'viet-hoa-hai-cham', msg: `Sau dấu hai chấm: nếu phần sau là một câu hoàn chỉnh thì viết hoa chữ đầu ("${raw.slice(at, at + 12).trim()}…") — QĐ 739/QĐ-EVN, Điều 22. Liệt kê thì giữ chữ thường.` });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export { parseSyllable, fromTelex, COMMON };
