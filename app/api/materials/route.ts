import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { addMonths, DEFECT_UNITS, isGasCylinderCategory, roundStock } from "@/lib/constants";
import { EQUIPMENT_DEVICE_SELECT, equipmentNodeToDevice } from "@/lib/equipment-device";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { materialCatalogAccessWhere } from "@/lib/material-catalog-access";
import { adjustStockToQuantity, sharedCodesOf, syncMaterialQuantity } from "@/lib/material-stock-lot";
import { assertSeqsInScope } from "@/lib/equipment-tree-scope";
import { maybeUploadDataUrl } from "@/lib/s3";
import { hasPermissionLevel, requirePermissionLevel } from "@/lib/rbac-guard";
import { assignedPermissionLevel } from "@/lib/rbac-permissions";
import { positionCodeOf, positionsMatch } from "@/lib/position-catalog";
import { canViewMaterialReplacement } from "@/lib/material-replacement-access";
import { positionViewScopeMeta, resolvePositionViewScope } from "@/lib/position-data-scope";

export const dynamic = "force-dynamic";

const MATERIAL_INCLUDE = {
  deviceMaterials: {
    include: { device: { select: EQUIPMENT_DEVICE_SELECT } },
    orderBy: { usedAt: "desc" as const },
  },
  // Điểm dùng/thay thế: mỗi (vật tư × hệ thống/thiết bị) có chu kỳ + số lượng cần thay riêng.
  replacements: {
    // Phân biệt dòng khai báo (chưa có lịch sử) với điểm đã ghi nhận và chuyển vào lịch sử.
    // Cả hai đều có isActive=false, nhưng chỉ dòng khai báo được hiện ở bảng chi tiết.
    include: {
      // childCount phân biệt THƯ MỤC với thiết bị cấp cuối — SYC thay thế hiển thị
      // khác nhau ở hai trường hợp này (xem DefectMaterialRequestSeed.primaryIsFolder).
      device: { select: { ...EQUIPMENT_DEVICE_SELECT, childCount: true } },
      _count: { select: { logs: true } },
      // SYC thay thế đã ra cho điểm này — hiện chip tra cứu ngay trên bảng chi tiết.
      // Chỉ lấy phiếu mới nhất: bảng chỉ cần biết "đang có phiếu nào".
      defectRequests: {
        take: 3,
        orderBy: { createdAt: "desc" as const },
        select: {
          id: true,
          quantity: true,
          defect: {
            select: { id: true, requestNumber: true, requestType: true, status: true, cancelledAt: true },
          },
        },
      },
    },
    orderBy: { nextDueAt: "asc" as const },
  },
};

// Tab danh mục theo tổ máy: S1 | S2 | COMMON (giá trị khác coi như không hợp lệ).
function parseMachine(value: unknown) {
  return typeof value === "string" && (DEFECT_UNITS as readonly string[]).includes(value) ? value : null;
}

type MaterialDocumentFields = {
  documentUrl: string | null;
  documentName: string | null;
  erpCodes?: string[];
};

let materialDocumentColumnsReady = false;

