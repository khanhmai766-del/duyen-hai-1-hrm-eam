import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { addMonths, canManageMaterialCatalog, DEFECT_UNITS } from "@/lib/constants";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { normalizeText } from "@/lib/nav";

export const dynamic = "force-dynamic";

type ImportRow = {
  rowNumber?: number;
  machine?: string;
  deviceSeq?: string;
  deviceName?: string;
  manualDeviceName?: string;
  materialName?: string;
  managingPosition?: string;
  intervalNote?: string;
  intervalMonths?: number;
  quantity?: number;
  deviceCount?: number;
};

type ImportError = { rowNumber: number; message: string };

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!canManageMaterialCatalog(user)) {
      return fail("Không đủ quyền nhập liên kết vật tư và thiết bị", 403);
    }

    const body = await req.json();
    const defaultMachine = String(body.machine ?? "").trim();
    const category = String(body.category ?? "").trim();
    if (!(DEFECT_UNITS as readonly string[]).includes(defaultMachine)) return fail("Tổ máy mặc định không hợp lệ");
    if (!category) return fail("Thiếu loại vật tư ERP");
    const rows: ImportRow[] = Array.isArray(body.rows) ? body.rows.slice(0, 10_000) : [];
    if (!rows.length) return fail("File chưa có dòng liên kết vật tư hợp lệ");

    const [nodes, materials, erpGroups] = await Promise.all([
      prisma.equipmentNode.findMany({ select: { seq: true, parentSeq: true, name: true } }),
      prisma.material.findMany({ select: { id: true, code: true, erpCodes: true, name: true, machine: true, system: true } }),
      prisma.oilType.findMany({
        where: { category },
        select: {
          id: true,
          name: true,
          baseUnit: true,
          onHandQty: true,
          category: true,
          materials: {
            where: { mappingStatus: "CONFIRMED" },
            select: { code: true, erpStock: true, conversionFactor: true },
          },
        },
      }),
    ]);
    const nodeBySeq = new Map(nodes.map((node) => [node.seq, node]));
    const parentSeqs = new Set(nodes.map((node) => node.parentSeq).filter(Boolean));
    const groupsByName = new Map<string, (typeof erpGroups)[number][]>();
    for (const group of erpGroups) {
      const key = normalizeText(group.name);
      groupsByName.set(key, [...(groupsByName.get(key) ?? []), group]);
    }

    const errors: ImportError[] = [];
    const normalized: Array<{
      rowNumber: number;
      materialId: string | null;
      erpGroupId: string;
      erpCodes: string[];
      unit: string;
      category: string;
      onHandQty: number;
      totalErpStock: number;
      materialStatus: "Đã có trong PXVH1" | "Sẽ tạo mới trong PXVH1";
      materialName: string;
      machine: string;
      deviceSeq: string;
      deviceName: string;
      manualDeviceName: string | null;
      system: string;
      managingPosition: string | null;
      intervalNote: string | null;
      intervalMonths: number;
      quantity: number;
      deviceCount: number;
    }> = [];
    const seen = new Set<string>();

    rows.forEach((row, index) => {
      const rowNumber = Number(row.rowNumber) || index + 2;
      const machine = String(row.machine ?? defaultMachine).trim().toUpperCase();
      const deviceSeq = String(row.deviceSeq ?? "").trim();
      const deviceName = String(row.deviceName ?? "").trim();
      const manualDeviceName = String(row.manualDeviceName ?? "").trim() || null;
      const materialName = String(row.materialName ?? "").trim();
      const node = nodeBySeq.get(deviceSeq);
      const matchedGroups = groupsByName.get(normalizeText(materialName)) ?? [];
      const group = matchedGroups[0];
      if (!(DEFECT_UNITS as readonly string[]).includes(machine)) return errors.push({ rowNumber, message: "Tổ máy phải là S1, S2 hoặc COMMON" });
      if (!deviceSeq || !deviceName || !materialName) return errors.push({ rowNumber, message: "Thiếu Số thứ tự, Tên thiết bị hoặc Tên vật tư" });
      if (!node) return errors.push({ rowNumber, message: `Không tìm thấy thiết bị có Số thứ tự ${deviceSeq}` });
      if (parentSeqs.has(deviceSeq)) return errors.push({ rowNumber, message: `Số thứ tự ${deviceSeq} là thư mục, không phải thiết bị lá` });
      if (normalizeText(deviceName) !== normalizeText(node.name)) return errors.push({ rowNumber, message: `Tên thiết bị không khớp với Số thứ tự ${deviceSeq}; tên đúng là “${node.name}”` });
      if (!group) return errors.push({ rowNumber, message: `Không tìm thấy nhóm vật tư ERP “${materialName}” thuộc loại ${category}` });
      if (matchedGroups.length > 1) return errors.push({ rowNumber, message: `Tên nhóm vật tư ERP “${materialName}” bị trùng` });
      const erpCodes = group.materials.map((item) => item.code);
      if (!erpCodes.length) return errors.push({ rowNumber, message: `Nhóm vật tư ERP “${materialName}” chưa có mã ERP đã xác nhận` });
      const codeSet = new Set(erpCodes);
      const matchedMaterials = materials.filter((item) =>
        item.machine === machine &&
        (normalizeText(item.name) === normalizeText(group.name) || item.erpCodes.some((code) => codeSet.has(code)) || codeSet.has(item.code))
      );
      const material = matchedMaterials[0] ?? null;
      if (matchedMaterials.length > 1) return errors.push({ rowNumber, message: `Nhóm “${materialName}” đang khớp với nhiều vật tư trong PXVH1 ${machine}` });
      const intervalMonths = Math.round(Number(row.intervalMonths));
      const quantity = Number(row.quantity);
      const deviceCount = Math.round(Number(row.deviceCount) || 1);
      if (!Number.isFinite(intervalMonths) || intervalMonths < 0) return errors.push({ rowNumber, message: "Chu kỳ thay thế phải từ 0 tháng (0 = không theo dõi lịch)" });
      if (!Number.isFinite(quantity) || quantity < 0) return errors.push({ rowNumber, message: "Số lượng cần thay không hợp lệ" });
      if (deviceCount < 1) return errors.push({ rowNumber, message: "Số lượng thiết bị phải từ 1" });
      // Một nút cây có thể đại diện cho nhiều thiết bị thực tế (nhập tay).
      // Chỉ coi là trùng khi cả tên thiết bị nhập tay cũng trùng; nếu không có
      // tên nhập tay thì vẫn giữ quy tắc cũ: mỗi vật tư × nút cây chỉ có 1 dòng.
      const key = `${machine}|${group.id}|${deviceSeq}|${normalizeText(manualDeviceName ?? "")}`;
      if (seen.has(key)) return errors.push({ rowNumber, message: "Vật tư, mã thiết bị và tên thiết bị nhập tay bị lặp trong file" });
      seen.add(key);
      const parent = node.parentSeq ? nodeBySeq.get(node.parentSeq) : null;
      normalized.push({
        rowNumber,
        materialId: material?.id ?? null,
        erpGroupId: group.id,
        erpCodes,
        materialName: group.name,
        unit: group.baseUnit,
        category: group.category,
        onHandQty: group.onHandQty,
        totalErpStock: group.materials.reduce((sum, item) => sum + item.erpStock * item.conversionFactor, 0),
        materialStatus: material ? "Đã có trong PXVH1" : "Sẽ tạo mới trong PXVH1",
        machine,
        deviceSeq,
        deviceName: node.name,
        manualDeviceName,
        system: parent?.name ?? material?.system ?? node.name,
        managingPosition: String(row.managingPosition ?? "").trim() || null,
        intervalNote: String(row.intervalNote ?? "").trim() || null,
        intervalMonths,
        quantity: Math.round(quantity),
        deviceCount,
      });
    });

    if (errors.length || body.dryRun === true) {
      return ok({ validCount: normalized.length, errors, preview: normalized.slice(0, 50), materialsCreated: 0, created: 0, updated: 0 });
    }

    const result = await prisma.$transaction(async (tx) => {
      let materialsCreated = 0;
      let created = 0;
      let updated = 0;
      const materialIdByGroup = new Map<string, string>();
      for (const row of normalized) {
        const materialKey = `${row.machine}|${row.erpGroupId}`;
        let materialId = row.materialId ?? materialIdByGroup.get(materialKey) ?? null;
        if (!materialId) {
          const material = await tx.material.create({
            data: {
              code: row.erpCodes[0],
              erpCodes: row.erpCodes,
              name: row.materialName,
              unit: row.unit,
              quantity: Math.max(0, Math.round(row.onHandQty)),
              minStock: Math.max(0, Math.round(row.totalErpStock)),
              system: null,
              category: row.category,
              machine: row.machine,
            },
            select: { id: true },
          });
          materialId = material.id;
          materialIdByGroup.set(materialKey, materialId);
          materialsCreated += 1;
        }
        const candidates = await tx.materialReplacement.findMany({
          where: { materialId, deviceSeq: row.deviceSeq, isActive: false },
          select: { id: true, location: true },
        });
        const existing = candidates.find(
          (candidate) => normalizeText(candidate.location ?? "") === normalizeText(row.manualDeviceName ?? "")
        );
        const data = {
          system: row.system,
          location: row.manualDeviceName,
          managingPosition: row.managingPosition,
          intervalNote: row.intervalNote,
          intervalMonths: row.intervalMonths,
          quantity: row.quantity,
          deviceCount: row.deviceCount,
          nextDueAt: addMonths(new Date(), row.intervalMonths),
        };
        if (existing) {
          await tx.materialReplacement.update({ where: { id: existing.id }, data });
          updated += 1;
        } else {
          await tx.materialReplacement.create({
            data: { ...data, materialId, deviceSeq: row.deviceSeq, isActive: false, createdById: user.id },
          });
          created += 1;
        }
      }
      return { materialsCreated, created, updated };
    }, { timeout: 120_000 });
    await audit(user.id, "IMPORT_MATERIAL_DEVICE_LINKS", "MaterialReplacement", undefined, `${result.materialsCreated} vật tư, ${result.created} liên kết mới, ${result.updated} cập nhật`);
    return ok({ validCount: normalized.length, errors: [], preview: normalized.slice(0, 50), ...result });
  });
}
