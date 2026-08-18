"use client";

import { Suspense } from "react";
import { RbacProtectedRoute } from "@/components/shared/rbac-protected-route";
import { ReplacementsPageContent } from "@/app/(dashboard)/replacements/replacements-view";

/**
 * Lịch sử thay thế vật tư — tách khỏi tab của trang Lịch thay thế để tra cứu cho nhanh,
 * nhất là sau khi nhập bộ dữ liệu lưu trữ từ sổ theo dõi vật tư.
 *
 * Dùng lại đúng thành phần của trang Lịch thay thế với `only="history"`: mọi bộ lọc
 * (tổ máy, cương vị, loại vật tư, khoảng tháng, tìm kiếm) và nút xuất backup đều giữ
 * nguyên hành vi, không nhân bản mã.
 */
export default function ReplacementHistoryPage() {
  return (
    <RbacProtectedRoute permissionId="replacement-manage" featureLabel="Lịch sử thay thế vật tư">
      <Suspense fallback={null}>
        <ReplacementsPageContent only="history" />
      </Suspense>
    </RbacProtectedRoute>
  );
}
