// Chốt an toàn dùng chung cho scripts/verify.
//
// Các script crawl/hydration/ảnh-theo-trang/ssr TẠO USER ADMIN TẠM trong DB và TỰ KÝ cookie phiên bằng
// AUTH_SECRET đọc từ .env. Chỉ được làm vậy với DB dev local và site chạy trên máy này — tuyệt đối không
// trỏ vào Production (không tạo user trên DB thật, không ký token bằng secret Production).
import { mkdirSync } from "node:fs";
import path from "node:path";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function loadDevEnv() {
  try {
    process.loadEnvFile(".env");
  } catch {
    fail("không đọc được .env — chạy script từ GỐC repo (npm run dev phải chạy được).");
  }
}

export function assertLocalBase(base) {
  let url;
  try {
    url = new URL(base);
  } catch {
    fail(`BASE không hợp lệ: ${base} (vd http://127.0.0.1:3031)`);
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    fail(`BASE phải là máy local (localhost/127.0.0.1), nhận "${url.hostname}". Script này tạo user tạm + ký cookie — KHÔNG chạy vào Production.`);
  }
  return url;
}

export function assertDevDatabase() {
  if (process.env.NODE_ENV === "production") fail("NODE_ENV=production — từ chối chạy.");
  const raw = process.env.DATABASE_URL;
  if (!raw) fail("thiếu DATABASE_URL trong .env");
  let host;
  try {
    host = new URL(raw).hostname;
  } catch {
    fail("DATABASE_URL không đọc được");
  }
  if (!LOCAL_HOSTS.has(host)) {
    fail(`DATABASE_URL phải trỏ DB dev local, đang trỏ "${host}". Từ chối tạo user tạm trên DB này.`);
  }
  if (!(process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET)) fail("thiếu AUTH_SECRET trong .env");
}

/** Đường dẫn file kết quả mặc định: reports/verify/<tên>-<thời điểm>.json (thư mục đã gitignore). */
export function defaultOut(name) {
  const dir = path.join("reports", "verify");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return path.join(dir, `${name}-${stamp}.json`);
}

export function fail(message) {
  console.error(`DỪNG: ${message}`);
  process.exit(2);
}
