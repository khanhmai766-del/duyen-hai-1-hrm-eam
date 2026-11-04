import { getRawDb } from "../../../db";
import { validateMeasurement } from "../../../lib/metrics";
import { requireAnyPermission, requireSession } from "../../../lib/auth/server";

const unavailable = () => Response.json({ error: "Chưa truy cập được kho dữ liệu. Số liệu chưa được lưu; hãy giữ nội dung nhập và thử lại." }, { status: 503 });
const columns = "id, metric_code AS metricCode, metric_name AS metricName, period, actual, limit_value AS limitValue, note, created_at AS createdAt";
export async function GET(request: Request) {
  const session = await requireSession(); if (!session.ok) return session.response;
  const period = new URL(request.url).searchParams.get("period");
  if (!period || !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(period)) return Response.json({ error: "Kỳ không hợp lệ." }, { status: 400 });
  try {
    const { results: rows } = await getRawDb().prepare(`SELECT ${columns} FROM measurements WHERE period = ? ORDER BY id DESC LIMIT 1000`).bind(period).all();
    return Response.json({ measurements: rows, truncated: rows.length === 1000 }, { headers: { "Cache-Control": "no-store" } });
  } catch { return unavailable(); }
}
export async function POST(request: Request) {
  const guard = await requireAnyPermission("edit_monthly_kpi"); if (!guard.ok) return guard.response;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Yêu cầu phải là JSON." }, { status: 415 });
  let values;
  try {
    const body = await request.text();
    if (body.length > 8000) return Response.json({ error: "Dữ liệu quá dài." }, { status: 413 });
    values = validateMeasurement(JSON.parse(body));
  } catch (error) { return Response.json({ error: error instanceof SyntaxError ? "Dữ liệu JSON không hợp lệ." : error instanceof Error ? error.message : "Dữ liệu không hợp lệ." }, { status: 400 }); }
  try {
    const saved = await getRawDb().prepare(`INSERT INTO measurements (metric_code, metric_name, period, actual, limit_value, note) VALUES (?, ?, ?, ?, ?, ?) RETURNING ${columns}`).bind(values.metricCode, values.metricName, values.period, values.actual, values.limitValue, values.note).first();
    if (!saved) return unavailable();
    return Response.json({ measurement: saved }, { status: 201 });
  } catch { return unavailable(); }
}
