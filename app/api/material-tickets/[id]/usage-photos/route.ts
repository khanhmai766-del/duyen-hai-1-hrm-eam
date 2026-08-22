import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { getWorkflowRoleMap, stepAllowedWithMap } from "@/lib/material-workflow";
import { positionsMatch } from "@/lib/position-catalog";
import { s3ProxyUrl } from "@/lib/s3";
import { buildBbntDoDocument, getTicket } from "@/lib/material-ticket-bbnt-do";
import {
  countUsagePhotos,
  deleteUsagePhotos,
  isUsagePhotoSlot,
  uploadUsagePhoto,
  USAGE_PHOTO_COLUMNS,
  USAGE_PHOTO_LABELS,
  USAGE_PHOTO_SLOTS,
  MIN_USAGE_PHOTOS,
  type UsagePhotoSlot,
} from "@/lib/material-usage-photo";

export const dynamic = "force-dynamic";

const TICKET_SELECT = {
  id: true,
  status: true,
  assignedPosition: true,
  docUrl: true,
  usagePhotoBeforeKey: true,
  usagePhotoAfterKey: true,
  usagePhotoSpecKey: true,
} as const;

type TicketRow = {
  id: string;
  status: string;
  assignedPosition: string;
  docUrl: string | null;
  usagePhotoBeforeKey: string | null;
  usagePhotoAfterKey: string | null;
  usagePhotoSpecKey: string | null;
};

function photoPayload(t: TicketRow) {
  return USAGE_PHOTO_SLOTS.map((slot) => {
    const key = t[USAGE_PHOTO_COLUMNS[slot]];
    return {
      slot,
      ...USAGE_PHOTO_LABELS[slot],
      key,
      // Bucket không mở đọc ẩn danh — thẻ <img> phải đi qua proxy, xem lib/s3.ts.
      url: key ? s3ProxyUrl(key) : null,
    };
  });
}

/**
 * Ai được đụng vào ảnh = ai được thao tác bước "Sử dụng vật tư": cùng rào bước và
 * cùng rào cương vị được giao. Ảnh là một phần của bước đó, không phải tệp đính kèm
 * tự do — tách quyền riêng chỉ tạo thêm chỗ để quên cấu hình.
 */
async function requireUsagePhotoEditor(
  user: { id: string; role?: string | null; position?: string | null },
  t: TicketRow
) {
  if (user.role === "ADMIN") return;
  if (!stepAllowedWithMap(await getWorkflowRoleMap(), "use", user)) {
    throw fail("Bạn không có quyền ở bước Sử dụng vật tư", 403);
  }
  if (!positionsMatch(user.position, t.assignedPosition)) {
    throw fail(`Phiếu này được giao cho cương vị "${t.assignedPosition}" — bạn chỉ được xem`, 403);
  }
}

/**
 * Đổi ảnh thì BBNT D-Office đã phát hành phải mang ảnh mới NGAY.
 *
 * Ảnh lưu ngay lúc chọn, không đợi ai bấm lưu — nên nếu chỉ dựng lại biên bản ở tác
 * vụ sửa bước thì người dùng đổi ảnh xong đóng hộp thoại là biên bản giữ ảnh cũ.
 *
 * Ghi ĐÈ đúng tệp cũ (`existingKey` trong lib/bbnt-do-doc.ts) nên đổi ảnh bao nhiêu
 * lần cũng chỉ một tệp trên kho, link trên phiếu không đổi.
 *
 * Lỗi dựng biên bản KHÔNG được làm hỏng việc lưu ảnh: ảnh đã nằm trên kho và đã ghi
 * vào phiếu rồi, ném lỗi ở đây chỉ khiến người dùng bấm lại và tải lên lần nữa.
 */
async function refreshBbntDoAfterPhotoChange(ticketId: string, hadDoc: boolean) {
  if (!hadDoc) return;
  try {
    const full = await getTicket(ticketId);
    if (full?.docUrl) await buildBbntDoDocument(full);
  } catch {
    // bỏ qua — xem chú thích trên
  }
}

async function loadTicket(id: string): Promise<TicketRow> {
  const t = await prisma.materialTicket.findUnique({ where: { id }, select: TICKET_SELECT });
  if (!t) throw fail("Không tìm thấy phiếu", 404);
  return t;
}

/** GET — ba ô ảnh của phiếu, kèm nhãn để giao diện không phải tự chế lại. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireUser();
    const t = await loadTicket(params.id);
    return ok({ photos: photoPayload(t), minRequired: MIN_USAGE_PHOTOS, filled: countUsagePhotos(t) });
  });
}

/**
 * PUT — đặt ảnh cho MỘT ô. Nhận data URL (giao diện đã thu nhỏ sẵn), máy chủ nén
 * lại lần nữa rồi đẩy lên S3.
 *
 * Nén hai lần là cố ý: bản thu nhỏ ở trình duyệt chỉ để payload đừng quá nặng, còn
 * kích thước và định dạng cuối phải do máy chủ quyết, không tin dữ liệu gửi lên.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const t = await loadTicket(params.id);
    await requireUsagePhotoEditor(user, t);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const slot = body.slot;
    if (!isUsagePhotoSlot(slot)) return fail("Vị trí ảnh không hợp lệ");
    const dataUrl = String(body.dataUrl || "");
    if (!dataUrl) return fail("Chưa chọn ảnh");

    let uploaded: Awaited<ReturnType<typeof uploadUsagePhoto>>;
    try {
      uploaded = await uploadUsagePhoto(t.id, slot, dataUrl);
    } catch (error) {
      return fail((error as Error).message || "Tải ảnh lên thất bại");
    }

    const column = USAGE_PHOTO_COLUMNS[slot as UsagePhotoSlot];
    const previousKey = t[column];
    await prisma.materialTicket.update({ where: { id: t.id }, data: { [column]: uploaded.key } });
    // Chỉ xóa bản cũ SAU khi bản mới đã ghi vào phiếu — đổi thứ tự là có lúc phiếu
    // trỏ vào tệp vừa bị xóa.
    if (previousKey) await deleteUsagePhotos([previousKey]);

    await refreshBbntDoAfterPhotoChange(t.id, Boolean(t.docUrl));

    await audit(
      user.id, "MT_USAGE_PHOTO", "MaterialTicket", t.id,
      `${USAGE_PHOTO_LABELS[slot].title} (${USAGE_PHOTO_LABELS[slot].hint}): tải lên ${Math.round(uploaded.bytes / 1024)} KB` +
        (t.docUrl ? "; cập nhật lại BBNT D-Office" : "")
    );

    return ok({ photos: photoPayload(await loadTicket(t.id)) });
  });
}

/** DELETE ?slot=before|after|spec — gỡ một ô ảnh. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const t = await loadTicket(params.id);
    await requireUsagePhotoEditor(user, t);

    const slot = req.nextUrl.searchParams.get("slot");
    if (!isUsagePhotoSlot(slot)) return fail("Vị trí ảnh không hợp lệ");

    const column = USAGE_PHOTO_COLUMNS[slot];
    const key = t[column];
    if (!key) return ok({ photos: photoPayload(t) });

    await prisma.materialTicket.update({ where: { id: t.id }, data: { [column]: null } });
    await deleteUsagePhotos([key]);
    await refreshBbntDoAfterPhotoChange(t.id, Boolean(t.docUrl));
    await audit(user.id, "MT_USAGE_PHOTO", "MaterialTicket", t.id, `${USAGE_PHOTO_LABELS[slot].title}: đã gỡ ảnh`);

    return ok({ photos: photoPayload(await loadTicket(t.id)) });
  });
}
