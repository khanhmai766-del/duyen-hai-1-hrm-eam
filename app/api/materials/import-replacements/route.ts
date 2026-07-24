import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { addMonths, DEFECT_UNITS } from "@/lib/constants";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { normalizeText } from "@/lib/nav";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";

export const dynamic = "force-dynamic";

// Một dòng nhập điểm thay thế từ file Excel (client đã đọc & tách cột sẵn).
type ImportRow = {
  rowNumber?: number;
  materialName?: string;
  erpCode?: string; // "Mã ERP" — có thể chứa nhiều mã ngăn bởi / , ;
  machine?: string; // Tổ máy: S1 | S2 | COMMON
  system?: string; // "Hệ thống / cây thư mục"
  deviceSeq?: string; // "Mã thiết bị (seq)" — tuỳ chọn, để liên kết đúng cây
  deviceName?: string; // "Tên thiết bị" — tuỳ chọn
  managingPosition?: string;
  deviceCount?: number;
  quantity?: number; // Số lượng cần thay CHO MỖI thiết bị
  intervalNote?: string; // Chu kỳ O&M
  intervalMonths?: number; // Chu kỳ thay thế (tháng); 0 = không theo dõi lịch
};

type ImportError = { rowNumber: number; message: string };

// Tách chuỗi "Mã ERP" thành danh sách mã (chấp nhận /, , ; hoặc khoảng trắng).
function splitCodes(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[/,;\s]+/)
        .map((code) => code.trim())
        .filter(Boolean)
    )
  );
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "replacement-manage", ["create", "manage", "full"], "Không đủ quyền nhập điểm thay thế");

    const body = await req.json();
    const rows: ImportRow[] = Array.isArray(body.rows) ? body.rows.slice(0, 10_000) : [];
    if (!rows.length) return fail("File chưa có dòng điểm thay thế hợp lệ");

    const [materials, nodes, access] = await Promise.all([
      prisma.material.findMany({ select: { id: true, code: true, erpCodes: true, name: true, machine: true, unit: true, system: true } }),
      prisma.equipmentNode.findMany({ select: { seq: true, parentSeq: true, name: true, kks: true, externalId: true } }),
      resolveEquipmentAccessForUser(user),
    ]);

    const nodeBySeq = new Map(nodes.map((node) => [node.seq, node]));
    const parentSeqs = new Set(nodes.map((node) => node.parentSeq).filter((seq): seq is string => Boolean(seq)));
    // Tra thiết bị linh hoạt: theo mã KKS hoặc externalId (ngoài mã cây seq).
    const nodeByKks = new Map<string, (typeof nodes)[number]>();
    const nodeByExternalId = new Map<string, (typeof nodes)[number]>();
    for (const node of nodes) {
      if (node.kks) nodeByKks.set(normalizeText(node.kks), node);
      if (node.externalId) nodeByExternalId.set(node.externalId.trim(), node);
    }

    // Nhận diện thiết bị từ ô "Mã thiết bị": mã cây đầy đủ (DH1.S1.1.1...), mã cây
    // rút gọn (tự thêm tiền tố DH1.<tổ máy>.), mã KKS, hoặc externalId.
    function resolveNode(raw: string, machine: string) {
      const v = raw.trim();
      if (!v) return null;
      const exact = nodeBySeq.get(v);
      if (exact) return exact;
      const relative = v.replace(/^DH1\.S[12]\./i, "");
      const prefixed = nodeBySeq.get(`DH1.${machine}.${relative}`);
      if (prefixed) return prefixed;
      return nodeByKks.get(normalizeText(v)) ?? nodeByExternalId.get(v) ?? null;
    }

    // Chỉ số tra cứu vật tư theo mã ERP và theo tên (đã fold dấu) trong từng tổ máy.
    const materialByCode = new Map<string, typeof materials>();
    const materialByName = new Map<string, typeof materials>();
    for (const material of materials) {
      const codes = new Set([material.code, ...material.erpCodes].map((code) => code?.trim()).filter(Boolean) as string[]);
      for (const code of codes) {
        const key = `${material.machine}|${code}`;
        materialByCode.set(key, [...(materialByCode.get(key) ?? []), material]);
      }
      const nameKey = `${material.machine}|${normalizeText(material.name)}`;
      materialByName.set(nameKey, [...(materialByName.get(nameKey) ?? []), material]);
    }

    const errors: ImportError[] = [];
    const normalized: Array<{
      rowNumber: number;
      materialId: string;
      materialName: string;
      unit: string;
      machine: string;
      deviceSeq: string | null;
      system: string | null;
      location: string | null;
      deviceLabel: string;
      managingPosition: string | null;
      deviceCount: number;
      quantity: number;
      intervalNote: string | null;
      intervalMonths: number;
    }> = [];
    const seen = new Set<string>();

    rows.forEach((row, index) => {
      const rowNumber = Number(row.rowNumber) || index + 2;
      const materialName = String(row.materialName ?? "").trim();
      const erpCode = String(row.erpCode ?? "").trim();
      const machine = String(row.machine ?? "").trim().toUpperCase();
      const system = String(row.system ?? "").trim();
      const deviceSeq = String(row.deviceSeq ?? "").trim();
      const deviceName = String(row.deviceName ?? "").trim();

      if (!materialName && !erpCode) return errors.push({ rowNumber, message: "Thiếu Tên vật tư / Mã ERP" });
      if (!(DEFECT_UNITS as readonly string[]).includes(machine)) return errors.push({ rowNumber, message: "Tổ máy phải là S1, S2 hoặc COMMON" });

      // 1) Khớp vật tư: ưu tiên Mã ERP, sau đó theo tên (trong đúng tổ máy).
      let matched: typeof materials = [];
      if (erpCode) {
        const codeSet = new Set<string>();
        for (const code of splitCodes(erpCode)) for (const m of materialByCode.get(`${machine}|${code}`) ?? []) codeSet.add(m.id);
        matched = materials.filter((m) => codeSet.has(m.id));
      }
      if (!matched.length && materialName) {
        matched = materialByName.get(`${machine}|${normalizeText(materialName)}`) ?? [];
      }
      if (!matched.length) return errors.push({ rowNumber, message: `Không tìm thấy vật tư “${materialName || erpCode}” trong tổ máy ${machine}` });
      if (matched.length > 1) return errors.push({ rowNumber, message: `“${materialName || erpCode}” khớp nhiều vật tư trong ${machine} — hãy điền Mã ERP để xác định` });
      const material = matched[0];

      // 2) Resolve thiết bị / hệ thống.
      let resolvedSeq: string | null = null;
      let resolvedSystem: string | null = system || null;
      let resolvedLocation: string | null = null;
      let deviceLabel = "";
      if (deviceSeq) {
        const node = resolveNode(deviceSeq, machine);
        if (!node) {
          return errors.push({
            rowNumber,
            message: `Không tìm thấy thiết bị theo mã “${deviceSeq}”. Dùng mã cây (VD DH1.${machine}.1.1.1.1) hoặc mã KKS; nếu không có, để trống cột này và chỉ điền Hệ thống / Tên thiết bị.`,
          });
        }
        if (parentSeqs.has(node.seq)) return errors.push({ rowNumber, message: `Mã “${deviceSeq}” là thư mục/hệ thống, không phải thiết bị lá` });
        if (deviceName && normalizeText(deviceName) !== normalizeText(node.name)) {
          return errors.push({ rowNumber, message: `Tên thiết bị không khớp mã “${deviceSeq}”; tên đúng là “${node.name}”` });
        }
        resolvedSeq = node.seq;
        const parent = node.parentSeq ? nodeBySeq.get(node.parentSeq) : null;
        resolvedSystem = system || parent?.name || material.system || node.name;
        deviceLabel = node.name;
      } else {
        // Không gắn cây: điểm theo hệ thống + tên thiết bị nhập tự do (tuỳ chọn).
        if (!resolvedSystem) return errors.push({ rowNumber, message: "Cần điền Hệ thống / cây thư mục hoặc Mã thiết bị (seq)" });
        resolvedLocation = deviceName || null;
        deviceLabel = deviceName || resolvedSystem;
      }

      // 3) Kiểm tra quyền theo cương vị (đồng bộ với khi thêm điểm thủ công).
      if (access.hasExplicitScopes && !access.canEditDeviceLike({ device: resolvedSeq, system: resolvedSystem })) {
        return errors.push({ rowNumber, message: "Cương vị của bạn không có quyền thao tác trên hệ thống/thiết bị này" });
      }

      // 4) Số liệu.
      const intervalMonths = Math.round(Number(row.intervalMonths));
      const quantity = Number(row.quantity);
      const deviceCount = Math.round(Number(row.deviceCount) || 1);
      if (!Number.isFinite(intervalMonths) || intervalMonths < 0) return errors.push({ rowNumber, message: "Chu kỳ thay thế phải ≥ 0 tháng (0 = không theo dõi lịch)" });
      if (!Number.isFinite(quantity) || quantity < 0) return errors.push({ rowNumber, message: "Số lượng cần thay không hợp lệ" });
      if (deviceCount < 1) return errors.push({ rowNumber, message: "Số lượng thiết bị phải ≥ 1" });

      // 5) Chống trùng trong cùng file: mỗi (vật tư × thiết bị|hệ thống+tên) chỉ 1 dòng.
      const targetKey = resolvedSeq
        ? `seq:${resolvedSeq}`
        : `sys:${normalizeText(resolvedSystem ?? "")}~${normalizeText(resolvedLocation ?? "")}`;
      const dedupeKey = `${material.id}|${targetKey}`;
      if (seen.has(dedupeKey)) return errors.push({ rowNumber, message: "Điểm thay thế (vật tư + thiết bị/hệ thống) bị lặp trong file" });
      seen.add(dedupeKey);

      normalized.push({
        rowNumber,
        materialId: material.id,
        materialName: material.name,
        unit: material.unit,
        machine,
        deviceSeq: resolvedSeq,
        system: resolvedSystem,
        location: resolvedLocation,
        deviceLabel,
        managingPosition: String(row.managingPosition ?? "").trim() || null,
        deviceCount,
        quantity: Math.round(quantity),
        intervalNote: String(row.intervalNote ?? "").trim() || null,
        intervalMonths,
      });
    });

    if (errors.length || body.dryRun === true) {
      return ok({ validCount: normalized.length, errors, preview: normalized.slice(0, 50), created: 0, updated: 0 });
    }

    const result = await prisma.$transaction(
      async (tx) => {
        let created = 0;
        let updated = 0;
        for (const row of normalized) {
          // Điểm khai báo (isActive=false) — hiển thị trong "Chi tiết điểm thay thế".
          const where = row.deviceSeq
            ? { materialId: row.materialId, deviceSeq: row.deviceSeq, isActive: false }
            : { materialId: row.materialId, deviceSeq: null, system: row.system, location: row.location, isActive: false };
          const existing = await tx.materialReplacement.findFirst({ where, select: { id: true } });
          const data = {
            machine: row.machine, // Đồng bộ tổ máy để hiện đúng ở trang thiết bị (lọc theo machine).
            system: row.system,
            location: row.location,
            managingPosition: row.managingPosition,
            deviceCount: row.deviceCount,
            quantity: row.quantity,
            intervalNote: row.intervalNote,
            intervalMonths: row.intervalMonths,
            nextDueAt: addMonths(new Date(), row.intervalMonths),
          };
          if (existing) {
            await tx.materialReplacement.update({ where: { id: existing.id }, data });
            updated += 1;
          } else {
            await tx.materialReplacement.create({
              data: { ...data, materialId: row.materialId, deviceSeq: row.deviceSeq, isActive: false, createdById: user.id },
            });
            created += 1;
          }
        }
        return { created, updated };
      },
      { timeout: 120_000 }
    );

    await audit(
      user.id,
      "IMPORT_MATERIAL_REPLACEMENTS",
      "MaterialReplacement",
      undefined,
      auditDetailWithPosition(user, `${result.created} điểm mới, ${result.updated} cập nhật`)
    );
    return ok({ validCount: normalized.length, errors: [], preview: normalized.slice(0, 50), ...result });
  });
}
