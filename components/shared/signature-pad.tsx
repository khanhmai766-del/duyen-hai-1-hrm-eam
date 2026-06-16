"use client";

import * as React from "react";
import { Upload, Eraser, PenLine, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Bộ chọn chữ ký số: người dùng có thể ký trực tiếp trên canvas hoặc tải lên
 * một ảnh chữ ký / dán URL. Kết quả luôn là PNG nền trong suốt (data URL) hoặc
 * URL ảnh ngoài, lưu giống `avatarUrl`.
 */
export function SignaturePad({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Tabs defaultValue="draw" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="draw">
          <PenLine className="mr-1.5 h-4 w-4" /> Ký trực tiếp
        </TabsTrigger>
        <TabsTrigger value="upload">
          <ImageIcon className="mr-1.5 h-4 w-4" /> Tải ảnh / URL
        </TabsTrigger>
      </TabsList>

      <TabsContent value="draw">
        <DrawCanvas value={value} onChange={onChange} />
      </TabsContent>

      <TabsContent value="upload">
        <UploadSignature value={value} onChange={onChange} />
      </TabsContent>
    </Tabs>
  );
}

/* ------------------------------------------------------------------ Draw -- */

function DrawCanvas({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | null>(null);
  const dirty = React.useRef(false); // đã vẽ nét nào chưa (kể từ lần xoá gần nhất)

  // Khởi tạo canvas theo devicePixelRatio cho nét sắc nét.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a"; // ink
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    dirty.current = true;
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (dirty.current) commit();
  }

  // Cắt theo vùng bao của nét vẽ rồi xuất PNG nền trong suốt.
  function commit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    const { data } = ctx.getImageData(0, 0, width, height);
    let minX = width, minY = height, maxX = 0, maxY = 0, found = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] !== 0) {
          found = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) {
      onChange("");
      return;
    }
    const pad = 8;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width, maxX + pad);
    maxY = Math.min(height, maxY + pad);
    const w = maxX - minX;
    const h = maxY - minY;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    out.getContext("2d")?.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
    onChange(out.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
    onChange("");
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-lg border border-border bg-white">
        <canvas
          ref={canvasRef}
          className="h-40 w-full touch-none rounded-lg"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        {/* đường kẻ chân chữ ký + gợi ý */}
        <div className="pointer-events-none absolute inset-x-6 bottom-7 border-b border-dashed border-border" />
        <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
          Ký vào vùng này
        </span>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Dùng chuột hoặc cảm ứng để ký.</p>
        <Button type="button" variant="ghost" size="sm" onClick={clear}>
          <Eraser className="h-4 w-4" /> Xoá / ký lại
        </Button>
      </div>
      {value && <SignaturePreview value={value} />}
    </div>
  );
}

/* ---------------------------------------------------------------- Upload -- */

function UploadSignature({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
        // Thu nhỏ chiều rộng tối đa 600px để giữ kích thước lưu nhỏ; nền trong suốt giữ nguyên.
        const MAX_W = 600;
        const scale = Math.min(1, MAX_W / img.width);
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
        onChange(canvas.toDataURL("image/png"));
      };
      img.onerror = () => onChange(reader.result as string);
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> Tải ảnh chữ ký
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            Xoá chữ ký
          </Button>
        )}
      </div>
      <Input
        value={value.startsWith("data:") ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="hoặc dán URL ảnh: https://..."
      />
      {value && <SignaturePreview value={value} />}
    </div>
  );
}

/* --------------------------------------------------------------- Preview -- */

function SignaturePreview({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
      <span className="text-xs text-muted-foreground">Xem trước:</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={value}
        alt="Chữ ký"
        className="max-h-16 max-w-[240px] rounded bg-white object-contain px-1"
      />
    </div>
  );
}
