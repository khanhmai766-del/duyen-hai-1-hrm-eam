"use client";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { nkvhPctUrl } from "@/lib/nkvh-pct";

async function copyNumber(number: string) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(number);
    else {
      const input = document.createElement("textarea");
      input.value = number;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      const previous = document.activeElement;
      try { input.select(); if (!document.execCommand("copy")) throw new Error(); }
      finally { input.remove(); if (previous instanceof HTMLElement) previous.focus(); }
    }
    toast.success(`Đã sao chép ${number}`, { description: "Dán vào ô tìm kiếm trên NKVH để tra phiếu." });
  } catch { toast.error("Không thể sao chép số PCT", { description: `NKVH vẫn được mở. Bạn nhập số ${number} để tìm kiếm.` }); }
}
export function NkvhPermitLink({ kind, id, number, children, className }: { kind: string; id?: string | null; number: string; children: ReactNode; className?: string }) {
  return <a className={className} href={nkvhPctUrl(kind, id)} target="_blank" rel="noopener noreferrer" onClick={() => { if (!id) void copyNumber(number); }} title={id ? `Mở đúng phiếu ${number} trên NKVH` : `Sao chép ${number} và mở danh sách NKVH`}>{children}</a>;
}
