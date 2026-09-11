import "server-only";
import { prisma } from "@/lib/prisma";

export async function websiteIdentity(subject: string) {
  if (!subject.startsWith("vh1:") || subject.length <= 4) throw new SyntaxError("INVALID_WEBSITE_ACCOUNT");
  const user = await prisma.user.findUnique({ where: { id: subject.slice(4) }, select: { id: true, email: true, name: true, isActive: true, accessMode: true } });
  if (!user || !user.isActive || user.accessMode === "DEFECT_READ_ONLY") throw new SyntaxError("INVALID_WEBSITE_ACCOUNT");
  return { username: user.email, displayName: user.name };
}

export async function websitePersonnelOptions() {
  return prisma.user.findMany({ where: { isActive: true, accessMode: { not: "DEFECT_READ_ONLY" } }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } });
}