async function ensureMaterialDocumentColumns() {
  if (materialDocumentColumnsReady) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Material"
    ADD COLUMN IF NOT EXISTS "documentUrl" TEXT,
    ADD COLUMN IF NOT EXISTS "documentName" TEXT
  `);
  materialDocumentColumnsReady = true;
}

async function normalizeMaterialDocument(body: { documentUrl?: unknown; documentName?: unknown }): Promise<MaterialDocumentFields> {
  // Tầng 3: dán data URL cũng được đẩy lên MinIO; DB chỉ giữ URL ngắn.
  const documentUrl = await maybeUploadDataUrl({
    value: String(body.documentUrl ?? "").trim() || null,
    folder: "materials/documents",
    preset: "document-image",
  });
  const documentName = String(body.documentName ?? "").trim() || null;
  return { documentUrl, documentName: documentUrl ? documentName : null };
}

async function materialDocumentMap(ids?: string[]) {
  try {
    await ensureMaterialDocumentColumns();
    // Chỉ quét đúng các vật tư cần trả về (khi có ids) thay vì cả bảng.
    if (ids && ids.length === 0) return new Map<string, MaterialDocumentFields>();
    const rows = ids
      ? await prisma.$queryRaw<Array<{ id: string; documentUrl: string | null; documentName: string | null; erpCodes: string[] | null }>>`
          SELECT "id", "documentUrl", "documentName", "erpCodes" FROM "Material" WHERE "id" = ANY(${ids}::text[])
        `
      : await prisma.$queryRaw<Array<{ id: string; documentUrl: string | null; documentName: string | null; erpCodes: string[] | null }>>`
          SELECT "id", "documentUrl", "documentName", "erpCodes" FROM "Material"
        `;
    return new Map(rows.map((row) => [row.id, { documentUrl: row.documentUrl, documentName: row.documentName, erpCodes: row.erpCodes ?? [] }]));
  } catch {
    return new Map<string, MaterialDocumentFields>();
  }
}

/**
 * Ghi ĐÚNG giá trị được truyền vào, kể cả null.
 *
 * Trước đây hàm này tự bỏ qua khi cả hai trường rỗng, nên thao tác "Gỡ tài liệu"
 * (nút ✕ ở form vật tư gửi lên documentUrl = null) không bao giờ chạm tới DB —
 * tải lại trang là tài liệu cũ hiện lại. Việc quyết định "có cần ghi không" thuộc
 * về nơi gọi, vì chỉ nơi đó phân biệt được "client không gửi trường tài liệu" với
 * "client cố ý gửi rỗng để gỡ".
 */
async function updateMaterialDocument(materialId: string, fields: MaterialDocumentFields) {
  await ensureMaterialDocumentColumns();
  await prisma.$executeRaw`
    UPDATE "Material"
    SET "documentUrl" = ${fields.documentUrl}, "documentName" = ${fields.documentName}
    WHERE "id" = ${materialId}
  `;
}

function mapMaterial<T extends { id?: string; quantity: number; deviceMaterials?: Array<any>; replacements?: Array<any> }>(
  material: T,
  document?: MaterialDocumentFields,
  parentNameBySeq?: Map<string, string>
) {
  const replacements = (material.replacements ?? []).map((r) => {
    const device = equipmentNodeToDevice(r.device);
    // "Hệ thống" của thiết bị = tên node cha trong cây (giống trang lý lịch thiết bị).
    if (device && r.device?.parentSeq) device.system = parentNameBySeq?.get(r.device.parentSeq) ?? null;
    // equipmentNodeToDevice không giữ childCount nên nâng lên thành cờ phẳng ở dòng điểm.
    return { ...r, deviceId: r.deviceSeq, device, deviceIsFolder: (r.device?.childCount ?? 0) > 0 };
  });
  // Tổng nhu cầu 1 chu kỳ = Σ (dung tích × số thiết bị) các DÒNG KHAI BÁO (isActive=false);
  // điểm theo dõi thời gian (isActive=true) là bản sao nên không cộng lặp.
  const totalNeed = replacements
    .filter((r) => !r.isActive)
    .reduce((sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.deviceCount) || 1), 0);
  const shortfall = Math.max(0, totalNeed - (Number(material.quantity) || 0));
  return {
    ...material,
    erpCodes: document?.erpCodes ?? (material as any).erpCodes ?? [String((material as any).code ?? "")].filter(Boolean),
    documentUrl: document?.documentUrl ?? null,
    documentName: document?.documentName ?? null,
    deviceMaterials: material.deviceMaterials?.map((dm) => ({
      ...dm,
      deviceId: dm.deviceSeq,
      device: equipmentNodeToDevice(dm.device),
    })),
    replacements,
    totalNeed,
    shortfall,
  };
}

type ReplacementInput = {
  deviceSeq?: string | null;
  system?: string | null;
  location?: string | null; // tên thiết bị nhập tay (khi không chọn từ cây)
  deviceCount?: unknown; // số lượng thiết bị tại điểm này
  managingPosition?: string | null; // cương vị quản lý điểm này
  isActive?: unknown; // true = đang theo dõi thời gian thay thế (bật từ panel chi tiết, KHÔNG bật khi thêm mới từ form)
  intervalMonths?: unknown;
  intervalNote?: string | null;
  quantity?: unknown;
  lastReplacedAt?: string | null;
  recoveryOnSupplement?: unknown;
};

/** Dựng dữ liệu tạo một điểm thay thế từ payload form (kèm tính ngày đến hạn). */
function buildReplacementCreate(entry: ReplacementInput, userId: string, defaultSystem: string | null, machine: string) {
  const parsedInterval = Math.round(Number(entry.intervalMonths));
  const intervalMonths = Number.isFinite(parsedInterval) ? Math.max(0, parsedInterval) : 12;
  const quantity = Math.max(0, Math.round(Number(entry.quantity)) || 0);
  const lastReplacedAt = entry.lastReplacedAt ? new Date(entry.lastReplacedAt) : null;
  return {
    // Đồng bộ tổ máy của điểm thay thế với tổ máy của vật tư — trang thiết bị lọc theo machine.
    machine,
    deviceSeq: entry.deviceSeq?.trim() || null,
    system: entry.system?.trim() || defaultSystem || null,
    location: entry.location?.trim() || null,
    deviceCount: Math.max(1, Math.round(Number(entry.deviceCount)) || 1),
    managingPosition: entry.managingPosition?.trim() || null,
    managingPositionCode: positionCodeOf(entry.managingPosition),
    // Thêm thiết bị theo dõi từ form KHÔNG tự kích hoạt đếm thời gian;
    // chỉ giữ trạng thái true khi dòng cũ đã được bật theo dõi trước đó.
    isActive: entry.isActive === true && intervalMonths > 0,
    quantity,
    intervalMonths,
    intervalNote: entry.intervalNote?.trim() || null,
    recoveryOnSupplement: entry.recoveryOnSupplement === true,
    lastReplacedAt,
    nextDueAt: addMonths(lastReplacedAt ?? new Date(), intervalMonths),
    createdById: userId,
  };
}

/** Lọc các điểm hợp lệ (phải có thiết bị hoặc hệ thống) từ payload. */
function parseReplacements(body: { replacements?: unknown }, userId: string, defaultSystem: string | null, machine: string) {
  if (!Array.isArray(body.replacements)) return [];
  const rows = body.replacements
    .filter((r: ReplacementInput) =>
      r && (String(r.deviceSeq ?? "").trim() || String(r.system ?? "").trim() || String(r.location ?? "").trim()))
    .map((r: ReplacementInput) => buildReplacementCreate(r, userId, defaultSystem, machine));
  // Tổ máy của vật tư quyết định CÂY thiết bị được phép gán (S1/S2 → nhánh 1,2,3,7; COMMON → 5,6).
  assertSeqsInScope(rows.map((r) => r.deviceSeq), machine);
  return rows;
}

function parseErpCodes(body: { code?: unknown; erpCodes?: unknown }) {
  const values = Array.isArray(body.erpCodes) ? body.erpCodes : [body.code];
  return Array.from(
    new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))
  );
}

async function materialWithAnyErpCode(erpCodes: string[], excludeId?: string, machine?: string) {
  if (!erpCodes.length) return null;
  // Khi có machine, chỉ kiểm tra trùng trong cùng tổ máy (dùng cho PUT).
  // Khi không có machine, kiểm tra toàn bộ (dùng cho POST kiểm tra global).
  const rows = excludeId
    ? machine
      ? await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Material"
          WHERE "id" <> ${excludeId}
            AND "machine" = ${machine}
            AND ("code" = ANY(${erpCodes}::text[]) OR "erpCodes" && ${erpCodes}::text[])
          LIMIT 1
        `
      : await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Material"
          WHERE "id" <> ${excludeId}
            AND ("code" = ANY(${erpCodes}::text[]) OR "erpCodes" && ${erpCodes}::text[])
          LIMIT 1
        `
    : await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Material"
        WHERE "code" = ANY(${erpCodes}::text[]) OR "erpCodes" && ${erpCodes}::text[]
        LIMIT 1
      `;
  return rows[0] ?? null;
}

