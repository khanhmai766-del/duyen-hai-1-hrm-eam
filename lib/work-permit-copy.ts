import type { PermitInput } from "@/lib/work-permits";

/** Phiếu mới giữ nội dung đã ghi; không phụ thuộc ID danh mục hoặc xác nhận chia sẻ của phiếu cũ. */
export function copyPermitSnapshots(source: Pick<PermitInput, "safetyItems" | "overhaulItems">) {
  return {
    safetyItems: (source.safetyItems ?? []).map(({ hazard, measure, forAuthorization, forExecution }) => ({
      hazard, measure, forAuthorization, forExecution,
    })),
    overhaulItems: (source.overhaulItems ?? []).map(({ code, device, content, method, source, sheet }) => ({
      code, device, content, method, source, sheet,
    })),
  };
}
