"use client";

import * as React from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Rectangular image input that accepts either a local file (stored inline as a
 * base64 data URL, downscaled to keep the payload small) or a pasted image URL.
 * Dùng cho ảnh minh hoạ (thiết bị, khiếm khuyết…) — khác AvatarPicker (ảnh tròn).
 */
export function ImagePicker({
  value,
  onChange,
  maxWidth = 1280,
}: {
  value: string;
  onChange: (v: string) => void;
  maxWidth?: number;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn tệp ảnh");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Ảnh tối đa 8MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Giữ nguyên tỉ lệ, thu nhỏ chiều rộng tối đa để base64 không quá lớn.
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          onChange(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        onChange(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => onChange(reader.result as string);
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Ảnh khiếm khuyết"
            className="max-h-40 rounded-md border border-border object-contain"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white shadow ring-2 ring-white hover:bg-ink/80"
            aria-label="Xoá ảnh"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-input bg-muted/40 text-muted-foreground transition-colors hover:border-accent hover:text-accent"
        >
          <ImagePlus className="h-6 w-6" />
          <span className="text-sm font-medium">Tải ảnh từ máy</span>
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <Input
        value={value.startsWith("data:") ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="hoặc dán URL ảnh: https://..."
      />
    </div>
  );
}
