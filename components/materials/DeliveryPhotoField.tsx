"use client";

import { useRef, useState } from "react";
import { Camera, Info, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { downscaleImage } from "@/lib/image-downscale";

/**
 * Ô ảnh PHIẾU XUẤT KHO (LIÊN 3) của bước xác nhận vật tư lãnh.
 *
 * KHÁC ảnh hiện trường ở chỗ KHÔNG gửi ngay khi chọn: ảnh này thuộc về LÔ vật tư, mà lô chỉ
 * ra đời khi bấm xác nhận. Nên ảnh nằm trong state, đi kèm chính lần gọi đó — xem
 * lib/material-delivery-photo.ts.
 *
 * Luồng "Sử dụng hiện có" không dùng ô này: nó rút hàng từ lô cũ và in lại đúng ảnh của lô ấy.
 */
export function DeliveryPhotoField({
  value,
  existingUrl,
  disabled,
  onChange,
}: {
  /** Ảnh mới chọn, dạng data URL; null = chưa chọn gì trong lần này. */
  value: string | null;
  /** Ảnh đã đính kèm trước đó (khi xem lại bước), để biết có cần chụp lại không. */
  existingUrl?: string | null;
  disabled?: boolean;
  onChange: (dataUrl: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const preview = value ?? existingUrl ?? null;

  async function pick(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Vui lòng chọn tệp ảnh");
    if (file.size > 12 * 1024 * 1024) return toast.error("Ảnh tối đa 12MB");
    setBusy(true);
    try {
      onChange(await downscaleImage(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không đọc được ảnh");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <b style={{ fontSize: 13 }}>Ảnh phiếu xuất kho (liên 3) *</b>
        {preview && (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "#0f766e" }}>
            {value ? "Ảnh mới sẽ lưu khi xác nhận" : "Đã có ảnh"}
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex", gap: 7, alignItems: "flex-start", background: "#f0f9ff", border: "1px solid #bae6fd",
          borderRadius: 8, padding: "7px 9px", fontSize: 12, color: "#075985",
        }}
      >
        <Info size={13} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          Ảnh này đi theo <b>số phiếu giao hàng</b>, không đi theo phiếu vật tư. Phần lãnh về chưa
          dùng hết vẫn giữ lại ảnh để lần sử dụng sau in kèm <b>Biên bản vật tư thu hồi</b>.
        </span>
      </div>

      {preview ? (
        <div style={{ position: "relative", width: "fit-content" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Phiếu xuất kho liên 3"
            style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, border: "1px solid #e2e8f0", display: "block" }}
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => { onChange(null); inputRef.current?.click(); }}
              style={{
                position: "absolute", top: -7, right: -7, width: 24, height: 24, borderRadius: 999,
                border: "2px solid #fff", background: "#0f172a", color: "#fff", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              aria-label="Chụp lại ảnh phiếu xuất kho"
            >
              <X size={12} />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          style={{
            height: 104, borderRadius: 8, border: "1px dashed #cbd5e1", background: "#f8fafc",
            color: "#64748b", fontSize: 12.5, cursor: disabled ? "not-allowed" : "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          {busy ? <Loader2 className="spin" size={17} /> : <Camera size={18} />}
          {busy ? "Đang xử lý ảnh…" : "Chụp / tải ảnh phiếu xuất kho liên 3"}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void pick(file);
        }}
      />
    </div>
  );
}
