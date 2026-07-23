import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { assertSeqViewable } from "@/lib/server-access";
import { machinesOf, s2Code, s2Kks, type EquipmentMachine } from "@/lib/equipment-units";

export const dynamic = "force-dynamic";

export interface MachineProfile {
  machine: EquipmentMachine;
  code: string; // mã thiết bị đầy đủ theo tổ máy (S2 dẫn xuất DH1.S1→DH1.S2)
  kks: string | null; // KKS theo tổ máy (S2 dẫn xuất 10→20, có thể override)
  name: string;
  exists: boolean; // S1/COMMON luôn true (ngầm định); S2 = đã "Tạo hồ sơ S2" hay chưa
  attachedInfo: string | null;
  documentUrl: string | null;
  imageUrl: string | null;
}

// GET ?seq= — danh sách hồ sơ tổ máy của một nút (S1/COMMON ngầm định từ node; S2 lười).
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const seq = (req.nextUrl.searchParams.get("seq") ?? "").trim();
    if (!seq) return fail("Thiếu seq");
    await assertSeqViewable(user, seq);

    const node = await prisma.equipmentNode.findUnique({
      where: { seq },
      select: { seq: true, name: true, kks: true, attachedInfo: true, documentUrl: true, imageUrl: true },
    });
    if (!node) return fail("Không tìm thấy thiết bị", 404);

    const stored = await prisma.equipmentProfile.findMany({ where: { nodeSeq: seq } });
    const byMachine = new Map(stored.map((p) => [p.machine, p]));

    const profiles: MachineProfile[] = machinesOf(seq).map((machine) => {
      const p = byMachine.get(machine);
      const derivedCode = machine === "S2" ? s2Code(seq) : seq;
      const derivedKks = machine === "S2" ? s2Kks(node.kks) : node.kks;
      return {
        machine,
        code: derivedCode,
        kks: p?.kks ?? derivedKks,
        name: p?.name ?? node.name,
        exists: machine === "S2" ? !!p : true,
        attachedInfo: p?.attachedInfo ?? (machine === "S2" ? null : node.attachedInfo),
        documentUrl: p?.documentUrl ?? (machine === "S2" ? null : node.documentUrl),
        imageUrl: p?.imageUrl ?? (machine === "S2" ? null : node.imageUrl),
      };
    });

    return ok(profiles);
  });
}

// POST { seq } — "Tạo hồ sơ S2 từ S1": chỉ tạo dòng profile (mã/KKS dẫn xuất),
// TUYỆT ĐỐI không sao chép dữ liệu nghiệp vụ (lịch sử/QR/khiếm khuyết/vật tư).
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "device-manage", ["manage", "full"], "Không đủ quyền tạo hồ sơ S2");
    const body = await req.json();
    const seq = String(body.seq ?? "").trim();
    if (!seq) return fail("Thiếu seq");

    const node = await prisma.equipmentNode.findUnique({ where: { seq }, select: { seq: true, name: true } });
    if (!node) return fail("Không tìm thấy thiết bị", 404);
    if (!machinesOf(seq).includes("S2")) return fail("Nhánh dùng chung (COMMON) không tách hồ sơ S2");

    const existing = await prisma.equipmentProfile.findUnique({
      where: { nodeSeq_machine: { nodeSeq: seq, machine: "S2" } },
    });
    if (existing) return fail("Nút này đã có hồ sơ S2", 400);

    const profile = await prisma.equipmentProfile.create({
      data: { id: randomUUID(), nodeSeq: seq, machine: "S2", createdById: user.id },
    });
    await audit(user.id, "CREATE_S2_PROFILE", "EquipmentProfile", profile.id, `${s2Code(seq)} — ${node.name}`);
    return ok({ id: profile.id, machine: "S2", code: s2Code(seq) });
  });
}
