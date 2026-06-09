"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface ExportButtonProps {
  rows: Record<string, unknown>[];
  filename?: string;
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))];
  return "﻿" + lines.join("\n");
}

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportButton({ rows, filename = "export" }: ExportButtonProps) {
  function handle(format: "csv" | "excel" | "pdf") {
    if (!rows.length) {
      toast.error("Không có dữ liệu để xuất");
      return;
    }
    if (format === "pdf") {
      // Print-to-PDF via browser dialog keeps the dependency footprint small.
      window.print();
      return;
    }
    const csv = toCSV(rows);
    const ext = format === "excel" ? "csv" : "csv";
    download(csv, `${filename}.${ext}`, "text/csv;charset=utf-8;");
    toast.success(`Đã xuất ${rows.length} dòng (${format.toUpperCase()})`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4" /> Xuất
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handle("excel")}>Excel (.csv)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handle("csv")}>CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handle("pdf")}>PDF (in)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
