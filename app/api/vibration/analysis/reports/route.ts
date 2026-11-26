import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { audit, fail, handle, ok } from "@/lib/api";
import { hasPermissionLevel } from "@/lib/rbac-guard";
import { metaDelete, metaGet, metaGetPrefix, metaSet } from "@/lib/vibration/analysis/server-meta";
import { VIBRATION_MANAGE_LEVELS } from "@/lib/vibration-permissions";
import { requireVibrationEntry, requireVibrationView } from "@/lib/vibration/server";

export const dynamic = "force-dynamic";
const REPORT_MAX = 300; // như SAVED_MAX của bản cũ
const LEVELS = ["na", "normal", "watch", "plan", "soon", "stop"];

export interface SavedReportDto {
  id: string; method: "iso" | "wowk"; name: string; location: string; date: string; person: string;
  level: string; conclusion: string; standard: string; confidence: string; issues: number;
  data: Record<string, unknown>; savedAt: string; savedBy: string; savedById: string | null;
}

/** Phiếu phân tích thiết bị NGOÀI danh mục đã lưu (số liệu nhập + kết luận lúc lưu; báo cáo được lập lại khi xem). Mới nhất trước. */
export async function GET() {
  return handle(async () => {
    await requireVibrationView();
    const rows = await metaGetPrefix<SavedReportDto>("report:");
    return ok(rows.map((r) => r.value).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt))));
  });
}

/** Lưu một phiếu (cần quyền nhập số đo). Body: { method, name, location?, date, person?, level, conclusion, standard, confidence, issues, data }.
 *  Phiếu cùng phương pháp + cùng số liệu nhập đã có → cập nhật thời điểm lưu (như bản cũ). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireVibrationEntry();
    const b = (await req.json().catch(() => null)) as Partial<SavedReportDto> | null;
    if (!b || (b.method !== "iso" && b.method !== "wowk") || !b.data || typeof b.data !== "object") return fail("Dữ liệu phiếu không hợp lệ", 400);
    const str = (v: unknown, max = 300) => String(v ?? "").slice(0, max);
    if (!str(b.name).trim() || !str(b.date).trim()) return fail("Cần tên thiết bị và ngày đo", 400);
    const level = LEVELS.includes(String(b.level)) ? String(b.level) : "na";
    const rows = await metaGetPrefix<SavedReportDto>("report:");
    const dataJson = JSON.stringify(b.data);
    if (dataJson.length > 60_000) return fail("Phiếu quá lớn", 400);
    const dup = rows.find((r) => r.value.method === b.method && JSON.stringify(r.value.data) === dataJson);
    const id = dup?.value.id ?? "xr-" + randomUUID();
    const dto: SavedReportDto = {
      id, method: b.method, name: str(b.name).trim(), location: str(b.location), date: str(b.date, 10), person: str(b.person), level,
      conclusion: str(b.conclusion), standard: str(b.standard), confidence: str(b.confidence), issues: Number(b.issues) || 0,
      data: b.data as Record<string, unknown>, savedAt: new Date().toISOString(), savedBy: user.name ?? user.email ?? "", savedById: user.id,
    };
    await metaSet("report:" + id, dto, { id: user.id, name: user.name });
    if (!dup && rows.length >= REPORT_MAX) for (const old of rows.slice(REPORT_MAX - 1)) await metaDelete(old.key);
    await audit(user.id, dup ? "UPDATE" : "CREATE", "VibrationAnalysisReport", id, `${dto.name} (${dto.method})`);
    return ok({ ...dto, duplicate: !!dup });
  });
}

/** Xoá phiếu (người lưu hoặc quyền quản lý độ rung). Query: id. */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireVibrationEntry();
    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!/^xr-[\w-]{8,}$/.test(id)) return fail("Mã phiếu không hợp lệ", 400);
    const row = await metaGet<SavedReportDto>("report:" + id);
    if (!row) return fail("Không tìm thấy phiếu", 404);
    const manage = await hasPermissionLevel(user, "vibration-manage", [...VIBRATION_MANAGE_LEVELS]);
    if (row.value.savedById !== user.id && !manage) return fail("Chỉ người lưu hoặc quản lý mới được xoá phiếu", 403);
    await metaDelete("report:" + id);
    await audit(user.id, "DELETE", "VibrationAnalysisReport", id, row.value.name);
    return ok({ id });
  });
}
