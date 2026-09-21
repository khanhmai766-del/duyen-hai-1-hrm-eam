import type { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { audit, auditDetailWithPosition, fail, handle, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { PCCC_PERMISSION, cuongViListOf, pcccPositionCodesOf, pcccWriteScopeOf, resolvePeriod } from "@/lib/pccc-service";
import { loadSignatureImages } from "@/lib/pccc-archive";
import {
  BOOK_GROUPS,
  bookFileNameOf,
  bookKeyOf,
  bookPositionOf,
  bookStatusOf,
  loadBookData,
  normalizeBookMachine,
  type BookGroupKey,
  type BookRow,
} from "@/lib/pccc-so-theo-doi";
import { buildPcccBookPdf } from "@/lib/pccc-so-theo-doi-pdf";
import { fcdFileNameOf, fcdKeyOf, fcdStatusOf, loadFcdReport } from "@/lib/pccc-fcd-report";
import { buildPcccFcdPdf } from "@/lib/pccc-fcd-pdf";
import { positionLabelOf, type PositionCode } from "@/lib/position-catalog";
import { uploadS3Object } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Nhãn tổ máy in lên bìa sổ — giữ đúng chữ dùng trên giao diện PCCC. */
const MACHINE_LABELS: Record<string, string> = { S1: "Tổ máy 1", S2: "Tổ máy 2", COMMON: "Common" };

/**
 * Bản nháp mở THẲNG trong khung xem của hộp thoại (`inline`) chứ không rơi vào thư mục
 * Tải xuống — người dùng còn chưa chốt in mà máy đã có sẵn một tệp thì đúng là thứ hộp
 * thoại xem trước sinh ra để tránh.
 */
function pdfHeaders(fileName: string, preview: boolean): HeadersInit {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${fileName}"`,
  };
}

/**
 * GET /api/pccc/so-theo-doi/export?period=&cuongVi=&preview=1
 * Dựng "Sổ theo dõi phương tiện PCCC" (Mẫu số 01) của một cương vị hoặc toàn bộ cương
 * vị, LƯU LÊN S3 rồi trả luôn tệp về cho trình duyệt tải xuống.
 *
 * `preview=1` = BẢN NHÁP để người dùng xem qua trước khi chốt: dựng đúng cùng một PDF
 * nhưng KHÔNG đẩy lên S3 và KHÔNG ghi nhật ký. Xem trước là một thao tác đọc — soi thử
 * năm lần rồi mới in mà lần nào cũng đẻ ra một bản lưu trữ thì kho S3 lẫn nhật ký kiểm
 * toán đều loạn, không còn phân biệt được bản nào là bản đã phát hành.
 *
 * Lưu S3 trước, trả tệp sau và cả hai dùng CHUNG một buffer: bản người dùng cầm trên tay
 * luôn khớp từng byte với bản lưu trữ, không có chuyện in ra một đằng lưu một nẻo.
 *
 * Điều kiện ký đủ được kiểm LẠI ở đây, không tin nút bấm phía client: gọi thẳng URL này
 * là một cửa vào hợp lệ.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.view, ["read", "personal", "manage", "full"]);

    const sp = req.nextUrl.searchParams;
    const preview = sp.get("preview") === "1";
    const period = await resolvePeriod(sp.get("period"));

    // Bảng Foam·CO2·Diesel·FM200: một bản cho cả kỳ, không theo cương vị.
    if (sp.get("tab") === "FCD") {
      const status = await fcdStatusOf(period.id);
      if (!status.ready) return fail(status.reason ?? "Chưa đủ điều kiện xuất bảng", 409);
      const report = await loadFcdReport(period.id);
      const images = await loadSignatureImages([
        ...report.bulks.map((b) => b.signatureKey),
        ...report.panels.map((p) => p.signatureKey),
      ]);
      const pdf = await buildPcccFcdPdf({ periodLabel: period.label, report, signatureImages: images });
      const fcdName = fcdFileNameOf(period.label);
      if (!preview) {
        await uploadS3Object({ key: fcdKeyOf(period.label), body: pdf, contentType: "application/pdf", originalName: fcdName });
        await audit(
          user.id,
          "EXPORT_PCCC_BOOK",
          "PcccPeriod",
          period.id,
          auditDetailWithPosition(user, `Xuất bảng Foam·CO2·Diesel·FM200 ${period.label}`)
        );
      }
      return new Response(pdf as unknown as BodyInit, {
        headers: pdfHeaders(fcdName, preview),
      });
    }

    // ?groups=BCC,TCC — chọn nhóm thiết bị đưa vào sổ. Bỏ trống = in đủ sáu nhóm.
    // Lọc theo DANH MỤC chuẩn chứ không tin chuỗi client gửi lên, để một tham số bịa
    // không lọt xuống truy vấn.
    const requested = (sp.get("groups") ?? "").split(",").map((g) => g.trim().toUpperCase());
    const groups = BOOK_GROUPS.map((g) => g.key).filter((key) => requested.includes(key)) as BookGroupKey[];

    // ?machine=S1|S2|COMMON — lọc theo tổ máy. Bỏ trống hoặc giá trị lạ = in cả ba,
    // giữ nguyên hành vi cũ. Chuẩn hóa ở đây chứ không tin chuỗi client gửi lên.
    const machine = normalizeBookMachine(sp.get("machine"));
    const machineLabel = machine ? MACHINE_LABELS[machine] : null;

    const scope = await pcccWriteScopeOf(user);
    const exportAllPositions = sp.get("cuongVi")?.trim().toUpperCase() === "ALL";
    if (exportAllPositions && !scope.all) {
      return fail("Chỉ tài khoản được quản lý toàn bộ dữ liệu PCCC mới có thể xuất tất cả cương vị", 403);
    }

    const singlePosition = exportAllPositions
      ? null
      : bookPositionOf(scope, sp.get("cuongVi"), pcccPositionCodesOf(user)[0]);
    const positionCodes: PositionCode[] = exportAllPositions
      ? (await cuongViListOf(period.id)).map((position) => position.code as PositionCode)
      : singlePosition
        ? [singlePosition]
        : [];

    if (!positionCodes.length) {
      return fail("Không tìm thấy cương vị phù hợp để xuất sổ theo dõi", 409);
    }

    const statuses = await Promise.all(
      positionCodes.map(async (positionCode) => ({ positionCode, status: await bookStatusOf(period.id, positionCode) }))
    );
    if (!exportAllPositions && !statuses[0].status.ready) {
      return fail(statuses[0].status.reason ?? "Chưa đủ điều kiện xuất sổ theo dõi", 409);
    }
    // Danh sách cương vị lấy từ toàn bộ module còn có thể chứa cương vị chỉ quản lý bảng
    // Foam/CO2/Diesel/FM200. Bảng đó xuất riêng, nên không đưa cương vị không có dòng Bảng II
    // vào PDF tổng hợp và cũng không coi đó là lỗi.
    const applicable = statuses.filter(({ status }) => status.groups.some((group) => group.total > 0));
    const notReady = applicable.filter(({ status }) => !status.ready);
    if (notReady.length) {
      const details = notReady
        .slice(0, 4)
        .map(({ status }) => `${status.positionLabel ?? "Cương vị chưa xác định"}: ${status.reason ?? "chưa đủ điều kiện"}`)
        .join("; ");
      const remaining = notReady.length > 4 ? `; và ${notReady.length - 4} cương vị khác` : "";
      return fail(`Chưa thể xuất tất cả cương vị. ${details}${remaining}`, 409);
    }

    const books: Array<{ positionCode: PositionCode; positionLabel: string; rows: BookRow[] }> = [];
    const merged = exportAllPositions ? await PDFDocument.create() : null;
    let singlePdf: Buffer | null = null;
    for (const { positionCode } of applicable) {
      const { rows } = await loadBookData(period.id, positionCode, groups, machine);
      // Khi chỉ chọn một vài nhóm hoặc một tổ máy, có cương vị hợp lệ nhưng không có dòng
      // thuộc phạm vi đó. PDF tổng hợp bỏ qua cương vị này thay vì sinh một quyển rỗng.
      if (!rows.length) continue;
      const signatureImages = await loadSignatureImages(rows.map((row) => row.signatureKey));
      const pdf = await buildPcccBookPdf({
        periodLabel: period.label,
        positionLabel: positionLabelOf(positionCode),
        machineLabel,
        rows,
        signatureImages,
      });
      if (merged) {
        // Ghép ngay rồi thả buffer quyển con ở vòng lặp kế tiếp: xuất toàn bộ có thể gồm
        // hàng nghìn thiết bị, giữ đồng thời mọi PDF con sẽ làm RAM tăng vọt không cần thiết.
        const source = await PDFDocument.load(pdf);
        const pages = await merged.copyPages(source, source.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
      } else {
        singlePdf = pdf;
      }
      books.push({
        positionCode,
        positionLabel: positionLabelOf(positionCode),
        rows,
      });
    }

    if (!books.length) {
      return fail(
        machine
          ? `Nhóm thiết bị đã chọn không có dòng nào thuộc ${machineLabel}`
          : "Nhóm thiết bị đã chọn không có dòng nào để xuất",
        409
      );
    }

    let buffer: Buffer;
    if (merged) {
      merged.setTitle(`So theo doi phuong tien PCCC - Tat ca cuong vi - ${period.label}`);
      buffer = Buffer.from(await merged.save());
    } else {
      // Có ít nhất một `books` sau cửa kiểm tra trên nên nhánh đơn luôn đã dựng `singlePdf`.
      buffer = singlePdf as Buffer;
    }

    const archiveCode = exportAllPositions ? "ALL" : books[0].positionCode;
    const key = bookKeyOf(period.label, archiveCode, machine);
    const fileName = bookFileNameOf(period.label, archiveCode, machine);
    if (!preview) {
      await uploadS3Object({ key, body: buffer, contentType: "application/pdf", originalName: fileName });

      const totalRows = books.reduce((sum, book) => sum + book.rows.length, 0);
      const scopeLabel = exportAllPositions ? `Tất cả cương vị (${books.length})` : books[0].positionLabel;
      await audit(
        user.id,
        "EXPORT_PCCC_BOOK",
        "PcccPeriod",
        period.id,
        auditDetailWithPosition(user, `Xuất sổ theo dõi PCCC ${period.label} · ${scopeLabel}${machineLabel ? ` · ${machineLabel}` : ""} · ${totalRows} thiết bị`)
      );
    }

    return new Response(buffer as unknown as BodyInit, {
      headers: pdfHeaders(fileName, preview),
    });
  });
}