async function updateMaterialErpCodes(materialId: string, erpCodes: string[]) {
  await prisma.$executeRaw`
    UPDATE "Material"
    SET "erpCodes" = ${erpCodes}::text[]
    WHERE "id" = ${materialId}
  `;
}

/**
 * Đồng bộ danh mục mã ERP sang các DÒNG SIBLING của cùng vật tư (khác tổ máy).
 *
 * Một vật tư dùng chung cho nhiều tổ máy tồn tại thành NHIỀU dòng `Material`, gom nhóm
 * theo `code` (xem cột "machines" ở GET). Nhưng phiếu vật tư neo vào ĐÚNG dòng của tổ máy
 * mình, còn dropdown "Mã vật tư" ở bước Đề xuất / Nghiệm thu lại đọc `erpCodes` của chính
 * dòng đó. Nếu chỉ ghi mã cho dòng đang mở, người sửa ở tab S1 sẽ thấy phiếu tổ máy S2 vẫn
 * hiện danh sách mã cũ — đúng vết "cập nhật 4 mã nhưng phiếu chỉ có 3 mã".
 *
 * Tìm sibling theo `code` CŨ vì dòng chính có thể vừa đổi mã chính; đổi xong ở đây thì
 * bước đồng bộ tổ máy phía sau (gom theo `code` mới) mới không coi sibling là dòng thiếu.
 */
async function syncSiblingErpCodes(args: {
  materialId: string;
  previousCode: string;
  primaryCode: string;
  erpCodes: string[];
  minStock?: number | null;
}) {
  const siblings = await prisma.material.findMany({
    where: { code: args.previousCode, id: { not: args.materialId } },
    select: { id: true },
  });
  if (!siblings.length) return [];
  const ids = siblings.map((sibling) => sibling.id);
  await prisma.material.updateMany({
    where: { id: { in: ids } },
    data: {
      code: args.primaryCode,
      // "Số liệu ERP" là tổng tồn của đúng cụm mã vừa chọn nên đi kèm luôn.
      ...(args.minStock != null ? { minStock: Number(args.minStock) } : {}),
    },
  });
  await prisma.$executeRaw`
    UPDATE "Material"
    SET "erpCodes" = ${args.erpCodes}::text[]
    WHERE "id" = ANY(${ids}::text[])
  `;
  return ids;
}

/**
 * Số chip SYC hiển thị trên mỗi dòng điểm thay thế, và biên lấy dư trước khi lọc.
 *
 * Điều kiện "đã ghi lịch sử" không diễn đạt được bằng SQL ở đây: `MaterialReplacementLog`
 * neo MỀM vào Defect (`defectId` là chuỗi, cố ý không có khoá ngoại — xem schema), nên
 * Prisma không nối được hai bảng trong cùng một `where`. Vì vậy lọc ở JS sau khi lấy dư.
 *
 * Lấy dư 10 là an toàn tuyệt đối trên thực tế: danh sách sắp xếp mới nhất trước, mà phiếu
 * bị loại luôn là phiếu ĐÃ XỬ LÝ XONG và đã ghi lịch sử — tức các phiếu CŨ nằm cuối danh
 * sách. Ba chip đầu gần như luôn là phiếu đang mở.
 */
