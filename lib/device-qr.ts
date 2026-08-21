import { canonicalSeq, defaultScopeOf, scopeCode, type EquipmentMachine, validateEquipmentSeq } from "@/lib/equipment-units";

const QR_PREFIX = "POWERPLANT-EAM:DEVICE:1";
const VALID_MACHINES = new Set<EquipmentMachine>(["S1", "S2", "COMMON"]);

export type DeviceQrTarget = {
  seq: string;
  machine: EquipmentMachine | null;
  legacy: boolean;
};

/** URL thẻ có kiểm tra hiệu lực; middleware yêu cầu đăng nhập trước khi mở hồ sơ. */
export function deviceQrValue(seq: string, machine?: string | null, origin?: string | null) {
  const canonical = canonicalSeq(seq.trim());
  const normalizedMachine = normalizeQrMachine(machine) ?? defaultScopeOf(canonical);
  const displayedCode = scopeCode(canonical, normalizedMachine);
  const path = `/public/equipment/${encodeURIComponent(displayedCode)}?machine=${encodeURIComponent(normalizedMachine)}`;
  return origin ? `${origin.replace(/\/$/, "")}${path}` : path;
}

export function normalizeQrMachine(value: unknown): EquipmentMachine | null {
  const normalized = String(value ?? "").trim().toUpperCase() as EquipmentMachine;
  return VALID_MACHINES.has(normalized) ? normalized : null;
}

/** Nhận payload mới và URL QR cũ để chuyển đổi dần mà không buộc in lại ngay. */
export function parseDeviceQrValue(rawValue: unknown): DeviceQrTarget | null {
  const raw = String(rawValue ?? "").trim();
  if (!raw || raw.length > 2048) return null;

  if (raw.startsWith(`${QR_PREFIX}:`)) {
    const rest = raw.slice(QR_PREFIX.length + 1);
    const separator = rest.indexOf(":");
    if (separator < 1) return null;
    const machine = normalizeQrMachine(rest.slice(0, separator));
    const seq = decodeSafely(rest.slice(separator + 1));
    if (!machine || !seq) return null;
    return validTarget(seq, machine, false);
  }

  try {
    const url = new URL(raw, "https://qr.invalid");
    const match = url.pathname.match(/^\/(?:public\/(?:equipment|devices)|devices)\/([^/]+)\/?$/);
    if (!match) return null;
    const displayedSeq = decodeSafely(match[1]);
    if (!displayedSeq) return null;
    const inferredMachine = normalizeQrMachine(url.searchParams.get("machine"))
      ?? (/^DH1\.S2(?:\.|$)/i.test(displayedSeq) ? "S2" : null);
    return validTarget(displayedSeq, inferredMachine, true);
  } catch {
    return null;
  }
}

function validTarget(seq: string, machine: EquipmentMachine | null, legacy: boolean): DeviceQrTarget | null {
  const canonical = canonicalSeq(seq.trim());
  const legacySeq = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(canonical);
  if (validateEquipmentSeq(canonical) && !legacySeq) return null;
  return { seq: canonical, machine, legacy };
}

function decodeSafely(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function deviceDetailUrl(seq: string, machine: EquipmentMachine) {
  return `/devices/${encodeURIComponent(canonicalSeq(seq))}?machine=${encodeURIComponent(machine)}`;
}

/** Đích sau khi quét: tài khoản tra cứu khiếm khuyết vẫn quét được nhưng không vượt phạm vi dữ liệu. */
export function authenticatedDeviceQrUrl(seq: string, machine: EquipmentMachine, accessMode?: string | null) {
  const canonical = canonicalSeq(seq);
  if (accessMode === "DEFECT_READ_ONLY") {
    const encodedSeq = encodeURIComponent(canonical);
    const encodedMachine = encodeURIComponent(machine);
    return `/defects?deviceSeq=${encodedSeq}&unit=${encodedMachine}&mappedUnit=${encodedMachine}&includeDescendants=2`;
  }
  return deviceDetailUrl(canonical, machine);
}
