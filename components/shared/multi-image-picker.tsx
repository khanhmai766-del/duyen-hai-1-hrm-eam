"use client";

import * as React from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Chọn nhiều ảnh (tối đa `max`, mặc định 3). Mỗi ảnh tải từ máy được thu nhỏ về
 * base64 (canvas) để payload nhỏ gọn — cùng cách nén với ImagePicker/AvatarPicker.
 */
export function MultiImagePicker({
  value,
  onChange,
  max = 3,
  maxWidth = 1280,
  maxFileSizeMb = 8,
  allowUrl = false,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  max?: number;
  maxWidth?: number;
  maxFileSizeMb?: number;
  /** Hiện thêm ô dán URL (vd link Google Photos) ngoài tải file. */
  allowUrl?: boolean;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [url, setUrl] = React.useState("");
  const full = value.length >= max;

  function addUrl() {
    const u = url.trim();
    if (!u) return;
    if (full) return toast.error(`Tối đa ${max} ảnh`);
    onChange([...value, u]);
    setUrl("");
  }

  function downscale(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(reader.result as string);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
        img.onerror = () => resolve(reader.result as string);
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const slots = max - value.length;
    if (slots <= 0) return toast.error(`Tối đa ${max} ảnh`);
    const accepted = files.slice(0, slots);
    if (files.length > slots) toast.error(`Chỉ thêm được ${slots} ảnh (tối đa ${max})`);
    const next: string[] = [];
    for (const f of accepted) {
      if (!f.type.startsWith("image/")) { toast.error("Vui lòng chọn tệp ảnh"); continue; }
      if (f.size > maxFileSizeMb * 1024 * 1024) {
        toast.error(`Ảnh tối đa ${maxFileSizeMb}MB`);
        continue;
      }
      next.push(await downscale(f));
    }
    if (next.length) onChange([...value, ...next]);
  }

  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((src, i) => (
          <div key={i} className="relative h-20 w-20 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Ảnh ${i + 1}`} className="h-full w-full rounded-md border border-border object-cover" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white shadow ring-2 ring-white hover:bg-ink/80"
              aria-label="Xoá ảnh"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {!full && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input bg-muted/40 text-muted-foreground transition-colors hover:border-accent hover:text-accent"
          >
            <ImagePlus className="h-5 w-5" />
            <span className="text-[11px] font-medium">{value.length}/{max}</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />
      </div>
      {allowUrl && !full && (
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
            placeholder="hoặc dán link ảnh / Google Photos: https://…"
            className="h-9 flex-1 rounded-md border border-input bg-white px-3 text-sm"
          />
          <button type="button" onClick={addUrl} className="rounded-md border border-input px-3 text-sm font-medium hover:border-accent hover:text-accent">
            Thêm
          </button>
        </div>
      )}
    </div>
  );
}
