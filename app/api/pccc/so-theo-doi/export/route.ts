import type { NextRequest } from "next/server";
import { audit, auditDetailWithPosition, fail, handle, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { PCCC_PERMISSION, pcccPositionCodesOf, pcccWriteScopeOf, resolvePeriod } from "@/lib/pccc-service";
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
} from "@/lib/pccc-so-theo-doi";
import { buildPcccBookPdf } from "@/lib/pccc-so-theo-doi-pdf";
import { fcdFileNameOf, fcdKeyOf, fcdStatusOf, loadFcdReport } from "@/lib/pccc-fcd-report";
import { buildPcccFcdPdf } from "@/lib/pccc-fcd-pdf";
import { positionLabelOf } from "@/lib/position-catalog";
import { uploadS3Object } from "@/lib/s3";

export const dynamic = "force-dynamic";

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
 * Dựng "Sổ theo dõi phương tiện PCCC" (Mẫu số 01) của MỘT cương vị, LƯU LÊN S3 rồi trả
 * luôn tệp về cho trình duyệt tải xuống.
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

    const scope = await pcccWriteScopeOf(user);
    const positionCode = bookPositionOf(scope, sp.get("cuongVi"), pcccPositionCodesOf(user)[0]);
    const status = await bookStatusOf(period.id, positionCode);
    if (!positionCode || !status.ready) {
      return fail(status.reason ?? "Chưa đủ điều kiện xuất sổ theo dõi", 409);
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

    const { rows } = await loadBookData(period.id, positionCode, groups, machine);
    if (!rows.length) {
      return fail(
        machine
          ? `Nhóm thiết bị đã chọn không có dòng nào ở cương vị này thuộc ${machineLabel}`
          : "Nhóm thiết bị đã chọn không có dòng nào ở cương vị này",
        409
      );
    }
    const signatureImages = await loadSignatureImages(rows.map((r) => r.signatureKey));
    const buffer = await buildPcccBookPdf({
      periodLabel: period.label,
      positionLabel: positionLabelOf(positionCode),
      machineLabel,
      rows,
      signatureImages,
    });

    const key = bookKeyOf(period.label, positionCode, machine);
    const fileName = bookFileNameOf(period.label, positionCode, machine);
    if (!preview) {
      await uploadS3Object({ key, body: buffer, contentType: "application/pdf", originalName: fileName });

      await audit(
        user.id,
        "EXPORT_PCCC_BOOK",
        "PcccPeriod",
        period.id,
        auditDetailWithPosition(user, `Xuất sổ theo dõi PCCC ${period.label} · ${positionLabelOf(positionCode)}${machineLabel ? ` · ${machineLabel}` : ""} · ${rows.length} thiết bị`)
      );
    }

    return new Response(buffer as unknown as BodyInit, {
      headers: pdfHeaders(fileName, preview),
    });
  });
}