const DEFECT_CHIP_LIMIT = 3;
const DEFECT_CHIP_FETCH = 10;

/** Phiếu chưa bị huỷ — phần điều kiện DUY NHẤT còn diễn đạt được trong truy vấn. */
const visibleDefectRequestWhere: Prisma.DefectMaterialRequestWhereInput = { defect: { cancelledAt: null } };

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const materialPermission = await assignedPermissionLevel(user, "material-manage");
    if (materialPermission === "none") return fail("Không đủ quyền xem Danh mục Vận Hành 1", 403);
    // ?machine=S1|S2|COMMON: lọc theo tổ máy ngay trong query (tab Danh mục vật tư).
    // ?include=usage: kèm lịch sử tiêu hao theo thiết bị (chỉ trang Reports cần).
    const machine = parseMachine(req.nextUrl.searchParams.get("machine"));
    const includeUsage = req.nextUrl.searchParams.get("include") === "usage";
    const access = await resolveEquipmentAccessForUser(user);
    // Danh mục không có cột cương vị riêng: cương vị nằm ở ĐIỂM THAY THẾ của vật tư.
    // Vật tư hiện khi có ít nhất một điểm thuộc phạm vi xem (vật tư chưa khai điểm nào
    // vẫn hiện để còn khai tiếp — giữ nguyên luật cũ).
    const viewScope = await resolvePositionViewScope(user, "material");
    const fullCatalogView = viewScope.all;
    const materialAccess = materialCatalogAccessWhere(access, fullCatalogView);

    const materialRows = await prisma.material.findMany({
      where: {
        ...(machine ? { machine } : {}),
        // Giữ vật tư chưa khai báo trong tập ứng viên để người có quyền xem toàn
        // danh mục còn có thể bổ sung điểm. Với tài khoản bị giới hạn cương vị,
        // các dòng chưa có cương vị sẽ được loại ở bước kiểm tra JS bên dưới.
        OR: [
          { replacements: { none: {} } },
          { replacements: { some: materialAccess.replacement } },
        ],
      },
      orderBy: { code: "asc" },
      include: {
        // Phải biết vật tư THỰC SỰ chưa có điểm khai báo hay chỉ không còn điểm nào
        // sau khi lọc quyền. Dùng `material.replacements.length` ở dưới là sai vì
        // relation này đã bị `where: materialAccess.replacement` thu hẹp trước đó.
        _count: { select: { replacements: true } },
        replacements: {
          ...MATERIAL_INCLUDE.replacements,
          include: {
            ...MATERIAL_INCLUDE.replacements.include,
            // Lấy dư rồi mới cắt còn 3 ở bước lọc JS bên dưới — điều kiện "đã ghi lịch sử"
            // không nối được trong SQL (xem DEFECT_CHIP_FETCH).
            defectRequests: {
              ...MATERIAL_INCLUDE.replacements.include.defectRequests,
              take: DEFECT_CHIP_FETCH,
              where: visibleDefectRequestWhere,
            },
          },
          where: materialAccess.replacement,
        },
        ...(includeUsage
          ? {
              deviceMaterials: {
                ...MATERIAL_INCLUDE.deviceMaterials,
                where: materialAccess.usage,
              },
            }
          : {}),
      },
    });
    // Dòng nhập file không có deviceSeq phải kiểm tra quyền theo tên hệ thống
    // trong JS vì SQL không thể dùng cùng phép normalizeText tiếng Việt của
    // access-context. Chỉ giữ vật tư có điểm khai báo người dùng thực sự được xem.
    // Vật tư hoàn toàn chưa có điểm chỉ hiện cho người có phạm vi xem toàn danh mục.
    const materials = materialRows.flatMap((material) => {
      const hadNoPoints = material._count.replacements === 0;
      const replacements = material.replacements.filter((replacement) =>
        fullCatalogView || canViewMaterialReplacement(access, replacement, viewScope)
      );
      // Vật tư chưa có điểm khai báo không có cương vị để đối chiếu. Chỉ người có
      // phạm vi xem toàn danh mục mới được thấy các dòng này. Nếu cho mọi cương vị
      // thấy, bản sao S2 chưa khai báo sẽ lọt vào danh mục trong khi bản S1 có điểm
      // thuộc cương vị khác lại bị ẩn — đúng nghịch lý người dùng vừa phản ánh.
      return replacements.length > 0 || (hadNoPoints && fullCatalogView)
        ? [{ ...material, replacements }]
        : [];
    });

    /**
     * Cắt chip SYC còn `DEFECT_CHIP_LIMIT`, bỏ phiếu vừa ĐÃ XỬ LÝ vừa đã ghi vào lịch sử.
     *
     * Trước đây bước này làm bằng một mảng `notIn` dựng từ việc quét TOÀN BỘ
     * `MaterialReplacementLog` ở đầu mỗi lượt tải Danh mục — bảng đó chỉ có tăng (còn mang
     * cả dữ liệu lưu trữ từ Google Sheet cũ), nên chi phí trang tăng dần theo thời gian dùng
     * và mỗi truy vấn phải nhúng kèm hàng trăm id.
     *
     * Nay chỉ tra đúng những SYC ĐANG hiện trên màn và ĐANG ở trạng thái "Đã xử lý" — dùng
     * index `MaterialReplacementLog(defectId)`, danh sách id đếm trên đầu ngón tay.
     * Quan hệ gốc vẫn giữ nguyên: số yêu cầu cũ còn đủ trong trang Lịch sử thay thế vật tư.
     */
    const processedDefectIds = Array.from(new Set(
      materials.flatMap((material) => material.replacements.flatMap((replacement) =>
        replacement.defectRequests
          .filter((request) => request.defect.status === "DA_XU_LY")
          .map((request) => request.defect.id)
      ))
    ));
    const loggedDefectIds = new Set(
      processedDefectIds.length
        ? (await prisma.materialReplacementLog.findMany({
            where: { defectId: { in: processedDefectIds } },
            distinct: ["defectId"],
            select: { defectId: true },
          })).flatMap((row) => row.defectId ? [row.defectId] : [])
        : []
    );
    for (const material of materials) {
      for (const replacement of material.replacements) {
        replacement.defectRequests = replacement.defectRequests
          .filter((request) => !(request.defect.status === "DA_XU_LY" && loggedDefectIds.has(request.defect.id)))
          .slice(0, DEFECT_CHIP_LIMIT);
      }
    }

    const documents = await materialDocumentMap(materials.map((material) => material.id));
    // Tra tên node cha 1 lần cho mọi thiết bị của các điểm thay thế → cột "Hệ thống".
    const parentSeqs = Array.from(
      new Set(
        materials.flatMap((material) =>
          (material.replacements ?? []).map((r) => r.device?.parentSeq).filter((seq): seq is string => Boolean(seq))
        )
      )
    );
    const parentNodes = parentSeqs.length
      ? await prisma.equipmentNode.findMany({ where: { seq: { in: parentSeqs } }, select: { seq: true, name: true } })
      : [];
    const parentNameBySeq = new Map(parentNodes.map((node) => [node.seq, node.name]));
    // Danh sách tổ máy mà vật tư (cùng code) đang tồn tại — form Cập nhật dùng để tick sẵn.
    const codes = Array.from(new Set(materials.map((material) => material.code)));
    const siblingRows = codes.length
      ? await prisma.material.findMany({ where: { code: { in: codes } }, select: { code: true, machine: true } })
      : [];
    const machinesByCode = new Map<string, string[]>();
    for (const row of siblingRows) {
      const list = machinesByCode.get(row.code);
      if (list) {
        if (!list.includes(row.machine)) list.push(row.machine);
      } else machinesByCode.set(row.code, [row.machine]);
    }
    const data = materials.map((material) => ({
      ...mapMaterial(material, documents.get(material.id), parentNameBySeq),
      machines: machinesByCode.get(material.code) ?? [material.machine],
    }));
    return ok(data, {
      total: data.length,
      equipmentScopeApplied: access.hasExplicitScopes && !fullCatalogView,
      positionScope: positionViewScopeMeta(viewScope),
    });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "material-manage", ["personal", "manage", "full"], "Không đủ quyền thêm vật tư");
    const body = await req.json();
    const erpCodes = parseErpCodes(body);
    const primaryCode = erpCodes[0];
    if (!primaryCode || !body.name || !body.unit) return fail("Thiếu thông tin bắt buộc");
    const exists = await materialWithAnyErpCode(erpCodes);
    if (exists) return fail("Mã vật tư ERP đã được gom trong Danh mục vật tư PXVH1");
    const defaultSystem = body.system?.trim() || null;
    // Điểm dùng/thay thế chỉ gắn vào tổ máy chính — đồng bộ machine của điểm với tổ máy đó.
    const primaryMachineForReplacements = parseMachine(body.machine) ?? "COMMON";
    const replacements = parseReplacements(body, user.id, defaultSystem, primaryMachineForReplacements);
    const imageUrl = await maybeUploadDataUrl({ value: body.imageUrl || null, folder: "materials/images", preset: "image" });
    const document = await normalizeMaterialDocument(body);
    const syncAll = body.syncAll === true;
    const requestedMachines: string[] = Array.isArray(body.machines)
      ? body.machines.filter((m: unknown) => typeof m === "string" && (DEFECT_UNITS as readonly string[]).includes(m as string))
      : [];
    const machines = requestedMachines.length
      ? requestedMachines
      : syncAll
        ? ["S1", "S2", "COMMON"]
        : [parseMachine(body.machine) ?? "COMMON"];
    const sharedData = {
      code: primaryCode,
      name: body.name,
      unit: body.unit,
      quantity: Number(body.quantity) || 0,
      minStock: Number(body.minStock) || 0,
      location: null,
      system: defaultSystem,
      category: body.category?.trim() || null,
      imageUrl,
      unitPrice: body.unitPrice != null ? Number(body.unitPrice) : null,
      note: body.note || null,
    };
    // Tổ máy chính (nhận điểm dùng/thay thế): lấy theo tab đang chọn hoặc fallback "COMMON".
    const primaryMachine = parseMachine(body.machine) ?? "COMMON";
    let firstMaterial: any = null;
    for (const machine of machines) {
      // Chỉ tổ máy chính nhận điểm dùng/thay thế (vì gắn thiết bị cụ thể của tổ máy đó).
      const isMachineWithReplacements = machine === primaryMachine;
      const m = await prisma.material.create({
        data: {
          ...sharedData,
          machine,
          ...(isMachineWithReplacements && replacements.length ? { replacements: { create: replacements } } : {}),
        },
        include: MATERIAL_INCLUDE,
      });
      await updateMaterialErpCodes(m.id, erpCodes);
      // Vật tư vừa tạo đã có sẵn hai cột NULL nên không có tài liệu thì khỏi ghi —
      // tránh một UPDATE thừa (kèm cả bước ensure cột) cho mỗi tổ máy khi tạo hàng loạt.
      if (document.documentUrl) await updateMaterialDocument(m.id, document);
      await audit(user.id, "CREATE_MATERIAL", "Material", m.id, auditDetailWithPosition(user, `${m.code} (${machine})`));
      if (!firstMaterial) firstMaterial = m;
    }
    // Vật tư mới khai kèm tồn mở đầu cũng phải có lô, y như khi sửa tay số tồn —
    // không thì lại sinh ra một mã "có hàng trên màn hình, rỗng dưới kho lô".
    // Chạy SAU vòng lặp vì các dòng sibling S1/S2/COMMON dùng CHUNG một kho theo mã.
    const tonMoDau = Math.max(0, Math.trunc(Number(body.quantity) || 0));
    if (tonMoDau > 0 && firstMaterial) {
      await prisma.$transaction(async (tx) => {
        const stockUnit = isGasCylinderCategory(sharedData.category) ? primaryMachine : "COMMON";
        await adjustStockToQuantity(tx, primaryCode, tonMoDau, stockUnit);
        await syncMaterialQuantity(tx, primaryCode, sharedCodesOf({ code: primaryCode, erpCodes }),
          isGasCylinderCategory(sharedData.category) ? { stockUnit, machine: primaryMachine } : { stockUnit });
      });
    }
    return ok(mapMaterial(firstMaterial, { ...document, erpCodes }));
  });
}

