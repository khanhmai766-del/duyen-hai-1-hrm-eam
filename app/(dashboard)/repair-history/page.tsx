"use client";

import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/shared/page-header";
import { DefectHistoryTab } from "@/components/repair/defect-history-tab";

export default function RepairHistoryPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lịch sử sửa chữa"
        description="Lịch sử khiếm khuyết thiết bị đã xử lý theo cương vị"
      />
      <DefectHistoryTab role={role} />
    </div>
  );
}
