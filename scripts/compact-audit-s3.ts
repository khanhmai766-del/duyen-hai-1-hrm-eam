import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { deleteS3ObjectByKey, getS3ObjectBuffer, listS3ObjectKeys, uploadS3Object } from "../lib/s3";

loadEnvConfig(process.cwd());

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function yesterdayInVietnam() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function main() {
  const date = process.argv[2] || yesterdayInVietnam();
  const deleteParts = process.argv.includes("--delete-parts");
  if (!DATE_PATTERN.test(date)) throw new Error("Ngày phải có định dạng YYYY-MM-DD");
  const [year, month, day] = date.split("-");
  const root = (process.env.AUDIT_LOG_S3_PREFIX || "audit-logs").replace(/^\/+|\/+$/g, "");
  const folder = `${root}/daily/${year}/${month}/${day}`;
  const outputKey = `${folder}/audit-${date}.ndjson.gz`;
  const keys = (await listS3ObjectKeys(`${folder}/parts/`)).filter((key) => key.endsWith(".ndjson")).sort();
  let previous = Buffer.alloc(0);
  try {
    previous = gunzipSync(await getS3ObjectBuffer(outputKey));
  } catch {
    // Chưa có bản tổng hợp: tạo mới từ các part còn nguyên.
  }
  if (!keys.length && !previous.length) {
    console.log(`Không có audit part cho ngày ${date}`);
    return;
  }

  const parts = await Promise.all(keys.map((key) => getS3ObjectBuffer(key)));
  const lines = [...previous.toString("utf8").split("\n"), ...parts.flatMap((part) => part.toString("utf8").split("\n"))]
    .map((line) => line.trim()).filter(Boolean);
  const records = new Map<string, { line: string; createdAt: string }>();
  for (const line of lines) {
    const value = JSON.parse(line) as { id?: string; createdAt?: string };
    if (!value.id || !value.createdAt) throw new Error("Audit part không hợp lệ; giữ nguyên toàn bộ part");
    records.set(value.id, { line, createdAt: value.createdAt });
  }
  const body = Buffer.from(
    [...records.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((item) => item.line).join("\n") + "\n",
    "utf8"
  );
  const compressed = gzipSync(body, { level: 9 });
  await uploadS3Object({
    key: outputKey,
    body: compressed,
    contentType: "application/gzip",
    originalName: `audit-${date}.ndjson.gz`,
  });
  const uploaded = gunzipSync(await getS3ObjectBuffer(outputKey));
  const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex");
  if (uploaded.length !== body.length || digest(uploaded) !== digest(body)) {
    throw new Error("Tệp audit sau khi tải lên không khớp dữ liệu nguồn; giữ nguyên toàn bộ part");
  }
  console.log(`Đã hợp nhất và kiểm tra ${keys.length} sự kiện vào ${outputKey}`);
  if (!deleteParts) {
    console.log("Các part vẫn được giữ nguyên. Thêm --delete-parts để dọn sau khi kiểm tra thành công.");
    return;
  }
  for (const key of keys) await deleteS3ObjectByKey(key);
  console.log(`Đã xóa ${keys.length} part sau khi xác minh bản tổng hợp.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
