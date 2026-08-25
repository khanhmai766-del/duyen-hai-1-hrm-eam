import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { isDefectShiftLeaderCandidatePosition } from "@/lib/defect-shift-leader-position";
import { pointLabelOf, resolveMaterialRequest } from "@/lib/defect-material-request";

export const dynamic = "force-dynamic";

/**
 * GET /api/material-tickets/[id]/replacement-request
 *
 * Dữ liệu mồi sẵn cho nút "Ra SYC sửa chữa" trên phiếu vật tư — đúng hình dạng mà
 * `DefectForm` nhận qua `initialDevice` + `initialMaterialRequest`, để màn phiếu vật tư dùng
 * LẠI form của màn Khiếm khuyết chứ không dựng form riêng.
 *
 * Cổng vật tư (app/api/defects/route.ts) mới là nơi chặn thật. Ở đây chỉ trả dữ liệu và cho
 * biết phiếu đã đủ điều kiện chưa, để giao diện hiện đúng trạng thái nút.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireUser();

    const ticket = await prisma.materialTicket.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        unit: true,
        status: true,
        defectId: true,
        proposalNote: true,
        proposalNumber: true,
        receivedAt: true,
        vhvReceivedAt: true,
        assignedPosition: true,
        replacementLinks: {
          select: { replacementId: true, plannedQuantity: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!ticket) return fail("Không tìm thấy phiếu", 404);

    const links = ticket.replacementLinks;
    if (links.length === 0) {
      return ok({ eligible: false, reason: "Phiếu chưa gắn điểm thay thế nào", points: [] });
    }

    // Một nguồn dựng duy nhất với cổng tạo Defect. Nhờ vậy điểm ở cấp thư mục và phiếu
    // nhiều vật tư không còn bị màn hình mồi sai dù server vẫn lưu đúng.
    const resolved = await resolveMaterialRequest(prisma, links.map((link) => link.replacementId));
    if (typeof resolved === "string") {
      return ok({
        eligible: false,
        alreadyLinked: Boolean(ticket.defectId),
        reason: resolved,
      });
    }

    const first = resolved.points[0];
    const plannedQuantityByPoint = new Map(
      links.map((link) => [link.replacementId, link.plannedQuantity] as const)
    );
    const resolvedRowByPoint = new Map(
      resolved.rows.map((row) => [row.replacementId, row] as const)
    );

    const demoDefaultsPromise = process.env.NODE_ENV === "development"
      ? prisma.user.findMany({
          where: { isActive: true },
          select: {
            id: true,
            position: true,
            secondaryPosition: true,
            secondaryPosition2: true,
            currentPosition: true,
          },
          orderBy: { name: "asc" },
        }).then((users) => {
          const shiftLeader = users.find((user) =>
            [user.position, user.secondaryPosition, user.secondaryPosition2, user.currentPosition]
              .some(isDefectShiftLeaderCandidatePosition)
          );
          return shiftLeader
            ? {
                condition: "B" as const,
                severity: "4" as const,
                severityCriteria: ["4c"],
                shiftLeaderId: shiftLeader.id,
              }
            : undefined;
        })
      : Promise.resolve(undefined);

    const [primaryNode, demoDefaults] = await Promise.all([
      prisma.equipmentNode.findUnique({
        where: { seq: resolved.primarySeq },
        select: { childCount: true },
      }),
      demoDefaultsPromise,
    ]);
    const primaryIsFolder = (primaryNode?.childCount ?? 0) > 0;

    // Giúp local dev mở form là demo được ngay nhưng tuyệt đối không áp mặc định nghiệp vụ
    // lên production. Lấy người thật trong DB local để API tạo SYC vẫn kiểm tra hợp lệ.
    // Nội dung ưu tiên lý do người lập phiếu; chỉ rơi về gợi ý chuẩn của resolver khi trống.
    const proposalReason = (ticket.proposalNote ?? "").trim();
    const suggestedContent = [
      proposalReason || resolved.suggestedContent,
      ticket.proposalNumber ? `(Phiếu ĐXVT số ${ticket.proposalNumber})` : "",
    ].filter(Boolean).join(" ");

    const receiptConfirmed = Boolean(ticket.receivedAt || ticket.vhvReceivedAt);
    const alreadyLinked = Boolean(ticket.defectId);

    return ok({
      // Đủ điều kiện = đã qua bước xác nhận vật tư lãnh. Luồng Ứng ghi số lãnh ở
      // `vhvReceivedAt`, hai luồng còn lại ở `receivedAt`.
      eligible: receiptConfirmed && !alreadyLinked,
      alreadyLinked,
      reason: alreadyLinked
        ? "Phiếu đã gắn với một số yêu cầu sửa chữa"
        : receiptConfirmed
          ? null
          : "Phiếu chưa xác nhận vật tư lãnh",
      device: {
        code: resolved.primarySeq,
        name: resolved.primaryName,
        system: primaryIsFolder ? resolved.primaryName : (first.system || null),
        systemSeq: resolved.primarySeq,
        managingPosition: resolved.managingPosition ?? ticket.assignedPosition ?? null,
        unit: resolved.unit || ticket.unit || null,
      },
      materialRequest: {
        replacementIds: resolved.points.map((point) => point.id),
        materialName: first.material.name,
        materialUnit: first.material.unit,
        materialCategory: first.material.category,
        primaryIsFolder,
        primarySystemName: primaryIsFolder ? resolved.primaryName : (first.system || ""),
        primaryDeviceName: resolved.primaryName,
        points: resolved.points.map((point) => ({
          id: point.id,
          label: resolvedRowByPoint.get(point.id)?.pointLabel || pointLabelOf(point),
          // Ưu tiên snapshot lúc gắn phiếu; điểm bị sửa khai báo về sau không làm đổi con số
          // mà phiếu đã căn cứ.
          quantity: plannedQuantityByPoint.get(point.id)
            ?? resolvedRowByPoint.get(point.id)?.quantity
            ?? 0,
          materialName: point.material.name,
          materialUnit: point.material.unit,
        })),
        suggestedContent,
        demoDefaults,
      },
    });
  });
}
