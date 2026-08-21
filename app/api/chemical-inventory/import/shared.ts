import type { NextRequest } from "next/server";
import { fail } from "@/lib/api";
import type { ImportPlan } from "@/lib/chemical-inventory/importer";

/**
 * Phần dùng chung của hai bước import.
 *
 * KHÔNG phải route — đặt cạnh hai route để đọc code không phải nhảy đi xa. Next chỉ
 * coi `route.ts` là endpoint nên tệp này không tạo ra đường dẫn nào.
 */

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Đọc tệp tải lên. Trả về CẢ form vì thân request chỉ đọc được một lần — gọi
 * `req.formData()` lần thứ hai trong cùng một handler sẽ ném lỗi thân đã dùng.
 */
export async function readUploadedWorkbook(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) throw fail("Yêu cầu phải là multipart/form-data", 400);

  const file = form.get("file");
  if (!(file instanceof File)) throw fail("Chưa chọn tệp", 400);
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw fail("Chỉ chấp nhận tệp .xlsx", 400);
  if (file.size > MAX_UPLOAD_BYTES) {
    throw fail(`Tệp vượt quá ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`, 413);
  }

  return { buffer: Buffer.from(await file.arrayBuffer()), fileName: file.name, form };
}

/**
 * Rút gọn kế hoạch trước khi trả về giao diện.
 *
 * Không gửi nguyên `plan.readings` / `plan.receipts`: vài trăm dòng chi tiết không
 * giúp gì cho người bấm nút, chỉ làm phình response. Giao diện cần thống kê, danh
 * sách vấn đề và bảng đối soát.
 */
export function summarizePlan(plan: ImportPlan) {
  const errors = plan.issues.filter((i) => i.severity === "error");
  const warnings = plan.issues.filter((i) => i.severity === "warning");
  const infos = plan.issues.filter((i) => i.severity === "info");

  const byCode: Record<string, number> = {};
  for (const issue of [...errors, ...warnings]) byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;

  return {
    fileName: plan.fileName,
    fileHash: plan.fileHash,
    bySheet: plan.bySheet,
    summary: {
      periods: plan.periods.length,
      readings: plan.readings.length,
      receipts: plan.receipts.length,
      contracts: plan.contracts.length,
      errorCount: errors.length,
      warningCount: warnings.length,
    },
    issueCountByCode: byCode,
    issues: [...errors, ...warnings, ...infos].slice(0, 200),
    // Chỉ gửi các ô lệch: ô khớp không có gì để xem.
    reconcile: plan.reconcile.filter((r) => r.kind === "MISMATCH" || r.kind === "MANUAL_ADJUSTMENT"),
    canCommit: errors.length === 0,
  };
}
