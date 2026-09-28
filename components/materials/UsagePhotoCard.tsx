"use client";

import { useRef, useState } from "react";
import { Camera, Info, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useSetTicketUsagePhoto, useTicketUsagePhotos, type TicketUsagePhoto } from "@/hooks/useMaterialTickets";
import { downscaleImage } from "@/lib/image-downscale";

/**
 * Ba ô ảnh hiện trường của bước "Xác nhận sử dụng vật tư".
 *
 * Ba ô CỐ ĐỊNH chứ không phải danh sách tải nhiều ảnh: mỗi ô rơi vào đúng một ô
 * trong bảng "Hình ảnh quá trình công tác" của BBNT D-Office, nên thứ tự là ràng
 * buộc chứ không phải sở thích trình bày.
 *
 * Ảnh gửi lên ngay khi chọn — xem `useSetTicketUsagePhoto` để biết vì sao không gom
 * vào lúc bấm Xác nhận.
 */

function PhotoSlot({
  photo,
  disabled,
  onPick,
  onClear,
  onPreview,
  busy,
}: {
  photo: TicketUsagePhoto;
  disabled: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
  onPreview: () => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{photo.title}</div>
      {/* Chú thích Hình 3 dài hơn hai ô kia — chừa sẵn ba dòng để ba nút tải ảnh
          vẫn thẳng hàng thay vì so le nhau. */}
      <div style={{ fontSize: 11.5, color: "#64748b", minHeight: 44, lineHeight: 1.3 }}>{photo.hint}</div>

      {photo.url ? (
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={onPreview}
            aria-label={`Xem lớn ${photo.title}`}
            style={{ display: "block", width: "100%", padding: 0, border: 0, background: "transparent", cursor: "zoom-in" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.hint}
              style={{ display: "block", width: "100%", height: 116, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }}
            />
          </button>
          {!disabled && (
            <button
              type="button"
              onClick={onClear}
              disabled={busy}
              aria-label={`Gỡ ${photo.title}`}
              style={{
                position: "absolute", top: -7, right: -7, width: 22, height: 22, borderRadius: 999,
                border: "2px solid #fff", background: "#0f172a", color: "#fff", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={11} />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          style={{
            height: 116, borderRadius: 8, border: "1px dashed #cbd5e1", background: "#f8fafc",
            color: "#64748b", fontSize: 12, cursor: disabled ? "not-allowed" : "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          {busy ? <Loader2 className="spin" size={16} /> : <Camera size={17} />}
          {busy ? "Đang tải lên…" : `Tải ${photo.title.toLowerCase()}`}
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
          if (file) onPick(file);
        }}
      />
    </div>
  );
}

export function UsagePhotoCard({ ticketId, canEdit }: { ticketId: string; canEdit: boolean }) {
  const photos = useTicketUsagePhotos(ticketId, true);
  const setPhoto = useSetTicketUsagePhoto(ticketId);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<TicketUsagePhoto | null>(null);

  const rows = photos.data ?? [];
  // Số ô do máy chủ quyết theo loại vật tư: bi nghiền 2 (DCS MILL OVERVIEW), còn lại 3.
  const total = rows.length || 3;

  async function pick(slot: string, file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Vui lòng chọn tệp ảnh");
    if (file.size > 12 * 1024 * 1024) return toast.error("Ảnh tối đa 12MB");
    setBusySlot(slot);
    try {
      const dataUrl = await downscaleImage(file);
      await setPhoto.mutateAsync({ slot, dataUrl });
      toast.success("Đã tải ảnh lên");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tải ảnh thất bại");
    } finally {
      setBusySlot(null);
    }
  }

  async function clear(slot: string) {
    setBusySlot(slot);
    try {
      await setPhoto.mutateAsync({ slot, dataUrl: null });
      toast.success("Đã gỡ ảnh");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gỡ ảnh thất bại");
    } finally {
      setBusySlot(null);
    }
  }

  return (
    <div
      style={{
        marginTop: 10, border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px 12px", background: "#fff",
      }}
    >
      {/* Không còn huy hiệu đếm "n/3 ảnh": nay bắt buộc đủ ba, mà ba ô ảnh ngay bên dưới
          đã cho thấy ô nào trống — con số ở đây chỉ lặp lại điều mắt đã thấy. */}
      <div style={{ marginBottom: 8 }}>
        <b style={{ fontSize: 13 }}>Hình ảnh quá trình công tác</b>
      </div>

      <div
        style={{
          display: "flex", gap: 7, alignItems: "flex-start", background: "#f0f9ff", border: "1px solid #bae6fd",
          borderRadius: 8, padding: "7px 9px", fontSize: 12, color: "#075985", marginBottom: 10,
        }}
      >
        <Info size={13} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          {total === 2 ? "Hai" : "Ba"} ảnh này được chèn thẳng vào bảng <b>Hình ảnh quá trình công tác</b> của biên bản
          BBNT D-Office, đúng thứ tự dưới đây. Bắt buộc <b>chụp đủ cả {total} ảnh</b> mới xác nhận được.
        </span>
      </div>

      {photos.isLoading ? (
        <p style={{ fontSize: 12.5, color: "#64748b" }}>Đang tải ảnh…</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          {rows.map((photo) => (
            <PhotoSlot
              key={photo.slot}
              photo={photo}
              disabled={!canEdit}
              busy={busySlot === photo.slot}
              onPick={(file) => void pick(photo.slot, file)}
              onClear={() => void clear(photo.slot)}
              onPreview={() => setPreviewPhoto(photo)}
            />
          ))}
        </div>
      )}

      {previewPhoto?.url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Xem lớn ${previewPhoto.title}`}
          onClick={() => setPreviewPhoto(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000, padding: 16, background: "rgba(15, 23, 42, 0.88)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div onClick={(event) => event.stopPropagation()} style={{ position: "relative", maxWidth: 1100, width: "100%" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewPhoto.url}
              alt={previewPhoto.hint}
              style={{ display: "block", width: "100%", maxHeight: "calc(100vh - 80px)", objectFit: "contain", borderRadius: 10 }}
            />
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              aria-label="Đóng ảnh xem lớn"
              style={{
                position: "absolute", top: -12, right: -8, width: 34, height: 34, borderRadius: 999,
                border: "2px solid #fff", background: "#0f172a", color: "#fff", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={18} />
            </button>
            <div style={{ marginTop: 8, color: "#fff", textAlign: "center", fontSize: 13, fontWeight: 700 }}>
              {previewPhoto.title} — {previewPhoto.hint}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
