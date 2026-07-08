"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import MaterialTicketBoard from "@/components/materials/MaterialTicketBoard";
import { useMaterialTickets } from "@/hooks/useMaterialTickets";

export default function ReplacementProceduresPage() {
  const { data: session } = useSession();
  const position = session?.user?.position;
  const { data } = useMaterialTickets();
  const canCreate = data?.viewer?.canCreate ?? false;
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="QUY TRÌNH THAY THẾ VẬT TƯ"
        description={`Phiếu Đề xuất & Ứng vật tư · mọi cương vị xem được, thao tác theo phân quyền${position ? ` · Bạn: ${position}` : ""}`}
      >
        {canCreate && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Tạo phiếu thay thế vật tư
          </Button>
        )}
      </PageHeader>
      <MaterialTicketBoard creating={creating} onCloseCreate={() => setCreating(false)} />
    </div>
  );
}
