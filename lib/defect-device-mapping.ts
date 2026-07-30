import { canonicalSeq, seqInScope, type TreeScope } from "@/lib/equipment-units";

export type DefectDeviceMapping = {
  deviceSeq: string;
  mappedUnit: TreeScope;
};

export function allowedMappedUnits(defectUnit?: string | null): TreeScope[] {
  if (defectUnit === "S1") return ["S1", "COMMON"];
  if (defectUnit === "S2") return ["S2", "COMMON"];
  return ["S1", "S2", "COMMON"];
}

export function normalizeMappedUnit(
  value: unknown,
  defectUnit?: string | null,
  deviceSeq?: string | null
): TreeScope {
  const requested = String(value ?? "").toUpperCase();
  const allowed = allowedMappedUnits(defectUnit);
  if (allowed.includes(requested as TreeScope)) return requested as TreeScope;
  if (deviceSeq && seqInScope(canonicalSeq(deviceSeq), "COMMON")) return "COMMON";
  return defectUnit === "S2" ? "S2" : defectUnit === "COMMON" ? "COMMON" : "S1";
}

export function validateMappedDevice(
  deviceSeq: string,
  mappedUnit: TreeScope,
  defectUnit?: string | null
): string | null {
  if (!allowedMappedUnits(defectUnit).includes(mappedUnit)) {
    return `Phiếu ${defectUnit || "COMMON"} không được ánh xạ vào hồ sơ thiết bị ${mappedUnit}`;
  }
  const canonical = canonicalSeq(deviceSeq);
  if (!seqInScope(canonical, mappedUnit)) {
    return mappedUnit === "COMMON"
      ? "Thiết bị đã chọn không thuộc nhánh COMMON"
      : `Thiết bị đã chọn không thuộc cây ${mappedUnit}`;
  }
  return null;
}
