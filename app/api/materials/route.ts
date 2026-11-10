import { invalidateEquipmentDashboardCache } from "@/lib/equipment-dashboard-service";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { addMonths, DEFECT_UNITS, isGasCylinderCategory, materialTrackingGroup, roundStock } from "@/lib/constants";
import { EQUIPMENT_DEVICE_SELECT, equipmentNodeToDevice } from "@/lib/equipment-device";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { materialCatalogAccessWhere } from "@/lib/material-catalog-access";
import { adjustStockToQuantity, lockMaterialStock, sharedCodesOf, syncMaterialQuantity } from "@/lib/material-stock-lot";
import { materialHasHistory, syncMaterialDeclarations } from "@/lib/server/material-catalog-write";
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

async function normalizeMaterialDocument(body: { documentUrl?: unknown; documentName?: unknown }): Promise<MaterialDocumentFields> {
  const documentUrl = await maybeUploadDataUrl({ value: String(body.documentUrl ?? "").trim() || null,
    folder: "materials/documents", preset: "document-image" });
  return { documentUrl, documentName: documentUrl ? String(body.documentName ?? "").trim() || null : null };
}

async function materialDocumentMap(ids?: string[]) {
  const rows = await prisma.material.findMany({ where: ids ? { id: { in: ids } } : undefined,
    select: { id: true, documentUrl: true, documentName: true, erpCodes: true } });
  return new Map(rows.map(row => [row.id, row]));
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
  id?: string;
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
  separateTracking?: unknown; // đứng ngoài quy tắc một đồng hồ mỗi thiết bị
};

/** Dựng dữ liệu tạo một điểm thay thế từ payload form (kèm tính ngày đến hạn). */
function buildReplacementCreate(entry: ReplacementInput, userId: string, defaultSystem: string | null, machine: string) {
  const parsedInterval = Math.round(Number(entry.intervalMonths));
  const intervalMonths = Number.isFinite(parsedInterval) ? Math.max(0, parsedInterval) : 12;
  const quantity = Math.max(0, Math.round(Number(entry.quantity)) || 0);
  const lastReplacedAt = entry.lastReplacedAt ? new Date(entry.lastReplacedAt) : null;
  return {
    id: entry.id,
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
    separateTracking: entry.separateTracking === true,
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

async function materialWithAnyErpCode(db: Prisma.TransactionClient, erpCodes: string[], excludeId?: string, machine?: string) {
  return db.material.findFirst({ where: { ...(excludeId ? { id: { not: excludeId } } : {}), ...(machine ? { machine } : {}),
    OR: [{ code: { in: erpCodes } }, { erpCodes: { hasSome: erpCodes } }] }, select: { id: true } });
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
    /**
     * QUY TẮC MỘT ĐỒNG HỒ: mỗi (thiết bị + tổ máy + nhóm vật tư thay thế lẫn nhau) chỉ nên có
     * MỘT điểm đếm ngày. Tính ở đây thay vì ở client vì client chỉ thấy phần danh mục đã tải
     * (lọc theo tab tổ máy, theo cương vị, theo ô tìm kiếm) — điểm nằm ngoài tầm đó vẫn phải
     * được tính, nếu không người dùng lại mở đồng hồ thứ hai cho cùng một lần thay.
     *
     * Tổ máy nằm trong khoá vì cây S2 chỉ là HÌNH CHIẾU của cây S1: cùng một `seq` đại diện
     * thiết bị của cả hai tổ máy, thiếu `machine` thì điểm của tổ máy kia bị báo nhầm là trùng.
     */
    const pointDeviceSeqs = Array.from(new Set(
      materials.flatMap((material) => material.replacements.map((r) => r.deviceSeq).filter((seq): seq is string => Boolean(seq)))
    ));
    const siblingPoints = pointDeviceSeqs.length
      ? await prisma.materialReplacement.findMany({
          where: { deviceSeq: { in: pointDeviceSeqs }, separateTracking: false },
          select: { id: true, deviceSeq: true, machine: true, isActive: true, intervalMonths: true, materialId: true, material: { select: { name: true, category: true } } },
        })
      : [];
    const trackingInfoByPoint = new Map<string, { trackedElsewhere: { pointId: string; materialId: string; materialName: string } | null; sharedDeviceMaterials: string[] }>();
    for (const material of materials) {
      const group = materialTrackingGroup(material.category);
      for (const replacement of material.replacements) {
        if (!group || !replacement.deviceSeq || replacement.separateTracking) continue;
        const siblings = siblingPoints.filter((row) =>
          row.deviceSeq === replacement.deviceSeq
          && row.machine === replacement.machine
          && row.materialId !== material.id
          && materialTrackingGroup(row.material.category) === group
        );
        const running = siblings.find((row) => row.isActive);
        trackingInfoByPoint.set(replacement.id, {
          trackedElsewhere: running ? { pointId: running.id, materialId: running.materialId, materialName: running.material.name } : null,
          // Vật tư anh em MỚI CHỈ KHAI BÁO (chưa có đồng hồ): để giao diện nhắc trước rằng
          // tạo điểm ở đây sẽ khoá các vật tư kia — đỡ phải sửa sau khi đã tạo nhầm.
          sharedDeviceMaterials: Array.from(new Set(siblings.filter((row) => !row.isActive).map((row) => row.material.name))),
        });
      }
    }
    const data = materials.map((material) => {
      const mapped = mapMaterial(material, documents.get(material.id), parentNameBySeq);
      return {
        ...mapped,
        replacements: mapped.replacements.map((replacement) => ({
          ...replacement,
          trackedElsewhere: trackingInfoByPoint.get(replacement.id)?.trackedElsewhere ?? null,
          sharedDeviceMaterials: trackingInfoByPoint.get(replacement.id)?.sharedDeviceMaterials ?? [],
        })),
        machines: machinesByCode.get(material.code) ?? [material.machine],
      };
    });
    return ok(data, {
      total: data.length,
      equipmentScopeApplied: access.hasExplicitScopes && !fullCatalogView,
      positionScope: positionViewScopeMeta(viewScope),
    });
  });
}

