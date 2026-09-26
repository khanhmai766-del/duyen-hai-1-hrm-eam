"use client";

import { use } from "react";
import { PermitWorkScreen } from "@/components/work-permits/work-screen";

/** Màn hình làm việc (toàn trang) của một PCT nhà thầu — mở từ nút trong hộp chi tiết phiếu. Quyền kiểm ở API. */
export default function PermitWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <PermitWorkScreen id={id} />;
}
