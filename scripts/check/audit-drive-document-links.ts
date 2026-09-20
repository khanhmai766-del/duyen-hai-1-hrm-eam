import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { parseGoogleDriveTarget } from "../../lib/google-drive-document";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const documents = await prisma.digitalDocument.findMany({
    where: { category: "PROCEDURE" },
    select: { id: true, title: true, decisionNumber: true, documentUrl: true },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
});
  const groups = { FOLDER: 0, FILE: 0, GOOGLE_DOCUMENT: 0, UNKNOWN: 0 };
  const needsReview: Array<{ id: string; decisionNumber: string | null; title: string; documentUrl: string }> = [];

  for (const document of documents) {
    const target = parseGoogleDriveTarget(document.documentUrl);
    groups[target.kind] += 1;
    if (target.kind === "UNKNOWN") needsReview.push(document);
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    category: "PROCEDURE",
    total: documents.length,
    links: groups,
    requiresDriveLookup: groups.FOLDER,
    alreadyDirect: groups.FILE + groups.GOOGLE_DOCUMENT,
    invalidOrUnsupported: groups.UNKNOWN,
    reviewSample: needsReview.slice(0, 20),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error("Không thể kiểm kê liên kết tài liệu:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
