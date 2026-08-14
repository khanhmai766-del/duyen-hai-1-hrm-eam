import { NextRequest } from "next/server";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

const SCRIPT_URL = process.env.SHN_PPA_APPS_SCRIPT_URL ??
  "https://script.google.com/macros/s/AKfycbwOKGa96Ha8cxeU2iU8gbjNydrMdhAv_4IHTWu9_38ZkBHcxDqUzMj1n3481XfLWFfC/exec";
const SYNC_TOKEN = process.env.SHN_PPA_SYNC_TOKEN ?? "DH1_SYNC_2026";
const SHEET_URL = process.env.SHN_PPA_SHEET_URL ??
  "https://docs.google.com/spreadsheets/d/1L0NtMse98j0QBR2kjcK4E1Iob2XLDdrfNM99pBDBcyo/edit?gid=501878917#gid=501878917";

type SyncDay = { date: string; row: number; S1: unknown; S2: unknown; NMND: unknown };

async function readJson(response: Response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { throw fail("Apps Script trả về dữ liệu không hợp lệ", 502); }
}

export async function GET() {
  return handle(async () => {
    await requireUser();
    const response = await fetch(`${SCRIPT_URL}?action=dates`, { cache: "no-store" });
    if (!response.ok) return fail("Không thể đọc danh sách ngày từ Google Sheet", 502);
    const result = await readJson(response);
    if (!result?.ok || !Array.isArray(result.rows)) return fail(result?.error || "Không đọc được cột Ngày trên Google Sheet", 502);
    return ok({ rows: result.rows, sheetUrl: SHEET_URL });
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await request.json().catch(() => null) as { days?: SyncDay[] } | null;
    if (!body || !Array.isArray(body.days) || body.days.length < 1 || body.days.length > 31) {
      return fail("Danh sách ngày đồng bộ không hợp lệ");
    }
    if (body.days.some((day) => !day || typeof day.date !== "string" || !Number.isInteger(day.row) || day.row < 1)) {
      return fail("Dữ liệu đồng bộ không hợp lệ");
    }
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: SYNC_TOKEN, days: body.days }),
      cache: "no-store",
    });
    if (!response.ok) return fail("Không thể kết nối Google Apps Script", 502);
    const result = await readJson(response);
    if (result?.ok === false) return fail(result.error || "Google Apps Script từ chối đồng bộ", 502);
    await audit(user.id, "SYNC_SHN_PPA", "GoogleSheet", undefined,
      `Đồng bộ ${body.days.length} ngày: ${body.days.map((day) => day.date).join(", ")}`,
      { actorName: user.name });
    return ok(result);
  });
}
