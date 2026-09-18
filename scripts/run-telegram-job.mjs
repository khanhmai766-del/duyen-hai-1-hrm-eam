#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const jobs = new Set(["monitor", "shift", "level-one"]);
const job = String(process.argv[2] ?? "").trim().toLowerCase();
const dryRun = process.argv.includes("--dry-run");
if (!jobs.has(job)) {
  console.error("Cách dùng: node scripts/run-telegram-job.mjs <monitor|shift|level-one> [--dry-run]");
  process.exit(2);
}

const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile) && typeof process.loadEnvFile === "function") process.loadEnvFile(envFile);
const token = process.env.TELEGRAM_JOB_TOKEN?.trim();
if (!token) {
  console.error("Thiếu TELEGRAM_JOB_TOKEN trong .env");
  process.exit(2);
}

const port = Number(process.env.PORT || 3000);
const response = await fetch(`http://127.0.0.1:${port}/api/internal/telegram-jobs`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ job, dryRun }),
  signal: AbortSignal.timeout(120_000),
});
const body = await response.text();
if (!response.ok) {
  console.error(`Tác vụ Telegram ${job} thất bại (HTTP ${response.status}): ${body.slice(0, 2_000)}`);
  process.exit(1);
}
console.log(`Tác vụ Telegram ${job}${dryRun ? " (xem trước)" : ""} thành công`);
if (dryRun) console.log(body);
