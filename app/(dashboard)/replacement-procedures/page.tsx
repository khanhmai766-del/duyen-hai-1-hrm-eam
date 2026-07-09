"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { FileText, Plus, Search, UserCog } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import MaterialTicketBoard from "@/components/materials/MaterialTicketBoard";
import { useMaterialTickets } from "@/hooks/useMaterialTickets";

const PROCEDURE_FLOW_PDF_URL = "/api/material-procedure-flow";

export default function ReplacementProceduresPage() {
  const { data: session } = useSession();
  const position = session?.user?.position;
  const { data } = useMaterialTickets();
  const canCreate = data?.viewer?.canCreate ?? false;
  const canManageWorkflow = data?.viewer?.isAdmin ?? false;
  const [creating, setCreating] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [ticketSearch, setTicketSearch] = useState("");

  return (
    <div className="space-y-6">
      <PageHeader
        title="QUY TRÌNH THAY THẾ VẬT TƯ"
        description={`Phiếu đề xuất & Ứng vật tư${position ? ` · Bạn: ${position}` : ""}`}
      >
        <label className="flex h-10 w-full min-w-[260px] max-w-[320px] items-center rounded-md border border-input bg-white px-3 text-muted-foreground shadow-sm shadow-slate-900/5 sm:w-[300px]">
          <Search className="h-4 w-4 shrink-0" />
          <input
            value={ticketSearch}
            onChange={(event) => setTicketSearch(event.target.value)}
            placeholder="Tìm phiếu đề xuất, tên vật tư..."
            aria-label="Tìm phiếu đề xuất hoặc tên vật tư"
            className="ml-2 min-w-0 flex-1 bg-transparent text-sm font-medium text-ink outline-none placeholder:text-muted-foreground/70"
          />
        </label>
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
        searchQ={ticketSearch}
        onCloseCreate={() => setCreating(false)}
        rolesOpen={rolesOpen}
        onOpenRoles={() => setRolesOpen(true)}
        onCloseRoles={() => setRolesOpen(false)}
      />
    </div>
  );
}
