#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Cùng cách nạp môi trường với các tác vụ Telegram trên VPS (Node 24).
const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("Thiếu CRON_SECRET cho tác vụ dọn ảnh KTKT.");
  process.exit(2);
}
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT của ứng dụng không hợp lệ.");
  process.exit(2);
}
try {
  const response = await fetch(`http://127.0.0.1:${port}/api/ctktkt/cron/coal-photos`, {
    headers: { Authorization: `Bearer ${secret}` },
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok || (await response.json()).ok !== true) {
    console.error(`Không dọn được ảnh KTKT (HTTP ${response.status}).`);
    process.exitCode = 1;
  } else console.log("Đã dọn ảnh công tơ than hết hạn và bộ đếm OCR cũ.");
} catch {
  console.error("Không gọi được tác vụ dọn ảnh KTKT trên ứng dụng local của VPS.");
  process.exitCode = 1;
}
