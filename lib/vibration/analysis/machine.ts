/* eslint-disable @typescript-eslint/no-explicit-any */
// Thông số máy phục vụ phân tích rung — phần phân tích cần, port từ vibracontrol/machine-params.js.
export type Machine = Record<string, any>;

// machine-params.js:machineTypes / pumpKinds / foundationKinds / foundationYKinds / xAxisKinds / meterKinds
export const machineTypes: [string, string][] = [
  ["dong_co", "Động cơ (riêng)"], ["quat", "Quạt"], ["bom", "Bơm"], ["may_nghien", "Máy nghiền"], ["bang_tai", "Băng tải"], ["hop_so", "Hộp số"],
  ["may_nen_truc_vit", "Máy nén trục vít"], ["may_thoi_roots", "Máy thổi Roots"], ["tuabin_hoi", "Tuabin hơi"], ["may_phat", "Máy phát"], ["khac", "Khác"],
];
export const pumpKinds: [string, string][] = [["canh_dong", "Cánh động (ly tâm/hướng trục)"], ["bun", "Bơm bùn"], ["chim", "Bơm chìm"], ["the_tich", "Bơm thể tích"]];
export const foundationKinds: [string, string][] = [["chua_xac_dinh", "Chưa xác định"], ["cung", "Cứng"], ["mem", "Mềm (đàn hồi)"]];
export const foundationYKinds: [string, string][] = [["", "Như phương X"], ...foundationKinds];
export const xAxisKinds: [string, string][] = [["chua_ro", "Chưa rõ"], ["ngang", "Ngang"], ["dung", "Đứng"]];
export const meterKinds: [string, string][] = [["chua_ro", "Chưa rõ"], ["rms", "RMS"], ["peak", "Peak"]];

// machine-params.js:excitationHz — tần số kích thích chính = tần số quay ở tốc độ lớn nhất (R1 §5.3).
export const excitationHz = (m: Machine): number | null => {
  const n = m.speedMaxRpm || m.speedRpm;
  return n ? n / 60 : null;
};
// machine-params.js:derivedFoundation — bệ suy từ tần số riêng thấp nhất: cứng khi ≥ 1,25 × tần số kích thích.
export function derivedFoundation(m: Machine, dir: "X" | "Y"): "cung" | "mem" | null {
  const fn = dir === "Y" ? m.natFreqY : m.natFreqX;
  const fe = excitationHz(m);
  if (!fn || !fe) return null;
  return fn >= 1.25 * fe ? "cung" : "mem";
}
// machine-params.js:foundationOf — chọn tay > suy từ tần số riêng > (phương Y) như phương X.
export const foundationOf = (m: Machine, dir: "X" | "Y"): string => {
  const x = m.foundation && m.foundation !== "chua_xac_dinh" ? m.foundation : derivedFoundation(m, "X") || "chua_xac_dinh";
  if (dir !== "Y") return x;
  return m.foundationY || derivedFoundation(m, "Y") || x;
};
// machine-params.js:isFlexiblySupported
export const isFlexiblySupported = (m: Machine) => foundationOf(m, "X") === "mem" && foundationOf(m, "Y") === "mem";

/** PHP/JSON cũ có thể trả `[]` cho đối tượng rỗng (machine-params.js:machineOf, AGENTS Q12). */
export const machineOf = (v: unknown): Machine => (v && typeof v === "object" && !Array.isArray(v) ? (v as Machine) : {});