function stockValue(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 2_147_483_647) throw fail(`${label} phải là số không âm hợp lệ`);
  return roundStock(number);
}

function selectedMachines(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.length || value.some(machine => !parseMachine(machine))) throw fail("Vui lòng chọn ít nhất một tổ máy hợp lệ");
  return [...new Set(value as string[])];
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "material-manage", ["personal", "manage", "full"], "Không đủ quyền thêm vật tư");
    const body = await req.json();
    const erpCodes = parseErpCodes(body), code = erpCodes[0];
    if (!code || !String(body.name ?? "").trim() || !String(body.unit ?? "").trim()) return fail("Thiếu thông tin bắt buộc");
    const machines = selectedMachines(body.machines) ?? (body.syncAll === true ? ["S1", "S2", "COMMON"] : [parseMachine(body.machine) ?? "COMMON"]);
    const primaryMachine = parseMachine(body.machine) ?? machines[0];
    if (!machines.includes(primaryMachine)) return fail("Tổ máy chính phải thuộc danh sách đã chọn");
    const quantity = stockValue(body.quantity ?? 0, "Hiện có"), minStock = stockValue(body.minStock ?? 0, "Tồn ERP");
    const system = String(body.system ?? "").trim() || null;
    const replacements = parseReplacements(body, user.id, system, primaryMachine).map(({ id: _id, ...row }) => ({ ...row, isActive: false }));
    const imageUrl = await maybeUploadDataUrl({ value: body.imageUrl || null, folder: "materials/images", preset: "image" });
    const document = await normalizeMaterialDocument(body);
    const materials = await prisma.$transaction(async tx => {
      await lockMaterialStock(tx);
      if (await materialWithAnyErpCode(tx, erpCodes)) throw fail("Mã vật tư ERP đã được gom trong Danh mục vật tư PXVH1");
      const created = [];
      for (const machine of machines) {
        created.push(await tx.material.create({ data: {
          code, erpCodes, machine, name: String(body.name).trim(), unit: String(body.unit).trim(), quantity, minStock,
          system, category: body.category?.trim() || null, imageUrl, ...document,
          unitPrice: body.unitPrice != null ? Number(body.unitPrice) : null, note: body.note || null,
          ...(machine === primaryMachine && replacements.length ? { replacements: { create: replacements } } : {}),
        }, include: MATERIAL_INCLUDE }));
      }
      if (quantity > 0) {
        for (const stockUnit of isGasCylinderCategory(body.category) ? machines : ["COMMON"]) {
          await adjustStockToQuantity(tx, code, quantity, stockUnit);
          await syncMaterialQuantity(tx, code, erpCodes, isGasCylinderCategory(body.category) ? { stockUnit, machine: stockUnit } : { stockUnit });
        }
      }
      return created;
    }, { timeout: 60_000 });
    for (const material of materials) await audit(user.id, "CREATE_MATERIAL", "Material", material.id, auditDetailWithPosition(user, `${material.code} (${material.machine})`));
    invalidateEquipmentDashboardCache();
    return ok(mapMaterial(materials[0], { ...document, erpCodes }));
  });
}

