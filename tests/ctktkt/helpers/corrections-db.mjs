// Dùng chung cho các test lưu theo ca / yêu cầu sửa chạy trên DB dev THẬT (giai đoạn 3: thay giả lập pg bằng DB thật).
// Mỗi tệp test dùng một tháng riêng của năm 2001 (không có dữ liệu thật), dọn trước và sau khi chạy.
// Chạy được với cả bản SQL cũ (getPool) lẫn bản Prisma — nên dùng để so hai bản.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';

// Code được kiểm (pool pg cũ / Prisma) đọc DATABASE_URL từ môi trường; test runner không nạp .env nên nạp ở đây.
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = readFileSync('.env', 'utf8').match(/^DATABASE_URL="([^"]+)"/m)[1];

export function devDatabaseUrl() {
  const env = readFileSync('.env', 'utf8');
  const url = new URL(env.match(/^DATABASE_URL="([^"]+)"/m)[1]);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Chỉ chạy trên DB dev (localhost).');
  url.searchParams.delete('schema');
  return url.toString();
}

/** Kết nối pg riêng của test (đọc/dọn) — độc lập với code đang được kiểm. */
export async function testClient() {
  const client = new pg.Client({ connectionString: devDatabaseUrl() });
  await client.connect();
  return client;
}

/** Xoá mọi dòng của tháng thử (`YYYY-MM`) trong 4 bảng mà lưu theo ca / yêu cầu sửa ghi vào. */
export async function cleanupMonth(client, month) {
  assert.match(month, /^2001-\d{2}$/, 'Chỉ dọn tháng thử của năm 2001.');
  const like = `${month}-%`;
  await client.query("DELETE FROM public.ctktkt_daily_inputs WHERE operating_date LIKE $1 AND field_code LIKE 'KTKT:%'", [like]);
  await client.query("DELETE FROM public.ctktkt_daily_input_audit WHERE operating_date LIKE $1 AND field_code LIKE 'KTKT:%'", [like]);
  await client.query('DELETE FROM public.ctktkt_input_ownership WHERE operating_date LIKE $1', [like]);
  await client.query('DELETE FROM public.ctktkt_correction_requests WHERE operating_date LIKE $1', [like]);
}

export async function seedCell(client, date, cell, value, owner) {
  await client.query("INSERT INTO public.ctktkt_daily_inputs(operating_date, field_code, value, note, updated_at) VALUES ($1, $2, $3, '', '2001-01-01 00:00:00')", [date, `KTKT:${cell}`, value]);
  if (owner) await client.query('INSERT INTO public.ctktkt_input_ownership(operating_date, field_code, owner_id, shift_start) VALUES ($1, $2, $3, $4)', [date, `KTKT:${cell}`, owner.id, owner.shiftStart]);
}

export async function cellValue(client, date, cell) {
  return (await client.query('SELECT value FROM public.ctktkt_daily_inputs WHERE operating_date = $1 AND field_code = $2', [date, `KTKT:${cell}`])).rows[0]?.value ?? null;
}

/** Đóng kết nối của code được kiểm (pool pg cũ và/hoặc Prisma) để tiến trình test kết thúc. */
export async function closeImplementationConnections() {
  try { const { prisma } = await import('../../../lib/prisma.ts'); await prisma.$disconnect(); } catch { /* bản không dùng Prisma */ }
}
