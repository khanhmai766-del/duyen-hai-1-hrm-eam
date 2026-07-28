import { prisma } from "@/lib/prisma";

const SETTING_ID = "singleton";

export async function getDefectTwoWaySyncSetting() {
  return prisma.defectSyncSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID },
    update: {},
  });
}

export async function setDefectTwoWaySyncEnabled(params: {
  enabled: boolean;
  updatedBy: { id: string; name: string };
}) {
  return prisma.defectSyncSetting.upsert({
    where: { id: SETTING_ID },
    create: {
      id: SETTING_ID,
      twoWaySyncEnabled: params.enabled,
      updatedById: params.updatedBy.id,
      updatedByName: params.updatedBy.name,
    },
    update: {
      twoWaySyncEnabled: params.enabled,
      updatedById: params.updatedBy.id,
      updatedByName: params.updatedBy.name,
    },
  });
}