function isStockOnlyUpdate(body: Record<string, unknown>) {
  const keys = Object.keys(body).filter(key => body[key] !== undefined);
  return keys.includes("quantity") && keys.every(key => key === "id" || key === "quantity");
}

async function keepsMaterialStock(materialId: string, position?: string | null) {
  if (!position?.trim()) return false;
  const points = await prisma.materialReplacement.findMany({ where: { materialId }, select: { managingPosition: true, managingPositionCode: true } });
  return points.some(point => positionsMatch(point.managingPositionCode ?? point.managingPosition, position));
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json();
    if (!body.id) return fail("Thiếu id");
    if (isStockOnlyUpdate(body)) {
      await requirePermissionLevel(user, "material-manage", ["read", "personal", "manage", "full"], "Không đủ quyền cập nhật vật tư");
      if (!(await hasPermissionLevel(user, "material-manage", ["manage", "full"])) && !(await keepsMaterialStock(String(body.id), user.position))) {
        return fail("Cương vị của bạn không quản lý thiết bị nào đã khai báo vật tư này", 403);
      }
    } else await requirePermissionLevel(user, "material-manage", ["manage", "full"], "Không đủ quyền cập nhật vật tư");
    const machines = selectedMachines(body.machines);
    const erpCodes = body.erpCodes !== undefined || body.code !== undefined ? parseErpCodes(body) : undefined;
    if (erpCodes && !erpCodes.length) return fail("Vui lòng chọn ít nhất một mã vật tư ERP");
    const quantity = body.quantity != null ? stockValue(body.quantity, "Hiện có") : undefined;
    const minStock = body.minStock != null ? stockValue(body.minStock, "Tồn ERP") : undefined;
    if (body.deletedReplacementIds !== undefined && (!Array.isArray(body.deletedReplacementIds) || body.deletedReplacementIds.some((id: unknown) => typeof id !== "string"))) return fail("Danh sách điểm cần xoá không hợp lệ");
    const imageUrl = body.imageUrl !== undefined ? await maybeUploadDataUrl({ value: body.imageUrl || null, folder: "materials/images", preset: "image" }) : undefined;
    const document = body.documentUrl !== undefined || body.documentName !== undefined ? await normalizeMaterialDocument(body) : undefined;
    const [access, view] = await Promise.all([resolveEquipmentAccessForUser(user), resolvePositionViewScope(user, "material")]);
    const result = await prisma.$transaction(async tx => {
      await lockMaterialStock(tx);
      const current = await tx.material.findUnique({ where: { id: body.id } });
      if (!current) throw fail("Không tìm thấy vật tư", 404);
      const siblings = await tx.material.findMany({ where: { code: current.code } });
      const ids = siblings.map(row => row.id), code = erpCodes?.[0] ?? current.code;
      if (code !== current.code && (siblings.some(row => row.quantity > 0) || await materialHasHistory(tx, ids, current.code))) {
        throw fail("Vật tư đã có tồn kho hoặc chứng từ; không thể đổi mã chính. Có thể bổ sung mã ERP mà vẫn giữ mã chính hiện tại.", 409);
      }
      if (erpCodes && await materialWithAnyErpCode(tx, erpCodes, current.id, current.machine)) throw fail("Mã vật tư ERP đã được gom trong Danh mục vật tư PXVH1");
      const machine = body.machine !== undefined ? parseMachine(body.machine) : current.machine;
      if (!machine) throw fail("Tổ máy không hợp lệ");
      if ((machine !== current.machine || (body.category !== undefined && isGasCylinderCategory(body.category) !== isGasCylinderCategory(current.category)))
        && (await tx.materialReplacement.count({ where: { materialId: current.id } }) > 0 || await materialHasHistory(tx, [current.id], current.code))) {
        throw fail("Không thể đổi tổ máy hoặc loại kho của vật tư đã có khai báo hay chứng từ", 409);
      }
      const system = body.system !== undefined ? String(body.system ?? "").trim() || null : current.system;
      if (Array.isArray(body.replacements) || body.deletedReplacementIds?.length) {
        const rows = parseReplacements(body, user.id, system, machine);
        await syncMaterialDeclarations(tx, current.id, rows, body.deletedReplacementIds ?? [], access, view);
      }
      const events: Array<{ action: string; id: string; detail: string }> = [];
      await tx.material.update({ where: { id: current.id }, data: {
        code, erpCodes, machine, system, minStock,
        name: body.name != null ? body.name : undefined, unit: body.unit != null ? body.unit : undefined,
        category: body.category !== undefined ? body.category?.trim() || null : undefined, imageUrl, ...document,
        unitPrice: body.unitPrice != null ? Number(body.unitPrice) : undefined,
        note: body.note !== undefined ? body.note || null : undefined,
      } });
      if (erpCodes) await tx.material.updateMany({ where: { id: { in: ids.filter(id => id !== current.id) } }, data: { code, erpCodes, minStock } });
      const main = await tx.material.findUniqueOrThrow({ where: { id: current.id } });
      if (machines) {
        const existingMachines = new Set(siblings.map(row => row.id === current.id ? machine : row.machine));
        for (const target of machines) {
          if (existingMachines.has(target)) continue;
          const created = await tx.material.create({ data: {
            code, erpCodes: main.erpCodes, machine: target, name: main.name, unit: main.unit, quantity: isGasCylinderCategory(main.category) ? 0 : main.quantity,
            minStock: main.minStock, location: main.location, system: main.system, category: main.category,
            imageUrl: main.imageUrl, documentUrl: main.documentUrl, documentName: main.documentName, unitPrice: main.unitPrice, note: main.note,
          } });
          events.push({ action: "CREATE_MATERIAL", id: created.id, detail: `${code} (${target})` });
        }
        for (const sibling of siblings) {
          if (machines.includes(sibling.id === current.id ? machine : sibling.machine)) continue;
          if (await tx.materialReplacement.count({ where: { materialId: sibling.id } }) || await materialHasHistory(tx, [sibling.id], code)) {
            throw fail(`Không thể bỏ Tổ máy ${sibling.machine}: vật tư còn khai báo, lô kho hoặc chứng từ`, 409);
          }
          await tx.equipmentMaterial.deleteMany({ where: { materialId: sibling.id } });
          await tx.material.delete({ where: { id: sibling.id } });
          events.push({ action: "DELETE_MATERIAL", id: sibling.id, detail: `${code} (${sibling.machine})` });
        }
      }
      if (quantity !== undefined) {
        const stockUnit = isGasCylinderCategory(main.category) ? machine : "COMMON";
        const delta = await adjustStockToQuantity(tx, code, quantity, stockUnit);
        await syncMaterialQuantity(tx, code, sharedCodesOf(main), isGasCylinderCategory(main.category) ? { stockUnit, machine } : { stockUnit });
        if (delta) events.push({ action: "ADJUST_MATERIAL_STOCK", id: current.id, detail: `${code}: điều chỉnh tồn ${delta > 0 ? "+" : ""}${delta} → ${quantity}` });
      }
      const material = await tx.material.findFirst({ where: { code, machine: machines && !machines.includes(machine) ? machines[0] : machine }, include: MATERIAL_INCLUDE });
      return { material, events };
    }, { timeout: 60_000 });
    for (const event of result.events) await audit(user.id, event.action, "Material", event.id, auditDetailWithPosition(user, event.detail));
    await audit(user.id, "UPDATE_MATERIAL", "Material", body.id, auditDetailWithPosition(user, result.material?.code));
    invalidateEquipmentDashboardCache();
    return ok(result.material ? mapMaterial(result.material, result.material) : null);
  });
}
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "material-manage", ["manage", "full"], "Không đủ quyền xoá vật tư");
    const single = req.nextUrl.searchParams.get("id");
    const body = single ? null : await req.json().catch(() => ({}));
    const ids: string[] = single ? [single] : Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === "string") : [];
    if (!ids.length) return fail("Thiếu id vật tư");
    const materials = await prisma.$transaction(async tx => {
      await lockMaterialStock(tx);
      const rows = await tx.material.findMany({ where: { id: { in: ids } } });
      if (!rows.length) throw fail("Không tìm thấy vật tư", 404);
      for (const row of rows) {
        if (row.quantity > 0 || await materialHasHistory(tx, [row.id], row.code)) throw fail(`Không thể xoá ${row.code}: vật tư còn tồn kho, lô kho hoặc chứng từ`, 409);
      }
      const foundIds = rows.map(row => row.id);
      await tx.equipmentMaterial.deleteMany({ where: { materialId: { in: foundIds } } });
      await tx.material.deleteMany({ where: { id: { in: foundIds } } });
      return rows;
    }, { timeout: 60_000 });
    const idsDeleted = materials.map(row => row.id);
    await audit(user.id, "DELETE_MATERIAL", "Material", idsDeleted.join(","), auditDetailWithPosition(user, materials.map(row => row.code).join(", ")));
    invalidateEquipmentDashboardCache();
    return ok({ ids: idsDeleted, count: idsDeleted.length });
  });
}
