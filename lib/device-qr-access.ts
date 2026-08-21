import { prisma } from "@/lib/prisma";
import { ensureDeviceQrCardTable } from "@/lib/device-qr-card-table";
import { defaultScopeOf, machinesOf, type EquipmentMachine } from "@/lib/equipment-units";

export async function resolveActiveDeviceQrCard(seq: string, requestedMachine?: EquipmentMachine | null) {
  await ensureDeviceQrCardTable();
  const allowedMachines = machinesOf(seq);
  const normalizedRequest = requestedMachine && allowedMachines.includes(requestedMachine)
    ? requestedMachine
    : null;
  const cards = await prisma.deviceQrCard.findMany({
    where: { deviceSeq: seq, ...(normalizedRequest ? { machine: normalizedRequest } : {}) },
    select: { id: true, machine: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  if (!cards.length) return null;

  const stored = cards[0].machine;
  const machine: EquipmentMachine = stored === "S1" || stored === "S2" || stored === "COMMON"
    ? stored
    : defaultScopeOf(seq);
  if (!allowedMachines.includes(machine)) return null;
  return { ...cards[0], machine };
}