/**
 * Sửa RIÊNG ô "Hiện có"? Thân yêu cầu chỉ có đúng `id` và `quantity`. Phân biệt được hai
 * trường hợp này mới nới quyền cho cương vị giữ vật tư mà không mở luôn việc đổi tên, mã ERP,
 * loại hay tổ máy của vật tư.
 */
function isStockOnlyUpdate(body: Record<string, unknown>) {
  const keys = Object.keys(body).filter((key) => body[key] !== undefined);
  return keys.length > 0 && keys.every((key) => key === "id" || key === "quantity") && keys.includes("quantity");
}

/** Cương vị đang trực có quản lý thiết bị nào đã khai báo vật tư này không? */
async function keepsMaterialStock(materialId: string, position?: string | null) {
  if (!position?.trim()) return false;
  const points = await prisma.materialReplacement.findMany({
    where: { materialId },
    select: { managingPosition: true, managingPositionCode: true },
  });
  return points.some((point) => positionsMatch(point.managingPositionCode ?? point.managingPosition, position));
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    if (!body.id) return fail("Thiếu id");
    // Ô "Hiện có" là số đếm thực tế tại kho, người đếm chính là cương vị đang giữ vật tư — họ
    // được tự sửa ô này. Các ô còn lại của danh mục vẫn chỉ nhóm quản lý được đổi.
    if (isStockOnlyUpdate(body)) {
      await requirePermissionLevel(user, "material-manage", ["read", "personal", "manage", "full"], "Không đủ quyền cập nhật vật tư");
      const allowed =
        (await hasPermissionLevel(user, "material-manage", ["manage", "full"])) ||
        (await keepsMaterialStock(String(body.id), user.position));
      if (!allowed) {
        return fail("Cương vị của bạn không quản lý thiết bị nào đã khai báo vật tư này", 403);
      }
    } else {
      await requirePermissionLevel(user, "material-manage", ["manage", "full"], "Không đủ quyền cập nhật vật tư");
    }
    const erpCodes = body.erpCodes !== undefined || body.code !== undefined ? parseErpCodes(body) : undefined;
    const primaryCode = erpCodes?.[0];
    if (erpCodes && !primaryCode) return fail("Vui lòng chọn ít nhất một mã vật tư ERP");
    // Lấy tổ máy hiện tại của bản ghi để scope duplicate check đúng tổ máy.
    const currentMaterial = await prisma.material.findUnique({ where: { id: body.id }, select: { machine: true, code: true } });
    if (!currentMaterial) return fail("Không tìm thấy vật tư", 404);
    if (erpCodes?.length) {
      const exists = await materialWithAnyErpCode(erpCodes, body.id, currentMaterial.machine);
      if (exists) return fail("Mã vật tư ERP đã được gom trong Danh mục vật tư PXVH1");
    }
    let syncedSiblingIds: string[] = [];
    const defaultSystem = body.system !== undefined ? body.system?.trim() || null : undefined;
    const imageUrl =
      body.imageUrl !== undefined
        ? await maybeUploadDataUrl({ value: body.imageUrl || null, folder: "materials/images", preset: "image" })
        : undefined;
    const document = body.documentUrl !== undefined || body.documentName !== undefined
      ? await normalizeMaterialDocument(body)
      : undefined;
    await prisma.material.update({
      where: { id: body.id },
      data: {
        ...(primaryCode ? { code: primaryCode } : {}),
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.unit != null ? { unit: body.unit } : {}),
        ...(body.quantity != null ? { quantity: roundStock(body.quantity) } : {}),
        ...(body.minStock != null ? { minStock: Number(body.minStock) } : {}),
        ...(defaultSystem !== undefined ? { system: defaultSystem } : {}),
        ...(body.category !== undefined ? { category: body.category?.trim() || null } : {}),
        ...(body.machine !== undefined ? { machine: parseMachine(body.machine) ?? "COMMON" } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl } : {}),
        ...(body.unitPrice != null ? { unitPrice: Number(body.unitPrice) } : {}),
        ...(body.note !== undefined ? { note: body.note || null } : {}),
      },
    });
    if (erpCodes) {
      await updateMaterialErpCodes(body.id, erpCodes);
      syncedSiblingIds = await syncSiblingErpCodes({
        materialId: body.id,
        previousCode: currentMaterial.code,
        primaryCode: primaryCode!,
        erpCodes,
        minStock: body.minStock,
      });
    }
    if (document !== undefined) {
      await updateMaterialDocument(body.id, document);
    }
    // Đồng bộ DÒNG KHAI BÁO thiết bị (isActive=false) theo form: xoá rồi tạo lại.
    // Các ĐIỂM THEO DÕI thời gian (isActive=true, tạo từ nút "Thêm điểm") GIỮ NGUYÊN.
    if (Array.isArray(body.replacements)) {
      const current = await prisma.material.findUnique({ where: { id: body.id }, select: { system: true } });
      const replacements = parseReplacements(body, user.id, defaultSystem ?? current?.system ?? null, currentMaterial.machine);
      await prisma.materialReplacement.deleteMany({ where: { materialId: body.id, isActive: false } });
      for (const data of replacements) {
        await prisma.materialReplacement.create({
          data: {
            ...data,
            materialId: body.id,
          },
        });
      }
    }
    // Đồng bộ danh sách TỔ MÁY được tick (multi-select ở form Cập nhật): vật tư
    // tồn tại đúng trên các tổ máy đã chọn — tạo dòng sibling còn thiếu (copy thông
    // tin chung + mã ERP + tài liệu); dòng bỏ tick chỉ xoá khi không còn điểm
    // khai báo/theo dõi để tránh mất dữ liệu.
    const requestedMachines: string[] | undefined = Array.isArray(body.machines)
      ? Array.from(
          new Set(
            body.machines.filter(
              (m: unknown): m is string => typeof m === "string" && (DEFECT_UNITS as readonly string[]).includes(m)
            )
          )
        )
      : undefined;
    if (requestedMachines !== undefined) {
      if (!requestedMachines.length) return fail("Vui lòng chọn ít nhất một tổ máy");
      const main = await prisma.material.findUnique({ where: { id: body.id } });
      if (main) {
        const siblings = await prisma.material.findMany({ where: { code: main.code }, select: { id: true, machine: true } });
        const existingMachines = new Set(siblings.map((s) => s.machine));
        for (const machineKey of requestedMachines) {
          if (existingMachines.has(machineKey)) continue;
          const created = await prisma.material.create({
            data: {
              code: main.code,
              name: main.name,
              unit: main.unit,
              quantity: main.quantity,
              minStock: main.minStock,
              location: main.location,
              system: main.system,
              category: main.category,
              imageUrl: main.imageUrl,
              unitPrice: main.unitPrice,
              note: main.note,
              machine: machineKey,
            },
          });
          // Copy mã ERP + tài liệu (cột raw ngoài schema Prisma).
          await ensureMaterialDocumentColumns();
          await prisma.$executeRaw`
            UPDATE "Material" SET "erpCodes" = src."erpCodes", "documentUrl" = src."documentUrl", "documentName" = src."documentName"
            FROM "Material" src WHERE src."id" = ${main.id} AND "Material"."id" = ${created.id}
          `;
          await audit(user.id, "CREATE_MATERIAL", "Material", created.id, auditDetailWithPosition(user, `${main.code} (${machineKey})`));
        }
        for (const sibling of siblings) {
          if (requestedMachines.includes(sibling.machine)) continue;
          const points = await prisma.materialReplacement.count({ where: { materialId: sibling.id } });
          if (points > 0) {
            return fail(
              `Không thể bỏ Tổ máy ${sibling.machine}: còn ${points} điểm khai báo/theo dõi ở tổ máy này — xoá các điểm trước khi bỏ chọn.`
            );
          }
          await prisma.equipmentMaterial.deleteMany({ where: { materialId: sibling.id } });
          await prisma.material.delete({ where: { id: sibling.id } });
          await audit(user.id, "DELETE_MATERIAL", "Material", sibling.id, auditDetailWithPosition(user, `${main.code} (${sibling.machine})`));
        }
      }
    }
    /*
     * Sửa tay số tồn = ĐIỀU CHỈNH KHO, không phải ghi đè một con số.
     *
     * Tồn thật nằm ở MaterialStockLot; `Material.quantity` chỉ là bản sao để hiển thị.
     * Bản cũ ghi thẳng vào cột đó nên hai bên lệch nhau vĩnh viễn: màn hình phiếu báo
     * còn hàng mà bước Sử dụng vật tư chết vì kho lô rỗng (đúng vết sự cố Dầu Shell
     * Omala S2 GX320 — hiện có 418, lô 0). Giờ sinh/bớt lô cho khớp rồi mới đồng bộ
     * con số hiển thị, nên hai bảng không thể lệch nữa.
     */
    if (body.quantity != null) {
      const updated = await prisma.material.findUnique({
        where: { id: body.id },
        select: { code: true, erpCodes: true, category: true, machine: true },
      });
      if (updated) {
        const muc = Math.max(0, Math.trunc(Number(body.quantity)));
        const delta = await prisma.$transaction(async (tx) => {
          const stockUnit = isGasCylinderCategory(updated.category) ? updated.machine : "COMMON";
          const changed = await adjustStockToQuantity(tx, updated.code, muc, stockUnit);
          // Ghi lại con số hiển thị TỪ LÔ chứ không từ giá trị người dùng gõ: nếu hai
          // đường tính ra khác nhau thì lô mới là bên đúng.
          await syncMaterialQuantity(tx, updated.code, sharedCodesOf(updated),
            isGasCylinderCategory(updated.category) ? { stockUnit, machine: updated.machine } : { stockUnit });
          return changed;
        });
        if (delta !== 0) {
          await audit(
            user.id,
            "ADJUST_MATERIAL_STOCK",
            "Material",
            body.id,
            auditDetailWithPosition(user, `${updated.code}: điều chỉnh tồn ${delta > 0 ? "+" : ""}${delta} → ${muc}`)
          );
        }
      }
    }
    const m = await prisma.material.findUnique({ where: { id: body.id }, include: MATERIAL_INCLUDE });
    await audit(
      user.id,
      "UPDATE_MATERIAL",
      "Material",
      body.id,
      auditDetailWithPosition(
        user,
        syncedSiblingIds.length ? `${m?.code} (đồng bộ mã ERP cho ${syncedSiblingIds.length} tổ máy khác)` : m?.code
      )
    );
    return ok(m ? mapMaterial(m, document ?? (await materialDocumentMap()).get(body.id)) : null);
  });
}

