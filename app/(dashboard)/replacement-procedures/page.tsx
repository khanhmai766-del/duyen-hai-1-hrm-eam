"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { FileText, Plus, UserCog } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import MaterialTicketBoard from "@/components/materials/MaterialTicketBoard";
import { useMaterialTickets } from "@/hooks/useMaterialTickets";

const PROCEDURE_FLOW_PDF_URL = "/api/files/s3?key=public%2Fmaterial-procedures%2Fluu-do-thuc-hien-vat-tu-vh1.pdf";

export default function ReplacementProceduresPage() {
  const { data: session } = useSession();
  const position = session?.user?.position;
  const { data } = useMaterialTickets();
  const canCreate = data?.viewer?.canCreate ?? false;
  const canManageWorkflow = data?.viewer?.isAdmin ?? false;
  const [creating, setCreating] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="QUY TRÌNH THAY THẾ VẬT TƯ"
        description={`Phiếu đề xuất & Ứng vật tư${position ? ` · Bạn: ${position}` : ""}`}
      >
        {canManageWorkflow && (
          <Button variant="outline" onClick={() => setRolesOpen(true)}>
            <UserCog className="h-4 w-4" /> Phân quyền quy trình
          </Button>
        )}
        <Button variant="outline" asChild>
          <a href={PROCEDURE_FLOW_PDF_URL} target="_blank" rel="noreferrer">
            <FileText className="h-4 w-4" /> Lưu đồ thực hiện
          </a>
        </Button>
        {canCreate && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Tạo đề xuất
          </Button>
        )}
      </PageHeader>
      <MaterialTicketBoard
        creating={creating}
        onCloseCreate={() => setCreating(false)}
        rolesOpen={rolesOpen}
        onOpenRoles={() => setRolesOpen(true)}
        onCloseRoles={() => setRolesOpen(false)}
      />
    </div>
  );
}
