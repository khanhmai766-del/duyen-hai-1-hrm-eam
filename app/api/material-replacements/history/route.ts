import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { EQUIPMENT_DEVICE_SELECT, equipmentNodeToDevice } from "@/lib/equipment-device";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { publicUserRef } from "@/lib/s3";
import { canViewMaterialReplacement } from "@/lib/material-replacement-access";
import { resolvePositionViewScope } from "@/lib/position-data-scope";
import { normalizeText } from "@/lib/nav";

export const dynamic = "force-dynamic";

// Tầng 4: bảng lịch sử phình theo năm tháng — GET luôn có trần, không findMany không giới hạn.
// Nâng 300 → 2000 khi nhập bộ lưu trữ từ sổ theo dõi vật tư (645 dòng, trải 14 tháng):
// giao diện lọc khoảng tháng ở CLIENT nên trần cắt trước sẽ làm các tháng cũ biến mất
// hẳn khỏi bảng. `meta.capped` vẫn báo lên khi chạm trần.
const HISTORY_TAKE = 2000;

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const access = await resolveEquipmentAccessForUser(user);
    // Tab "Lịch sử thay thế" — cùng rào cương vị với hai tab kia.
    const viewScope = await resolvePositionViewScope(user, "replacement");
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim();

    const where: Prisma.MaterialReplacementLogWhereInput = {};
    if (q) {
      where.OR = [
        { note: { contains: q, mode: "insensitive" } },
        // Snapshot trên chính dòng log — tìm được cả khi điểm theo dõi đã bị gỡ.
        { deviceLabel: { contains: q, mode: "insensitive" } },
        { systemLabel: { contains: q, mode: "insensitive" } },
        { deviceSeq: { contains: q, mode: "insensitive" } },
        { requestNumber: { contains: q, mode: "insensitive" } },
        // Dòng lưu trữ không có quan hệ material — phải tìm trên chính snapshot của log.
        { materialNameLabel: { contains: q, mode: "insensitive" } },
        { pctNumber: { contains: q, mode: "insensitive" } },
        { sourceNote: { contains: q, mode: "insensitive" } },
        { doneByName: { contains: q, mode: "insensitive" } },
        { material: { is: { name: { contains: q, mode: "insensitive" } } } },
        { material: { is: { code: { contains: q, mode: "insensitive" } } } },
        { replacement: { is: { device: { is: { seq: { contains: q, mode: "insensitive" } } } } } },
        { replacement: { is: { device: { is: { name: { contains: q, mode: "insensitive" } } } } } },
        { replacement: { is: { material: { is: { deviceMaterials: { some: { device: { is: { seq: { contains: q, mode: "insensitive" } } } } } } } } } },
        { replacement: { is: { material: { is: { deviceMaterials: { some: { device: { is: { name: { contains: q, mode: "insensitive" } } } } } } } } } },
        { replacement: { is: { material: { is: { name: { contains: q, mode: "insensitive" } } } } } },
        { replacement: { is: { material: { is: { code: { contains: q, mode: "insensitive" } } } } } },
      ];
    }

    const logs = await prisma.materialReplacementLog.findMany({
      where,
      orderBy: { replacedAt: "desc" },
      take: HISTORY_TAKE,
      include: {
        // Tầng 4: avatar đi qua publicUserRef (proxy theo key) — không chở base64.
        doneBy: { select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true } },
        // Vật tư đọc thẳng từ snapshot của log, không qua điểm thay thế.
        material: {
          select: {
            id: true,
            code: true,
            name: true,
            unit: true,
            system: true,
            machine: true,
            category: true,
          },
        },
        replacement: {
          select: {
            deviceSeq: true,
            system: true,
            managingPosition: true,
            intervalMonths: true,
            intervalNote: true,
            device: { select: EQUIPMENT_DEVICE_SELECT },
            material: {
              select: {
                id: true,
                code: true,
                name: true,
                unit: true,
                system: true,
                // Bắt buộc phải có machine + category: bảng Lịch sử thay thế lọc theo
                // tổ máy (mặc định S1) và loại vật tư dựa trên chính hai trường này.
                // Thiếu chúng thì `machine` về undefined → coi như COMMON → mọi dòng
                // CÒN điểm theo dõi bị bộ lọc mặc định loại sạch, trong khi dòng đã
                // mất điểm lại hiện bình thường (nhánh snapshot có sẵn hai trường).
                machine: true,
                category: true,
                deviceMaterials: {
                  select: { device: { select: EQUIPMENT_DEVICE_SELECT } },
                  orderBy: { usedAt: "desc" },
                },
              },
            },
          },
        },
      },
    });
    // Nội dung thực hiện của các dòng sinh từ SYC thay thế vật tư được ĐỌC SỐNG từ
    // lịch sử khiếm khuyết, không chép cứng: phiếu còn đi qua giai đoạn chờ chốt và
    // vẫn nhận thêm dữ liệu sửa chữa, nên chép lúc ghi sẽ đứng hình ở bản nháp đầu.
    const defectIds = [...new Set(logs.map((log) => log.defectId).filter(Boolean) as string[])];
    const [pendings, finalized] = defectIds.length
      ? await Promise.all([
          prisma.defectHistoryPending.findMany({
            where: { defectId: { in: defectIds } },
            select: {
              defectId: true, workOrderNumber: true, requestType: true,
              performedAt: true, content: true, result: true, finalizeAt: true,
            },
          }),
          prisma.defectHistory.findMany({
            where: { defectId: { in: defectIds } },
            select: {
              defectId: true, workOrderNumber: true, requestType: true,
              performedAt: true, content: true, result: true, requestNumber: true,
            },
          }),
        ])
      : [[], []];
    const pendingByDefect = new Map(pendings.map((row) => [row.defectId, row]));
    const finalizedByDefect = new Map(
      finalized.flatMap((row) => (row.defectId ? [[row.defectId, row] as const] : []))
    );

    // RBAC theo snapshot trước, rồi mới tới điểm còn liên kết. Trước đây dòng nào mất
    // điểm là bị loại thẳng — nay điểm theo dõi bị gỡ sau MỖI lần ghi nhận nên làm vậy
    // sẽ giấu mất gần như toàn bộ lịch sử.
    const visibleLogs = logs.filter((log) =>
      canViewMaterialReplacement(
        access,
        {
          deviceSeq: log.deviceSeq ?? log.replacement?.deviceSeq ?? null,
          system: log.systemLabel ?? log.replacement?.system ?? null,
          // Cương vị đọc từ SNAPSHOT trên chính dòng log trước — điểm theo dõi bị gỡ
          // sau mỗi lần ghi nhận nên không thể trông vào `replacement`.
          // Nhãn cũng đủ: `canViewPosition` quy nhãn về mã qua `positionCodeOf`, và đo
          // trên prod thì 100% giá trị cương vị đang lưu đều quy được về danh mục.
          managingPosition: log.managingPosition ?? log.replacement?.managingPosition ?? null,
          // Dòng lưu trữ không có thiết bị/hệ thống — xem lib/material-replacement-access.ts
          importSource: log.importSource,
        },
        viewScope
      )
    );

    /**
     * Dòng nhập từ sổ chỉ có tên người ghi nhận dạng chữ (`doneByName`); `doneBy`
     * thực tế là tài khoản chạy lệnh nhập. Đối chiếu tên với hồ sơ user để bảng có
     * thể hiện đúng avatar. Chỉ nhận tên khớp DUY NHẤT — nếu có hai tài khoản trùng
     * tên thì để null, tránh gắn nhầm ảnh của người khác.
     */
    const recordedNameKeys = new Set(
      visibleLogs
        .map((log) => normalizeText(log.doneByName ?? ""))
        .filter(Boolean)
    );
    type RecordedUser = {
      id: string;
      name: string;
      position: string | null;
      avatarUrl: string | null;
      avatarKey: string | null;
    };
    const recordedUserByName = new Map<string, RecordedUser | null>();
    if (recordedNameKeys.size > 0) {
      const users = await prisma.user.findMany({
        select: { id: true, name: true, position: true, avatarUrl: true, avatarKey: true },
      });
      for (const candidate of users) {
        const key = normalizeText(candidate.name);
        if (!recordedNameKeys.has(key)) continue;
        recordedUserByName.set(key, recordedUserByName.has(key) ? null : candidate);
      }
    }

    return ok(
      visibleLogs.map((log: any) => {
        // Giao diện đọc qua `replacement`; khi điểm đã bị gỡ thì dựng lại từ snapshot
        // để bảng lịch sử không phải xử lý hai dạng dòng khác nhau.
        const fromSnapshot = {
          deviceSeq: log.deviceSeq,
          system: log.systemLabel,
          managingPosition: log.managingPosition,
          intervalMonths: log.intervalMonths ?? 0,
          intervalNote: log.intervalNote,
          device: log.deviceSeq
            ? {
                id: log.deviceSeq,
                code: log.deviceSeq,
                name: log.deviceLabel ?? log.deviceSeq,
                system: log.systemLabel ?? null,
                managingPosition: log.managingPosition ?? null,
              }
            : null,
          material: log.material
            ? { ...log.material, deviceMaterials: [] }
            : {
                id: "",
                code: "",
                // Dòng lưu trữ nhập từ sổ theo dõi giữ tên vật tư dạng chữ (Sheet dùng
                // danh mục rộng hơn Danh mục Vận Hành 1 nên phần lớn không tra ra materialId).
                name: log.materialNameLabel || "—",
                unit: log.unitLabel ?? "",
                system: null,
                category: log.materialCategory ?? null,
                deviceMaterials: [],
              },
        };
        // Đã chốt thì lấy bản chính thức; chưa chốt thì lấy bản nháp đang chờ.
        const finalRow = log.defectId ? finalizedByDefect.get(log.defectId) : undefined;
        const pendingRow = log.defectId ? pendingByDefect.get(log.defectId) : undefined;
        const source = finalRow ?? pendingRow;
        const recordedByUser = log.doneByName
          ? recordedUserByName.get(normalizeText(log.doneByName)) ?? null
          : null;
        return {
          ...log,
          doneBy: publicUserRef(log.doneBy),
          /** User trùng duy nhất với tên trên sổ; null nếu không tìm thấy hoặc bị trùng tên. */
          recordedByUser: recordedByUser ? publicUserRef(recordedByUser) : null,
          // Điểm theo dõi đã bị gỡ/xoá — dùng để hiện nhãn mờ trên giao diện.
          // Dòng LƯU TRỮ chưa từng có điểm theo dõi nên không phải "đã gỡ".
          pointRemoved: !log.replacement && !log.importSource,
          /** true = dòng nhập từ sổ theo dõi vật tư, chỉ để tra cứu. */
          imported: Boolean(log.importSource),
          defectHistory: source
            ? {
                status: finalRow ? "FINALIZED" : "PENDING",
                workOrderNumber: source.workOrderNumber,
                requestType: source.requestType,
                performedAt: source.performedAt,
                content: source.content,
                result: source.result,
                finalizeAt: finalRow ? null : pendingRow?.finalizeAt ?? null,
              }
            : null,
          replacement: log.replacement
            ? {
                ...log.replacement,
                device: equipmentNodeToDevice(log.replacement.device),
                material: {
                  ...log.replacement.material,
                  deviceMaterials: log.replacement.material.deviceMaterials?.map((dm: any) => ({
                    ...dm,
                    device: equipmentNodeToDevice(dm.device),
                  })),
                },
              }
            : fromSnapshot,
        };
      }),
      { total: visibleLogs.length, capped: logs.length === HISTORY_TAKE }
    );
  });
}
