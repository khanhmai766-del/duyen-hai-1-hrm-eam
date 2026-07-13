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
    if (!(DEFECT_UNITS as readonly string[]).includes(defaultMachine)) return fail("Tổ máy mặc định không hợp lệ");
    const rows: ImportRow[] = Array.isArray(body.rows) ? body.rows.slice(0, 10_000) : [];
    if (!rows.length) return fail("File chưa có dòng liên kết vật tư hợp lệ");

    const [nodes, materials] = await Promise.all([
      prisma.equipmentNode.findMany({ select: { seq: true, parentSeq: true, name: true } }),
      prisma.material.findMany({ select: { id: true, name: true, machine: true, system: true } }),
    ]);
    const nodeBySeq = new Map(nodes.map((node) => [node.seq, node]));
    const parentSeqs = new Set(nodes.map((node) => node.parentSeq).filter(Boolean));
    const materialsByName = new Map<string, (typeof materials)[number][]>();
    for (const material of materials) {
      const key = `${material.machine}|${normalizeText(material.name)}`;
      materialsByName.set(key, [...(materialsByName.get(key) ?? []), material]);
    }

    const errors: ImportError[] = [];
    const normalized: Array<{
      rowNumber: number;
      materialId: string;
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
      const matchedMaterials = materialsByName.get(`${machine}|${normalizeText(materialName)}`) ?? [];
      const material = matchedMaterials[0];
      if (!(DEFECT_UNITS as readonly string[]).includes(machine)) return errors.push({ rowNumber, message: "Tổ máy phải là S1, S2 hoặc COMMON" });
      if (!deviceSeq || !deviceName || !materialName) return errors.push({ rowNumber, message: "Thiếu Số thứ tự, Tên thiết bị hoặc Tên vật tư" });
      if (!node) return errors.push({ rowNumber, message: `Không tìm thấy thiết bị có Số thứ tự ${deviceSeq}` });
      if (parentSeqs.has(deviceSeq)) return errors.push({ rowNumber, message: `Số thứ tự ${deviceSeq} là thư mục, không phải thiết bị lá` });
      if (normalizeText(deviceName) !== normalizeText(node.name)) return errors.push({ rowNumber, message: `Tên thiết bị không khớp với Số thứ tự ${deviceSeq}; tên đúng là “${node.name}”` });
      if (!material) return errors.push({ rowNumber, message: `Không tìm thấy tên vật tư “${materialName}” trong danh mục ${machine}` });
      if (matchedMaterials.length > 1) return errors.push({ rowNumber, message: `Tên vật tư “${materialName}” bị trùng trong danh mục ${machine}` });
      const intervalMonths = Math.round(Number(row.intervalMonths));
      const quantity = Number(row.quantity);
      const deviceCount = Math.round(Number(row.deviceCount) || 1);
      if (!Number.isFinite(intervalMonths) || intervalMonths < 1) return errors.push({ rowNumber, message: "Chu kỳ thay thế phải từ 1 tháng" });
      if (!Number.isFinite(quantity) || quantity < 0) return errors.push({ rowNumber, message: "Số lượng cần thay không hợp lệ" });
      if (deviceCount < 1) return errors.push({ rowNumber, message: "Số lượng thiết bị phải từ 1" });
      const key = `${material.id}|${deviceSeq}`;
      if (seen.has(key)) return errors.push({ rowNumber, message: "Vật tư và thiết bị bị lặp trong file" });
      seen.add(key);
      const parent = node.parentSeq ? nodeBySeq.get(node.parentSeq) : null;
      normalized.push({
        rowNumber,
        materialId: material.id,
        materialName: material.name,
        machine,
        deviceSeq,
        deviceName: node.name,
        manualDeviceName,
        system: parent?.name ?? material.system ?? node.name,
        managingPosition: String(row.managingPosition ?? "").trim() || null,
        intervalNote: String(row.intervalNote ?? "").trim() || null,
        intervalMonths,
        quantity: Math.round(quantity),
        deviceCount,
      });
    });

    if (errors.length || body.dryRun === true) {
      return ok({ validCount: normalized.length, errors, preview: normalized.slice(0, 50), created: 0, updated: 0 });
    }

    const existing = await prisma.materialReplacement.findMany({
      where: {
        isActive: false,
        OR: normalized.map((row) => ({ materialId: row.materialId, deviceSeq: row.deviceSeq })),
      },
      select: { id: true, materialId: true, deviceSeq: true },
    });
    const existingByKey = new Map(existing.map((row) => [`${row.materialId}|${row.deviceSeq}`, row.id]));
    let created = 0;
    let updated = 0;
    const operations = normalized.map((row) => {
      const id = existingByKey.get(`${row.materialId}|${row.deviceSeq}`);
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
      if (id) {
        updated += 1;
        return prisma.materialReplacement.update({ where: { id }, data });
      }
      created += 1;
      return prisma.materialReplacement.create({
        data: { ...data, materialId: row.materialId, deviceSeq: row.deviceSeq, isActive: false, createdById: user.id },
      });
    });
    await prisma.$transaction(operations);
    await audit(user.id, "IMPORT_MATERIAL_DEVICE_LINKS", "MaterialReplacement", undefined, `${created} tạo mới, ${updated} cập nhật`);
    return ok({ validCount: normalized.length, errors: [], preview: normalized.slice(0, 50), created, updated });
  });
}
