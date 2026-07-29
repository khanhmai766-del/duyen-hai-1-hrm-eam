import { prisma } from "@/lib/prisma";
import { getCachedEquipmentNodeFull } from "@/lib/equipment-node-cache";
import {
  loadPositionSystemScopeRows,
  managingPositionsByEquipmentSeq,
} from "@/lib/server-access";
import { normalizePositionScopeKey } from "@/lib/position-system-scopes";

async function main() {
  const points = await prisma.materialReplacement.findMany({
    where: { deviceSeq: { not: null } },
    select: { id: true, deviceSeq: true, managingPosition: true },
  });
  const seqs = Array.from(
    new Set(points.map((point) => point.deviceSeq).filter((seq): seq is string => !!seq))
  );
  const [nodes, scopes] = await Promise.all([
    getCachedEquipmentNodeFull(),
    loadPositionSystemScopeRows(),
  ]);
  const positionsBySeq = managingPositionsByEquipmentSeq(seqs, nodes, scopes);

  let updated = 0;
  let unchanged = 0;
  let missingScope = 0;

  for (const point of points) {
    const positions = point.deviceSeq ? positionsBySeq.get(point.deviceSeq) ?? [] : [];
    if (!positions.length) {
      missingScope++;
      continue;
    }

    const currentKey = normalizePositionScopeKey(point.managingPosition ?? "");
    const matchedCurrent = positions.find(
      (position) => normalizePositionScopeKey(position) === currentKey
    );
    const managingPosition = matchedCurrent ?? positions[0];
    if (point.managingPosition === managingPosition) {
      unchanged++;
      continue;
    }

    await prisma.materialReplacement.update({
      where: { id: point.id },
      data: { managingPosition },
    });
    updated++;
  }

  console.log(
    JSON.stringify(
      {
        total: points.length,
        updated,
        unchanged,
        missingScope,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
