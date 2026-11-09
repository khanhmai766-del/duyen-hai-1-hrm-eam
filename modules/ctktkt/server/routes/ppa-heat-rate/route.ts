import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ktktUtcNow, ktktWrite } from "@/modules/ctktkt/db/prisma";
import { operationalWriteKeysFor } from "@/modules/ctktkt/lib/operational-query-policy";
import { calculatePpaHeatRate, type PpaSourceData } from "@/modules/ctktkt/lib/ppa-heat-rate";
import { upsertPpaDay } from "@/modules/ctktkt/lib/ppa-heat-rate-persistence";
import { requireAnyPermission, requireSession } from "@/modules/ctktkt/lib/auth/server";
import {reportQueryRange} from "@/modules/ctktkt/lib/report-read-range";

const datePattern = /^(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const periodPattern = /^20\d{2}-(0[1-9]|1[0-2])$/;
const unavailable = () => fail("Chưa truy cập được kho dữ liệu. Dữ liệu trên màn hình vẫn được giữ để bạn thử lưu lại.", 503);

function cleanSource(value: unknown): PpaSourceData {
  if (!value || typeof value !== "object") throw new Error("Dữ liệu công tơ không hợp lệ.");
  const source = value as Record<string, unknown>;
  return Object.fromEntries(["grossS1", "netS1", "grossS2", "netS2"].map(key => {
    const values = source[key];
    if (!Array.isArray(values) || values.length !== 48 || values.some(item => typeof item !== "number" || !Number.isFinite(item) || item < 0)) throw new Error("Mỗi điểm đo phải có đủ 48 giá trị nửa giờ hợp lệ.");
    return [key, values];
  })) as PpaSourceData;
}

export async function GET(request: Request) {
  const session = await requireSession(); if (!session.ok) return session.response;
  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "";
  const includeSource = url.searchParams.get("includeSource") === "1";
  const range=reportQueryRange(url.searchParams);
  if (!periodPattern.test(period)||!range) return fail("Tháng theo dõi không hợp lệ.", 400);
  try {
    const rows = await prisma.ctktktPpaHeatRateDaily.findMany({
      where: { operating_date: { gte: range.from, lt: range.next } }, orderBy: { operating_date: "asc" },
    });
    const entries = rows.map(row => {
      const record = {
        operatingDate: row.operating_date, sourceFiles: row.source_files, grossS1Kwh: row.gross_s1_kwh, netS1Kwh: row.net_s1_kwh,
        grossS2Kwh: row.gross_s2_kwh, netS2Kwh: row.net_s2_kwh, ppaPlant: row.ppa_plant, ppaS1: row.ppa_s1, ppaS2: row.ppa_s2,
        noteS1: row.note_s1, noteS2: row.note_s2, updatedAt: row.updated_at,
      };
      if (!includeSource) return record;
      let source: unknown = null;
      try { source = JSON.parse(row.source_data); } catch { source = null; }
      return { ...record, source };
    });
    return ok({ entries });
  } catch { return unavailable(); }
}

export async function POST(request: Request) {
  const guard = await requireAnyPermission("edit_ppa"); if (!guard.ok) return guard.response;
  if (!isCtktktSameOrigin(request)) return fail("Nguồn yêu cầu không hợp lệ.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return fail("Yêu cầu phải là JSON.", 415);
  try {
    const raw = await request.text();
    if (raw.length > 150_000) return fail("Dữ liệu gửi lên quá lớn.", 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const operatingDate = String(body.operatingDate || ""), source = cleanSource(body.source);
    if (!datePattern.test(operatingDate)) throw new Error("Ngày vận hành không hợp lệ.");
    const sourceFiles = Array.isArray(body.sourceFiles) ? body.sourceFiles.map(value => String(value).slice(0, 150)).slice(0, 8) : [];
    const noteS1 = String(body.noteS1 || "").trim().slice(0, 1000), noteS2 = String(body.noteS2 || "").trim().slice(0, 1000);
    const result = calculatePpaHeatRate(source, Number(operatingDate.slice(0, 4)));
    const updatedAt = ktktUtcNow();
    await ktktWrite(operationalWriteKeysFor("ppa_heat_rate_daily", [operatingDate]), tx => upsertPpaDay(tx, {
      operatingDate, sourceData: JSON.stringify(source), sourceFiles: JSON.stringify(sourceFiles),
      grossS1Kwh: String(result.grossS1Kwh), netS1Kwh: String(result.netS1Kwh), grossS2Kwh: String(result.grossS2Kwh), netS2Kwh: String(result.netS2Kwh),
      ppaPlant: String(result.ppaPlant), ppaS1: String(result.ppaS1), ppaS2: String(result.ppaS2), noteS1, noteS2,
    }, updatedAt));
    return ok({ result });
  } catch (error) {
    return fail(error instanceof SyntaxError ? "Dữ liệu JSON không hợp lệ." : error instanceof Error ? error.message : "Dữ liệu không hợp lệ.", 400);
  }
}
