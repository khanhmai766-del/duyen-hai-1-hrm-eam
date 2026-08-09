import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { requireDeviceManage } from "@/lib/device-permissions";
import { assertSeqEditable } from "@/lib/server-access";
import { MAX_EQUIPMENT_DEPTH, machinesOf } from "@/lib/equipment-units";
import { normalizeText } from "@/lib/nav";
import { recomputeChildCount } from "@/lib/equipment-child-count";
import { invalidateEquipmentNodeCache } from "@/lib/equipment-node-cache";
import { invalidateEquipmentProfileCache } from "@/lib/equipment-profile-cache";
import { invalidateDeviceListCache } from "@/lib/device-list-cache";
import { addMonths } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Sao chép CÁC NODE CON của một thư mục mẫu vào một thư mục đích đã tồn tại.
 * Không sao chép dữ liệu vận hành. Chỉ mang theo cấu trúc, hồ sơ hiển thị và các
 * dòng vật tư khai báo (isActive=false); lịch thay thế/lịch sử/khiếm khuyết giữ nguyên.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requireDeviceManage(user, "Bạn không có quyền sao chép cấu trúc thiết bị");

    const body = await req.json();
    const sourceSeq = String(body.sourceSeq ?? "").trim();
    const targetParentSeq = String(body.targetParentSeq ?? "").trim();
    if (!sourceSeq || !targetParentSeq) return fail("Thiếu thư mục mẫu hoặc thư mục đích");
    if (sourceSeq === targetParentSeq) return fail("Thư mục mẫu và thư mục đích phải khác nhau");
    if (targetParentSeq.startsWith(`${sourceSeq}.`)) {
      return fail("Không thể sao chép cấu trúc vào chính nhánh nguồn");
    }

    await Promise.all([assertSeqEditable(user, sourceSeq), assertSeqEditable(user, targetParentSeq)]);
    const [source, target] = await Promise.all([
      prisma.equipmentNode.findUnique({ where: { seq: sourceSeq }, select: { seq: true, name: true } }),
      prisma.equipmentNode.findUnique({ where: { seq: targetParentSeq }, select: { seq: true, name: true, depth: true } }),
    ]);
    if (!source) return fail("Không tìm thấy thư mục mẫu", 404);
    if (!target) return fail("Không tìm thấy thư mục đích", 404);
    if (machinesOf(sourceSeq)[0] !== machinesOf(targetParentSeq)[0]) {
      return fail("Không thể sao chép giữa cây tổ máy và cây dùng chung");
    }

    const subtree = await prisma.equipmentNode.findMany({
      where: { seq: { startsWith: `${sourceSeq}.` } },
      orderBy: [{ depth: "asc" }, { sort: "asc" }],
    });
    if (!subtree.length) return fail("Thư mục mẫu không có thiết bị con để sao chép");

    const mapping = new Map(subtree.map((node) => [node.seq, `${targetParentSeq}${node.seq.slice(sourceSeq.length)}`]));
    const declarationMapping = new Map(mapping);
    declarationMapping.set(sourceSeq, targetParentSeq);
    const destinationSeqs = [...mapping.values()];
    const deepest = Math.max(...destinationSeqs.map((seq) => seq.split(".").length));
    if (deepest > MAX_EQUIPMENT_DEPTH) {
      return fail(`Cấu trúc sau khi sao chép sẽ vượt quá ${MAX_EQUIPMENT_DEPTH} cấp`);
    }
    const collisions = await prisma.equipmentNode.findMany({
      where: { seq: { in: destinationSeqs } },
      select: { seq: true },
      take: 5,
    });
    if (collisions.length) {
      return fail(`Thư mục đích đã có mã ${collisions.map((item) => item.seq).join(", ")}; không thể ghi đè cấu trúc hiện có`);
    }

    const [maxSort, profiles, sourceMaterialDeclarations, existingMaterialDeclarations] = await Promise.all([
      prisma.equipmentNode.aggregate({ _max: { sort: true } }),
      prisma.equipmentProfile.findMany({ where: { nodeSeq: { in: subtree.map((node) => node.seq) } } }),
      prisma.materialReplacement.findMany({
        where: { deviceSeq: { in: [sourceSeq, ...subtree.map((node) => node.seq)] }, isActive: false },
      }),
      prisma.materialReplacement.findMany({
        where: { deviceSeq: { in: [targetParentSeq, ...destinationSeqs] }, isActive: false },
        select: { deviceSeq: true, materialId: true, machine: true },
      }),
    ]);
    const existingDeclarationKeys = new Set(
      existingMaterialDeclarations.map((item) => `${item.deviceSeq}\u0000${item.materialId}\u0000${item.machine}`)
    );
    const materialDeclarations = sourceMaterialDeclarations.filter((item) => {
      const destinationSeq = declarationMapping.get(item.deviceSeq!);
      return destinationSeq && !existingDeclarationKeys.has(`${destinationSeq}\u0000${item.materialId}\u0000${item.machine}`);
    });
    // KKS là định danh duy nhất nên tuyệt đối không mang sang bản sao. Những hồ sơ
    // chỉ chứa KKS ghi đè cũng không cần tạo một dòng rỗng ở cây đích.
    const copyableProfiles = profiles.filter((profile) =>
      profile.name || profile.attachedInfo || profile.documentUrl || profile.imageUrl
    );
    const firstSort = (maxSort._max.sort ?? 0) + 1;
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.equipmentNode.createMany({
        data: subtree.map((node, index) => {
          const seq = mapping.get(node.seq)!;
          const parentSeq = node.parentSeq === sourceSeq
            ? targetParentSeq
            : mapping.get(node.parentSeq ?? "") ?? targetParentSeq;
          return {
            id: randomUUID(),
            seq,
            externalId: null,
            parentSeq,
            code: seq,
            name: node.name,
            kks: null,
            drawing: node.drawing,
            depth: seq.split(".").length,
            sort: firstSort + index,
            childCount: node.childCount,
            searchText: normalizeText(`${node.name} ${seq.replace(/^DH1\.S1\.?/, "")} ${seq}`),
            attachedInfo: node.attachedInfo,
            documentUrl: node.documentUrl,
            imageUrl: node.imageUrl,
            deviceSynced: true,
          };
        }),
      });

      if (copyableProfiles.length) {
        await tx.equipmentProfile.createMany({
          data: copyableProfiles.map((profile) => ({
            id: randomUUID(),
            nodeSeq: mapping.get(profile.nodeSeq)!,
            machine: profile.machine,
            kks: null,
            name: profile.name,
            attachedInfo: profile.attachedInfo,
            documentUrl: profile.documentUrl,
            imageUrl: profile.imageUrl,
            createdById: user.id,
          })),
        });
      }

      if (materialDeclarations.length) {
        await tx.materialReplacement.createMany({
          data: materialDeclarations.map((declaration) => ({
            id: randomUUID(),
            materialId: declaration.materialId,
            deviceSeq: declarationMapping.get(declaration.deviceSeq!)!,
            machine: declaration.machine,
            location: declaration.location,
            system: declaration.system,
            quantity: declaration.quantity,
            deviceCount: declaration.deviceCount,
            managingPosition: declaration.managingPosition,
            managingPositionCode: declaration.managingPositionCode,
            intervalMonths: declaration.intervalMonths,
            intervalNote: declaration.intervalNote,
            samplingOnly: declaration.samplingOnly,
            lastReplacedAt: null,
            nextDueAt: addMonths(now, declaration.intervalMonths),
            note: declaration.note,
            isActive: false,
            createdById: user.id,
          })),
        });
      }

      await recomputeChildCount(tx, [targetParentSeq]);
    });

    invalidateEquipmentNodeCache();
    invalidateEquipmentProfileCache();
    invalidateDeviceListCache();
    await audit(
      user.id,
      "COPY_EQUIPMENT_SUBTREE",
      "EquipmentNode",
      undefined,
      `${sourceSeq} → ${targetParentSeq} · ${subtree.length} mục · ${materialDeclarations.length} khai báo vật tư`
    );
    return ok({
      sourceSeq,
      targetParentSeq,
      firstSeq: destinationSeqs[0],
      copiedCount: subtree.length,
      materialDeclarationCount: materialDeclarations.length,
    });
  });
}
