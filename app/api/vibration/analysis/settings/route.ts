import type { NextRequest } from "next/server";
import { audit, fail, handle, ok } from "@/lib/api";
import { analysisDefaults } from "@/lib/vibration/analysis/engine";
import { metaGet, metaSet } from "@/lib/vibration/analysis/server-meta";
import type { AnalysisSettings } from "@/lib/vibration/analysis/types";
import { requireVibrationEntry, requireVibrationView } from "@/lib/vibration/server";

export const dynamic = "force-dynamic";

const NUMERIC = ["loadTolerance", "tempRise", "changeRatio", "baselineMin", "baselineMax", "stepRatio"] as const;

/** Tham số phân tích dùng chung (mặc định theo đặc tả). Trả data: AnalysisSettings. */
export async function GET() {
  return handle(async () => {
    await requireVibrationView();
    const stored = await metaGet<Partial<AnalysisSettings>>("settings");
    return ok<AnalysisSettings>({ ...analysisDefaults, ...(stored?.value ?? {}) });
  });
}

/** Lưu tham số phân tích (cần quyền nhập số đo độ rung). Body: { settings: Partial<AnalysisSettings> } — số không âm; baselineMin/Max là số nguyên ≥ 1. */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireVibrationEntry();
    const body = (await req.json().catch(() => null)) as { settings?: Record<string, unknown> } | null;
    const s = body?.settings;
    if (!s || typeof s !== "object") return fail("Dữ liệu gửi lên không hợp lệ", 400);
    const out: Partial<AnalysisSettings> = {};
    if (typeof s.requirePerson === "boolean") out.requirePerson = s.requirePerson;
    for (const k of NUMERIC) {
      if (s[k] === undefined) continue;
      const v = Number(s[k]);
      if (!Number.isFinite(v) || v < 0) return fail("Tham số phải là số không âm", 400);
      out[k] = k === "baselineMin" || k === "baselineMax" ? Math.max(1, Math.round(v)) : v;
    }
    const cur = (await metaGet<Partial<AnalysisSettings>>("settings"))?.value ?? {};
    const next = { ...cur, ...out };
    await metaSet("settings", next, { id: user.id, name: user.name });
    await audit(user.id, "UPDATE", "VibrationAnalysisSettings", "settings", JSON.stringify(out));
    return ok<AnalysisSettings>({ ...analysisDefaults, ...next });
  });
}
