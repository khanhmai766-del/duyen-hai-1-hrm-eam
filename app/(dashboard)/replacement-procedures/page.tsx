"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Boxes, ClipboardList, ExternalLink, FileSpreadsheet, FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import MaterialTicketBoard from "@/components/materials/MaterialTicketBoard";
import OtherMaterialStockBoard from "@/components/materials/OtherMaterialStockBoard";
import { useMaterialTickets } from "@/hooks/useMaterialTickets";
import { MATERIAL_TRACKING_SHEET_URL } from "@/lib/links";

const PROCEDURE_FLOW_PDF_URL = "/api/material-procedure-flow";

export default function ReplacementProceduresPage() {
  const { data: session } = useSession();
  const { data } = useMaterialTickets();
  const position = data?.viewer?.position ?? session?.user?.currentPosition ?? session?.user?.position;
  const canCreate = data?.viewer?.canCreate ?? false;
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<"TICKETS" | "OTHER_STOCK">("TICKETS");

  return (
    <div className="space-y-4">
      <PageHeader
        title="QUY TRÌNH THAY THẾ VẬT TƯ"
        description={`Phiếu đề xuất & Ứng vật tư${position ? ` · Bạn: ${position}` : ""}`}
      >
        {/* Chuyển vùng dữ liệu đứng ngay cạnh tiêu đề: nó là "đang xem cái gì", không phải thao tác. */}
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            onClick={() => setView("TICKETS")}
            className={`inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition ${view === "TICKETS" ? "bg-slate-900 text-white shadow" : "text-slate-600 hover:bg-slate-50"}`}
          >
            <ClipboardList className="h-4 w-4" />Phiếu đề xuất
          </button>
          <button
            onClick={() => setView("OTHER_STOCK")}
            className={`inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition ${view === "OTHER_STOCK" ? "bg-slate-900 text-white shadow" : "text-slate-600 hover:bg-slate-50"}`}
          >
            <Boxes className="h-4 w-4" />Kho Vật tư khác
          </button>
        </div>
        <Button variant="soft" size="toolbar" className="w-10 px-0" asChild>
          <a
            href={PROCEDURE_FLOW_PDF_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Mở lưu đồ thực hiện"
            title="Mở lưu đồ thực hiện"
          >
            <FileText className="h-4 w-4" />
          </a>
        </Button>
        <Button variant="soft" size="toolbar" asChild>
          <a href={MATERIAL_TRACKING_SHEET_URL} target="_blank" rel="noopener noreferrer">
            <FileSpreadsheet className="h-4 w-4" /> Mở sheet vật tư
            <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
          </a>
        </Button>
        {canCreate && view === "TICKETS" && (
          <Button size="toolbar" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Tạo đề xuất
          </Button>
        )}
      </PageHeader>
      {view === "TICKETS" ? <MaterialTicketBoard
          creating={creating}
          onCloseCreate={() => setCreating(false)}
        /> : <OtherMaterialStockBoard />}
    </div>
  );
}
