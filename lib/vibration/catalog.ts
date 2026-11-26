import { z } from "zod";
import { DEFAULT_ALERT, MEASURE_GROUPS, MEASURE_GROUP_RANGES, VIB_LABELS } from "./constants";

/** Danh mục & cấu hình vùng đo (port từ app.js / measure-groups.js / machine-params.js của VibraControl cũ). */

// ---------- Vùng đo (measurementConfig) ----------
export type ScopeKey = (typeof MEASURE_GROUP_RANGES)[number]["key"];
export const SCOPE_KEYS = MEASURE_GROUP_RANGES.map((g) => g.key) as ScopeKey[];
export interface ScopeCfg { enabled: boolean; area: string; unit: string; loadMode: string }

const SCOPE_DEFAULTS: Record<ScopeKey, ScopeCfg> = {
  current: { enabled: true, area: "Tủ điện / cáp cấp nguồn", unit: "A", loadMode: "none" },
  motorUnloaded: { enabled: true, area: "Gối đỡ động cơ", unit: "mm/s", loadMode: "unloaded" },
  motorLoaded: { enabled: true, area: "Gối đỡ động cơ", unit: "mm/s", loadMode: "loaded" },
  pumpFanUnloaded: { enabled: true, area: "Gối đỡ bơm / quạt", unit: "mm/s", loadMode: "unloaded" },
  pumpFanLoaded: { enabled: true, area: "Gối đỡ bơm / quạt", unit: "mm/s", loadMode: "loaded" },
};
/** Ô "Vùng đo" của nhóm bơm/quạt là danh sách chọn, các nhóm khác nhập tự do (như app cũ). */
export const PUMP_FAN_AREA_OPTIONS = ["Gối đỡ bơm", "Gối đỡ quạt", "Gối đỡ bơm / quạt"];
export const isPumpFanScope = (k: string) => k === "pumpFanUnloaded" || k === "pumpFanLoaded";

export const defaultMeasurementConfig = (): Record<ScopeKey, ScopeCfg> => structuredClone(SCOPE_DEFAULTS);

/** Gộp cấu hình đã lưu với mặc định (thiếu khoá ⇒ bật, như app cũ). */
export function normalizeMeasurementConfig(raw: unknown): Record<ScopeKey, ScopeCfg> {
  const src = raw && typeof raw === "object" ? (raw as Record<string, Partial<ScopeCfg>>) : {};
  const out = {} as Record<ScopeKey, ScopeCfg>;
  for (const k of SCOPE_KEYS) {
    const c = src[k] ?? {};
    out[k] = {
      ...SCOPE_DEFAULTS[k],
      area: typeof c.area === "string" && c.area ? c.area : SCOPE_DEFAULTS[k].area,
      enabled: typeof c.enabled === "boolean" ? c.enabled : true,
    };
  }
  return out;
}

// ---------- Cảnh báo (alertConfig) ----------
export const ALERT_FIELDS = [
  { key: "vibration", label: "Rung cảnh báo (tạm)", unit: "mm/s" },
  { key: "vibrationDanger", label: "Rung nguy hiểm (tạm)", unit: "mm/s" },
  { key: "temperature", label: "Nhiệt cảnh báo", unit: "°C" },
  { key: "temperatureDanger", label: "Nhiệt nguy hiểm", unit: "°C" },
] as const;
export type AlertKey = (typeof ALERT_FIELDS)[number]["key"];
export interface AlertCfg { enabled: boolean; vibration: number; vibrationDanger: number; temperature: number; temperatureDanger: number }

export function normalizeAlertConfig(raw: unknown): AlertCfg {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const num = (k: AlertKey) => (typeof src[k] === "number" && Number.isFinite(src[k]) ? (src[k] as number) : DEFAULT_ALERT[k]);
  return { enabled: typeof src.enabled === "boolean" ? src.enabled : true, vibration: num("vibration"), vibrationDanger: num("vibrationDanger"), temperature: num("temperature"), temperatureDanger: num("temperatureDanger") };
}
/** Trả thông báo lỗi tiếng Việt hoặc null (ngưỡng nguy hiểm phải lớn hơn ngưỡng cảnh báo). */
export function alertError(a: AlertCfg): string | null {
  for (const f of ALERT_FIELDS) if (!Number.isFinite(a[f.key]) || a[f.key] < 0) return `${f.label}: nhập số không âm`;
  if (a.vibration >= a.vibrationDanger || a.temperature >= a.temperatureDanger) return "Ngưỡng nguy hiểm phải lớn hơn ngưỡng cảnh báo";
  return null;
}

