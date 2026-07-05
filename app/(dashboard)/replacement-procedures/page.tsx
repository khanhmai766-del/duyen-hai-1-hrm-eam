"use client";

import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/shared/page-header";
import MaterialTicketBoard from "@/components/materials/MaterialTicketBoard";

export default function ReplacementProceduresPage() {
  const { data: session } = useSession();
  const position = session?.user?.position;
  return (
    <div className="space-y-6">
      <PageHeader
        title="QUY TRÌNH THAY THẾ VẬT TƯ"
        description={`Phiếu Đề xuất & Ứng vật tư · phân quyền theo cương vị${position ? ` · Bạn: ${position}` : ""}`}
      />
      <MaterialTicketBoard />
    </div>
  );
}