/**
 * DELETE /api/materials — xoá vật tư (Quản trị / Quản lý).
 *  - Một vật tư:  ?id=<id>
 *  - Nhiều vật tư: body JSON { ids: string[] }
 */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "material-manage", ["manage", "full"], "Không đủ quyền xoá vật tư");

    // Gom danh sách id cần xoá từ query (đơn) hoặc body (hàng loạt).
    const single = req.nextUrl.searchParams.get("id");
    let ids: string[] = single ? [single] : [];
    if (!ids.length) {
      const body = await req.json().catch(() => ({}));
      if (Array.isArray(body?.ids)) ids = body.ids.filter((x: unknown) => typeof x === "string");
    }
    if (!ids.length) return fail("Thiếu id vật tư");

    const materials = await prisma.material.findMany({ where: { id: { in: ids } }, select: { id: true, code: true } });
    if (!materials.length) return fail("Không tìm thấy vật tư", 404);
    const foundIds = materials.map((m) => m.id);

    // Gỡ liên kết tiêu hao (lịch sử dùng cho thiết bị) trước khi xoá vật tư.
    await prisma.equipmentMaterial.deleteMany({ where: { materialId: { in: foundIds } } });
    const { count } = await prisma.material.deleteMany({ where: { id: { in: foundIds } } });
    await audit(user.id, "DELETE_MATERIAL", "Material", foundIds.join(","), auditDetailWithPosition(user, materials.map((m) => m.code).join(", ")));
    return ok({ ids: foundIds, count });
  });
}