// ---------- Thông số máy (machine) ----------
export const MACHINE_TYPES: [string, string][] = [["dong_co", "Động cơ (riêng)"], ["quat", "Quạt"], ["bom", "Bơm"], ["may_nghien", "Máy nghiền"], ["bang_tai", "Băng tải"], ["hop_so", "Hộp số"], ["may_nen_truc_vit", "Máy nén trục vít"], ["may_thoi_roots", "Máy thổi Roots"], ["tuabin_hoi", "Tuabin hơi"], ["may_phat", "Máy phát"], ["khac", "Khác"]];
export const PUMP_KINDS: [string, string][] = [["canh_dong", "Cánh động (ly tâm/hướng trục)"], ["bun", "Bơm bùn"], ["chim", "Bơm chìm"], ["the_tich", "Bơm thể tích"]];
export const FOUNDATION_KINDS: [string, string][] = [["chua_xac_dinh", "Chưa xác định"], ["cung", "Cứng"], ["mem", "Mềm (đàn hồi)"]];
export const FOUNDATION_Y_KINDS: [string, string][] = [["", "Như phương X"], ...FOUNDATION_KINDS];
export const COUPLING_KINDS: [string, string][] = [["", "—"], ["khop_mem", "Khớp nối mềm"], ["noi_cung", "Nối cứng"], ["lien_truc", "Liền trục (cánh trên trục động cơ)"], ["dai", "Truyền đai"], ["hop_so", "Qua hộp số"]];
export const ORIENTATION_KINDS: [string, string][] = [["ngang", "Nằm ngang"], ["dung", "Trục đứng"], ["nghieng", "Nghiêng"]];
export const VSD_KINDS: [string, string][] = [["", "Tốc độ cố định"], ["co", "Biến tần / tốc độ thay đổi"]];
export const METER_KINDS: [string, string][] = [["chua_ro", "Chưa rõ"], ["rms", "RMS"], ["peak", "Peak"]];
export const BEARING_KINDS: [string, string][] = [["", "—"], ["lan", "Ổ lăn"], ["truot", "Ổ trượt"]];
export const X_AXIS_KINDS: [string, string][] = [["chua_ro", "Chưa rõ"], ["ngang", "Ngang"], ["dung", "Đứng"]];

/** Giới hạn chỉ để chặn lỗi gõ, không phải ngưỡng kỹ thuật: [min, max, nhãn]. */
export const MACHINE_NUMBER_RULES = {
  powerKw: [0.01, 2000000, "Công suất (kW)"],
  speedRpm: [1, 30000, "Tốc độ quay (v/p)"],
  speedMaxRpm: [1, 30000, "Tốc độ lớn nhất (v/p)"],
  natFreqX: [0.1, 5000, "Tần số riêng bệ phương X (Hz)"],
  natFreqY: [0.1, 5000, "Tần số riêng bệ phương Y (Hz)"],
  freqLowHz: [0.1, 100, "Cận dưới dải tần máy đo (Hz)"],
  poles: [2, 48, "Số cực"],
  shaftHeightMm: [40, 2000, "Chiều cao tâm trục H (mm)"],
  blades: [1, 200, "Số cánh"],
} as const satisfies Record<string, readonly [number, number, string]>;
export type MachineNumberKey = keyof typeof MACHINE_NUMBER_RULES;
const INT_KEYS: string[] = ["poles", "blades", "speedRpm"];

const enumOf = (items: [string, string][]) => z.enum(items.map((i) => i[0]) as [string, ...string[]]);
const numField = (k: MachineNumberKey) => {
  const [lo, hi, label] = MACHINE_NUMBER_RULES[k];
  let s = z.number({ error: `${label} phải là số` }).min(lo, `${label} phải từ ${lo} đến ${hi}`).max(hi, `${label} phải từ ${lo} đến ${hi}`);
  if (INT_KEYS.includes(k) && k !== "speedRpm") s = s.int(`${label} phải là số nguyên`);
  return s.nullable();
};

