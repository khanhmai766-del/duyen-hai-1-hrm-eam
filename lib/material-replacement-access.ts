import type { EquipmentAccessContext } from "@/lib/server-access";

type ReplacementScopeTarget = {
  deviceSeq?: string | null;
  system?: string | null;
};

export function canViewMaterialReplacement(
  access: EquipmentAccessContext,
  target: ReplacementScopeTarget
) {
  if (!access.hasExplicitScopes) return true;
  if (target.deviceSeq) return access.canViewSeq(target.deviceSeq);
  if (target.system) return access.canViewDeviceLike({ system: target.system });
  return false;
}

export function canEditMaterialReplacement(
  access: EquipmentAccessContext,
  target: ReplacementScopeTarget
) {
  if (!access.hasExplicitScopes) return true;
  return access.canEditDeviceLike({
    device: target.deviceSeq,
    system: target.system,
  });
}
