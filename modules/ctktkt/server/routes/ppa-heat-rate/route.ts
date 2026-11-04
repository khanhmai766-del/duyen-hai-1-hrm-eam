import { getRawDb } from "@/modules/ctktkt/db";
import { calculatePpaHeatRate, type PpaSourceData } from "@/modules/ctktkt/lib/ppa-heat-rate";
import { PPA_HEAT_RATE_UPSERT_SQL } from "@/modules/ctktkt/lib/ppa-heat-rate-persistence";
import { requireAnyPermission, requireSession } from "@/modules/ctktkt/lib/auth/server";
import {reportQueryRange} from "@/modules/ctktkt/lib/report-read-range";

const datePattern = /^(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const periodPattern = /^20\d{2}-(0[1-9]|1[0-2])$/;
const unavailable = () => Response.json({ error: "Chưa truy cập được kho dữ liệu. Dữ liệu trên màn hình vẫn được giữ để bạn thử lưu lại." }, { status: 503 });

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
  if (!periodPattern.test(period)||!range) return Response.json({ error: "Tháng theo dõi không hợp lệ." }, { status: 400 });
  try {
    const columns = `operating_date AS operatingDate, source_files AS sourceFiles, gross_s1_kwh AS grossS1Kwh, net_s1_kwh AS netS1Kwh, gross_s2_kwh AS grossS2Kwh, net_s2_kwh AS netS2Kwh, ppa_plant AS ppaPlant, ppa_s1 AS ppaS1, ppa_s2 AS ppaS2, note_s1 AS noteS1, note_s2 AS noteS2, updated_at AS updatedAt${includeSource ? ", source_data AS sourceData" : ""}`;
    const { results } = await getRawDb().prepare(`SELECT ${columns} FROM ppa_heat_rate_daily WHERE operating_date >= ? AND operating_date < ? ORDER BY operating_date`).bind(range.from, range.next).all();
    const entries = includeSource
      ? results.map(row => {
          const record = row as Record<string, unknown>;
          const raw = record.sourceData;
          let source: unknown = null;
          if (typeof raw === "string") { try { source = JSON.parse(raw); } catch { source = null; } }
          const rest = { ...record };
          delete rest.sourceData;
          return { ...rest, source };
        })
      : results;
    return Response.json({ entries }, { headers: { "Cache-Control": "no-store" } });
  } catch { return unavailable(); }
}

export async function POST(request: Request) {
  const guard = await requireAnyPermission("edit_ppa"); if (!guard.ok) return guard.response;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Yêu cầu phải là JSON." }, { status: 415 });
  try {
    const raw = await request.text();
    if (raw.length > 150_000) return Response.json({ error: "Dữ liệu gửi lên quá lớn." }, { status: 413 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    const operatingDate = String(body.operatingDate || ""), source = cleanSource(body.source);
    if (!datePattern.test(operatingDate)) throw new Error("Ngày vận hành không hợp lệ.");
    const sourceFiles = Array.isArray(body.sourceFiles) ? body.sourceFiles.map(value => String(value).slice(0, 150)).slice(0, 8) : [];
    const noteS1 = String(body.noteS1 || "").trim().slice(0, 1000), noteS2 = String(body.noteS2 || "").trim().slice(0, 1000);
    const result = calculatePpaHeatRate(source, Number(operatingDate.slice(0, 4)));
    await getRawDb().prepare(PPA_HEAT_RATE_UPSERT_SQL).bind(operatingDate, JSON.stringify(source), JSON.stringify(sourceFiles), String(result.grossS1Kwh), String(result.netS1Kwh), String(result.grossS2Kwh), String(result.netS2Kwh), String(result.ppaPlant), String(result.ppaS1), String(result.ppaS2), noteS1, noteS2).run();
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof SyntaxError ? "Dữ liệu JSON không hợp lệ." : error instanceof Error ? error.message : "Dữ liệu không hợp lệ." }, { status: 400 });
  }
}
