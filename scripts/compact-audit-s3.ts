import { loadEnvConfig } from "@next/env";
import { getS3ObjectBuffer, listS3ObjectKeys, uploadS3Object } from "../lib/s3";

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
  if (!DATE_PATTERN.test(date)) throw new Error("Ngày phải có định dạng YYYY-MM-DD");
  const [year, month, day] = date.split("-");
  const root = (process.env.AUDIT_LOG_S3_PREFIX || "audit-logs").replace(/^\/+|\/+$/g, "");
  const folder = `${root}/daily/${year}/${month}/${day}`;
  const keys = (await listS3ObjectKeys(`${folder}/parts/`)).filter((key) => key.endsWith(".ndjson")).sort();
  if (!keys.length) {
    console.log(`Không có audit part cho ngày ${date}`);
    return;
  }

  const parts = await Promise.all(keys.map((key) => getS3ObjectBuffer(key)));
  const body = Buffer.concat(parts.map((part) => part.at(-1) === 10 ? part : Buffer.concat([part, Buffer.from("\n")])));
  const outputKey = `${folder}/audit-${date}.ndjson`;
  await uploadS3Object({
    key: outputKey,
    body,
    contentType: "application/x-ndjson; charset=utf-8",
    originalName: `audit-${date}.ndjson`,
  });
  console.log(`Đã hợp nhất ${keys.length} sự kiện vào ${outputKey}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
