import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/nav";

function isShiftLeaderPosition(value: string | null | undefined) {
  return normalizeText(value ?? "") === "truong ca";
}

/** Xác thực người được chọn đang hoạt động và có một cương vị là Trưởng ca. */
export async function resolveDefectShiftLeader(userId: unknown) {
  const id = String(userId ?? "").trim();
  if (!id) return null;
  const user = await prisma.user.findFirst({
    where: { id, isActive: true },
    select: { id: true, name: true, position: true, secondaryPosition: true, currentPosition: true },
  });
  if (!user) return null;
  if (![user.position, user.secondaryPosition, user.currentPosition].some(isShiftLeaderPosition)) return null;
  return { id: user.id, name: user.name };
}
