// Kiểm tra bộ tối ưu ảnh /_next/image: ảnh hợp lệ phải ra WebP; mọi yêu cầu ngoài khoá phải bị từ chối.
//   node scripts/verify/image-check.mjs <BASE>
//   vd: node scripts/verify/image-check.mjs http://127.0.0.1:3031
//       node scripts/verify/image-check.mjs https://duyenhai1.vn     (chỉ gọi URL công khai, không đăng nhập)
// Khoá ảnh nằm ở next.config.mjs (images.localPatterns...) — sửa khoá thì cập nhật danh sách dưới đây.
import { statSync, existsSync } from "node:fs";

const BASE = (process.argv[2] ?? "http://127.0.0.1:3031").replace(/\/$/, "");
const img = (url, w, q = 75) => `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=${q}`;

const ALLOW = [
  ["ảnh nền 2,2MB", img("/brand/ba-dong.jpg", 1920), "public/brand/ba-dong.jpg"],
  ["ảnh cương vị PNG", img("/chucvu/nh3.png", 640), "public/chucvu/nh3.png"],
  ["ảnh cương vị JPG", img("/chucvu/truong-ca.jpg", 828), "public/chucvu/truong-ca.jpg"],
  ["logo topbar", img("/brand/4.png", 64), "public/brand/4.png"],
  ["icon 3D", img("/icons3d/calendar.png", 64), "public/icons3d/calendar.png"],
  ["logo đăng nhập", img("/brand/1234.png", 384), "public/brand/1234.png"],
];
const DENY = [
  ["domain ngoài (Wikimedia)", img("https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg", 640)],
  ["domain ngoài (chính site)", img("https://duyenhai1.vn/brand/4.png", 64)],
  ["đường dẫn ngoài 3 thư mục", img("/material-procedures/x.png", 640)],
  ["file video", img("/videos/bg.mp4", 640)],
  ["kèm query string", img("/brand/4.png?v=1", 64)],
  ["đi ngược thư mục", img("/brand/../.env", 64)],
  ["kích thước không cho phép 3840", img("/brand/ba-dong.jpg", 3840)],
  ["kích thước lẻ 100", img("/brand/4.png", 100)],
  ["chất lượng không cho phép 90", img("/brand/4.png", 64, 90)],
  ["API nội bộ qua bộ tối ưu", img("/api/me", 64)],
];
const NOTE = [["đuôi .jfif (component giữ <img>)", img("/brand/bg-nhansu.jfif", 640)]];

// Gửi Accept giống trình duyệt: Next chọn định dạng ra theo header này (fetch mặc định "*/*" → giữ gốc).
async function hit(path) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, { redirect: "manual", headers: { accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" } });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status, ms: Date.now() - t0, bytes: buf.length,
    type: res.headers.get("content-type") ?? "", cache: res.headers.get("x-nextjs-cache") ?? "",
    cc: res.headers.get("cache-control") ?? "", disp: res.headers.get("content-disposition") ?? "",
    csp: res.headers.get("content-security-policy") ?? "",
  };
}

let bad = 0;
console.log(`BASE ${BASE}\n\n— PHẢI ĐƯỢC PHỤC VỤ (200 image/webp):`);
for (const [label, path, file] of ALLOW) {
  const a = await hit(path);
  const b = await hit(path);
  const orig = existsSync(file) ? statSync(file).size : 0;
  const ok = a.status === 200 && a.type.startsWith("image/webp");
  if (!ok) bad++;
  console.log(`  ${ok ? "OK " : "SAI"} ${label}: ${a.status} ${a.type} ${Math.round(orig / 1024)}KB → ${Math.round(a.bytes / 1024)}KB | ${a.ms}ms (${a.cache || "-"}) → lượt 2 ${b.ms}ms (${b.cache || "-"})`);
}
const sample = await hit(ALLOW[3][1]);
const headerOk = sample.disp.startsWith("attachment") && sample.csp.includes("sandbox");
if (!headerOk) bad++;
console.log(`  ${headerOk ? "OK " : "SAI"} header: cache-control="${sample.cc}" | content-disposition="${sample.disp}" | csp="${sample.csp}"`);

console.log(`\n— PHẢI BỊ TỪ CHỐI (4xx, không trả ảnh):`);
for (const [label, path] of DENY) {
  const r = await hit(path);
  const ok = r.status >= 400 && r.status < 500 && !r.type.startsWith("image/");
  if (!ok) bad++;
  console.log(`  ${ok ? "OK " : "SAI"} ${label}: ${r.status} ${r.type.split(";")[0]} ${r.bytes}B`);
}
console.log(`\n— GHI NHẬN:`);
for (const [label, path] of NOTE) {
  const r = await hit(path);
  console.log(`  ${label}: ${r.status} ${r.type.split(";")[0]} ${Math.round(r.bytes / 1024)}KB`);
}
console.log(`\nKẾT QUẢ: ${bad === 0 ? "ĐẠT" : `${bad} mục SAI`}`);
process.exit(bad ? 1 : 0);