/** Từng khoá đều tuỳ chọn; null = xoá. Khoá lạ bị bỏ (khoá có sẵn trong DB được giữ nhờ gộp nông ở API). */
export const machineSchema = z.object({
  type: enumOf(MACHINE_TYPES).or(z.literal("")),
  pumpKind: enumOf(PUMP_KINDS),
  powerKw: numField("powerKw"), speedRpm: numField("speedRpm"), speedMaxRpm: numField("speedMaxRpm"),
  natFreqX: numField("natFreqX"), natFreqY: numField("natFreqY"), freqLowHz: numField("freqLowHz"),
  poles: numField("poles"), shaftHeightMm: numField("shaftHeightMm"), blades: numField("blades"),
  vsd: enumOf(VSD_KINDS), orientation: enumOf(ORIENTATION_KINDS), coupling: enumOf(COUPLING_KINDS),
  foundation: enumOf(FOUNDATION_KINDS), foundationY: enumOf(FOUNDATION_Y_KINDS),
  bearing: enumOf(BEARING_KINDS), xAxis: enumOf(X_AXIS_KINDS), meterValue: enumOf(METER_KINDS),
  bearingCodes: z.string().max(200), lastOverhaul: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Ngày sửa chữa không hợp lệ"),
  sparePair: z.string().max(100),
}).partial();
export type MachinePatch = z.infer<typeof machineSchema>;
export type Machine = Record<string, unknown>;

// ---------- Schema ghi thiết bị ----------
const measureGroupIds = MEASURE_GROUPS.map((g) => g.id) as [string, ...string[]];
const scopePatch = z.object({ enabled: z.boolean().optional(), area: z.string().trim().min(1).max(100).optional() });
export const measurementPatchSchema = z.object(Object.fromEntries(SCOPE_KEYS.map((k) => [k, scopePatch.optional()])) as Record<ScopeKey, z.ZodOptional<typeof scopePatch>>);
export const alertPatchSchema = z.object({
  enabled: z.boolean().optional(),
  vibration: z.number().min(0).max(1000).optional(), vibrationDanger: z.number().min(0).max(1000).optional(),
  temperature: z.number().min(0).max(1000).optional(), temperatureDanger: z.number().min(0).max(1000).optional(),
});

export const devicePatchSchema = z.object({
  area: z.string().trim().min(1, "Chọn cương vị").max(200),
  system: z.string().trim().max(200),
  name: z.string().trim().min(1, "Nhập tên thiết bị").max(300),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(1_000_000),
  measureGroups: z.array(z.enum(measureGroupIds)).max(measureGroupIds.length),
  measurementConfig: measurementPatchSchema,
  alertConfig: alertPatchSchema,
  machine: machineSchema,
}).partial();
export type DevicePatch = z.infer<typeof devicePatchSchema>;

export const deviceCreateSchema = devicePatchSchema.extend({
  area: devicePatchSchema.shape.area.unwrap(),
  name: devicePatchSchema.shape.name.unwrap(),
});

export const bulkSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1) }).extend(devicePatchSchema.shape)).min(1).max(500),
});

export const emptyLabels = () => [...VIB_LABELS];

/** Kỳ đo hiệu lực: chưa khai báo ⇒ Thứ 5 hàng tuần (như app cũ). */
export { groupsOf } from "./classify";

// ---------- Hiển thị ----------
export const typeLabel = (t: unknown) => MACHINE_TYPES.find((x) => x[0] === t)?.[1] ?? "";
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
/** Tần số kích thích = quay ở tốc độ lớn nhất. */
export const excitationHz = (m: Machine) => { const n = num(m.speedMaxRpm) ?? num(m.speedRpm); return n ? n / 60 : null; };
/** Bệ suy từ tần số riêng thấp nhất đo được: cứng khi ≥ 1,25 × tần số kích thích. */
export function derivedFoundation(m: Machine, dir: "X" | "Y"): "cung" | "mem" | null {
  const fn = num(dir === "Y" ? m.natFreqY : m.natFreqX), fe = excitationHz(m);
  return fn && fe ? (fn >= 1.25 * fe ? "cung" : "mem") : null;
}
export function foundationOf(m: Machine, dir: "X" | "Y"): string {
  const f = m.foundation as string | undefined;
  const x = f && f !== "chua_xac_dinh" ? f : derivedFoundation(m, "X") ?? "chua_xac_dinh";
  return dir === "Y" ? ((m.foundationY as string) || derivedFoundation(m, "Y") || x) : x;
}
/** "Đủ" khi có loại máy, công suất, tốc độ, kiểu bệ; không tính tiêu chuẩn. */
export function machineMissing(m: Machine | null | undefined): number {
  const x = m ?? {};
  return [x.type, num(x.powerKw), num(x.speedRpm), foundationOf(x, "X") !== "chua_xac_dinh"].filter((v) => !v).length;
}
export function machineSummary(m: Machine | null | undefined): string {
  const x = m ?? {};
  const parts = [typeLabel(x.type), num(x.powerKw) ? `${x.powerKw} kW` : "", num(x.speedRpm) ? `${x.speedRpm} v/p` : ""].filter(Boolean);
  return parts.join(" · ");
}
