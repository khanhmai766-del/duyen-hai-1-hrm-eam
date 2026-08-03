import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { EQUIPMENT_DEVICE_SELECT, equipmentNodeToDevice } from "@/lib/equipment-device";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { publicUserRef } from "@/lib/s3";
import { canViewMaterialReplacement } from "@/lib/material-replacement-access";

export const dynamic = "force-dynamic";

// Tầng 4: bảng lịch sử phình theo năm tháng — GET luôn có trần, không findMany không giới hạn.
const HISTORY_TAKE = 300;

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const access = await resolveEquipmentAccessForUser(user);
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
      canViewMaterialReplacement(access, {
        deviceSeq: log.deviceSeq ?? log.replacement?.deviceSeq ?? null,
        system: log.systemLabel ?? log.replacement?.system ?? null,
      })
    );

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
            : { id: "", code: "", name: "—", unit: log.unitLabel ?? "", system: null, deviceMaterials: [] },
        };
        // Đã chốt thì lấy bản chính thức; chưa chốt thì lấy bản nháp đang chờ.
        const finalRow = log.defectId ? finalizedByDefect.get(log.defectId) : undefined;
        const pendingRow = log.defectId ? pendingByDefect.get(log.defectId) : undefined;
        const source = finalRow ?? pendingRow;
        return {
          ...log,
          doneBy: publicUserRef(log.doneBy),
          // Điểm theo dõi đã bị gỡ/xoá — dùng để hiện nhãn mờ trên giao diện.
          pointRemoved: !log.replacement,
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
