"use client";

import { useState } from "react";
import type { PermitPerson } from "@/lib/work-permits";
import { cn } from "@/lib/utils";

/** Khung ảnh thẻ cố định, tải khi gần khung nhìn; lỗi/thiếu ảnh dùng chữ đầu tên. */
export function PersonPhoto({ person, className }: { person: Pick<PermitPerson, "name" | "photoUrl">; className: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initial = person.name.trim().split(/\s+/).pop()?.[0]?.toUpperCase() ?? "?";
  if (!person.photoUrl || failedUrl === person.photoUrl) return <span aria-hidden className={cn(className, "flex items-center justify-center bg-slate-100 font-semibold text-slate-400")}>{initial}</span>;
  // eslint-disable-next-line @next/next/no-img-element -- proxy S3 cần đăng nhập, URL có phiên bản để cache ảnh
  return <img src={person.photoUrl} alt={`Ảnh ${person.name}`} width={36} height={48} loading="lazy" decoding="async" className={cn(className, "object-cover")} onError={() => setFailedUrl(person.photoUrl ?? null)} />;
}
