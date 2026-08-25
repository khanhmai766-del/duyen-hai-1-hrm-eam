"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Boxes, ChevronDown, ClipboardList, ExternalLink, FileSpreadsheet, FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
            <ClipboardList className="h-4 w-4" />Đề xuất
          </button>
          <button
            onClick={() => setView("OTHER_STOCK")}
            className={`inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition ${view === "OTHER_STOCK" ? "bg-slate-900 text-white shadow" : "text-slate-600 hover:bg-slate-50"}`}
          >
            <Boxes className="h-4 w-4" />Vật tư khác
          </button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="soft" size="toolbar" className="group gap-2">
              <FileText className="h-4 w-4 text-sky-700" />
              Tài liệu vật tư
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={7} className="w-60 rounded-xl p-1.5 shadow-xl">
            <DropdownMenuItem asChild className="cursor-pointer rounded-lg px-2.5 py-2.5">
              <a href={PROCEDURE_FLOW_PDF_URL} target="_blank" rel="noreferrer">
                <FileText className="h-4 w-4 text-sky-700" />
                <span className="flex-1 font-semibold">Mở lưu đồ thực hiện</span>
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer rounded-lg px-2.5 py-2.5">
              <a href={MATERIAL_TRACKING_SHEET_URL} target="_blank" rel="noopener noreferrer">
                <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                <span className="flex-1 font-semibold">Mở sheet vật tư</span>
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
