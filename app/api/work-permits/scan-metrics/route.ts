import { fail, handle, ok, requireUser } from "@/lib/api";
export const dynamic = "force-dynamic";

/**
 * Số đo hộp quét thẻ PCT (lib/work-permit-scan-metrics.ts) — chỉ ghi MỘT dòng log `[qr-scan-metrics]` vào log pm2
 * để đọc qua SSH khi chẩn đoán "quét chậm", không lưu DB, không audit. Mọi trường được ép kiểu/giới hạn
 * lại vì nội dung do trình duyệt gửi.
 */
const ENGINES = ["native", "wasm", "worker", "main"];
const RESULTS = ["in", "out", "info", "warn", "block"];
const MAX_BODY = 32_000;

const ms = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 0), 3_600_000) : null;
const pick = (value: unknown, allowed: string[]) => typeof value === "string" && allowed.includes(value) ? value : null;
const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const text = await req.text();
    if (text.length > MAX_BODY) return fail("Dữ liệu đo quá lớn", 413);
    let body: Record<string, unknown>;
    try { body = record(JSON.parse(text)); } catch { return fail("Dữ liệu đo không hợp lệ"); }
    const session = record(body.session);
    const scans = (Array.isArray(body.scans) ? body.scans : []).slice(0, 50).map(item => {
      const row = record(item);
      return {
        source: pick(row.source, ["camera", "manual"]), engine: pick(row.engine, ENGINES), result: pick(row.result, RESULTS),
        waitMs: ms(row.waitMs), attempts: ms(row.attempts), struggleMs: ms(row.struggleMs), crop: pick(row.crop, ["full", "wide", "zoom", "focus"]), qrPx: ms(row.qrPx),
        zoom: typeof row.zoom === "number" && Number.isFinite(row.zoom) ? Math.min(Math.max(Math.round(row.zoom * 10) / 10, 0), 100) : null,
        lookupMs: ms(row.lookupMs), actionMs: ms(row.actionMs), totalMs: ms(row.totalMs), stallMs: ms(row.stallMs),
      };
    });
    console.info(`[qr-scan-metrics] ${JSON.stringify({
      at: new Date().toISOString(), userId: user.id, final: body.final === true,
      ua: (req.headers.get("user-agent") ?? "").slice(0, 200),
      session: {
        permitId: typeof session.permitId === "string" ? session.permitId.slice(0, 40) : null,
        engine: pick(session.engine, ENGINES),
        video: typeof session.video === "string" && /^\d{1,5}x\d{1,5}$/.test(session.video) ? session.video : null,
        cameraStartMs: ms(session.cameraStartMs), attempts: ms(session.attempts), decodeAvgMs: ms(session.decodeAvgMs),
        decodeP95Ms: ms(session.decodeP95Ms), captureAvgMs: ms(session.captureAvgMs), stalls: ms(session.stalls),
        maxStallMs: ms(session.maxStallMs), openMs: ms(session.openMs),
        screen: typeof session.screen === "string" && /^\d{2,5}x\d{2,5}@\d{1,2}(\.\d{1,2})?$/.test(session.screen) ? session.screen : null,
      },
      scans,
    })}`);
    return ok(null);
  });
}
