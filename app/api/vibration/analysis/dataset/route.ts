import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";
import { analysisDefaults } from "@/lib/vibration/analysis/engine";
import { metaGet, metaGetPrefix } from "@/lib/vibration/analysis/server-meta";
import type { AnalysisDevice, AnalysisRecord, AnalysisSettings } from "@/lib/vibration/analysis/types";
import { requireVibrationView } from "@/lib/vibration/server";

export const dynamic = "force-dynamic";

/** Bộ dữ liệu cho trang Phân tích độ rung (số đo của MỌI thiết bị cùng lúc, như bản VibraControl cũ nạp cả `db`).
 *  Query: scope = "rotating" (mặc định; số đo hàng tuần/MNK/TBNT/Excel lịch sử — dùng cho Phân tích độ rung)
 *                | "mill" (12 máy nghiền, bản ghi theo ca có millData — dùng cho Phân tích độ rung MILL);
 *         archived=1 (kèm thiết bị không còn hoạt động).
 *  Trả data: { devices: AnalysisDevice[] (đã gắn records[], analysis.baselineFrom), settings: AnalysisSettings }. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireVibrationView();
    const p = req.nextUrl.searchParams;
    const scope = p.get("scope") === "mill" ? "mill" : "rotating";
    const archived = p.get("archived") === "1";

    const kinds = scope === "mill" ? ["MILL"] : ["WEEKLY", "MNK", "TBNT", "HISTORY_XLSX"];
    const rows = await prisma.vibrationRecord.findMany({
      where: { kind: { in: kinds }, ...(scope === "rotating" ? { date: { not: null } } : {}) },
      select: { id: true, deviceId: true, date: true, kind: true, shift: true, person: true, measureTime: true, values: true, millData: true, note: true, savedAt: true },
      orderBy: { savedAt: "asc" },
    });
    const byDevice = new Map<string, AnalysisRecord[]>();
    for (const r of rows) {
      const rec: AnalysisRecord = {
        id: r.id, date: r.date, measureTime: r.measureTime, person: r.person, values: Array.isArray(r.values) ? (r.values as unknown[]) : [],
        extra: {}, note: r.note, savedAt: r.savedAt.toISOString(), kind: r.kind, shift: r.shift, millData: scope === "mill" ? (r.millData as Record<string, unknown> | null) : null,
      };
      (byDevice.get(r.deviceId) ?? byDevice.set(r.deviceId, []).get(r.deviceId)!).push(rec);
    }
    const devs = await prisma.vibrationDevice.findMany({
      where: { id: { in: [...byDevice.keys()] }, ...(archived || scope === "mill" ? {} : { active: true }) },
      orderBy: [{ area: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    const baselines = new Map((await metaGetPrefix<{ baselineFrom?: string }>("baseline:")).map((b) => [b.key.slice(9), b.value?.baselineFrom || ""]));
    // Danh mục thiết bị lưu ngày sửa chữa/đại tu ở machine.lastOverhaul (bản cũ: analysis.baselineFrom); khoá meta baseline: chỉ là dự phòng dữ liệu cũ.
    const lastOverhaulOf = (m: unknown) => { const v = m && typeof m === "object" ? (m as Record<string, unknown>).lastOverhaul : ""; return typeof v === "string" ? v : ""; };
    const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
    const devices: AnalysisDevice[] = devs.map((d) => ({
      id: d.id, legacyId: d.legacyId, name: d.name, area: d.area, system: d.system,
      machine: d.machine ? obj(d.machine) : null, alertConfig: obj(d.alertConfig) as AnalysisDevice["alertConfig"],
      analysis: (lastOverhaulOf(d.machine) || baselines.get(d.id)) ? { baselineFrom: lastOverhaulOf(d.machine) || baselines.get(d.id) } : null,
      records: byDevice.get(d.id) ?? [],
    }));
    const stored = await metaGet<Partial<AnalysisSettings>>("settings");
    return ok({ devices, settings: { ...analysisDefaults, ...(stored?.value ?? {}) } });
  });
}
