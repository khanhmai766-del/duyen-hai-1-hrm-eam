import { prisma } from "@/lib/prisma";
import { isDefectShiftLeaderCandidatePosition } from "@/lib/defect-shift-leader-position";

/** Xác thực người được chọn đang hoạt động và có một cương vị là Trưởng ca. */
export async function resolveDefectShiftLeader(userId: unknown) {
  const id = String(userId ?? "").trim();
  if (!id) return null;
  const user = await prisma.user.findFirst({
    where: { id, isActive: true },
    select: { id: true, name: true, position: true, secondaryPosition: true, secondaryPosition2: true, currentPosition: true },
  });
  if (!user) return null;
  if (![user.position, user.secondaryPosition, user.secondaryPosition2, user.currentPosition].some(isDefectShiftLeaderCandidatePosition)) return null;
  return { id: user.id, name: user.name };
}
