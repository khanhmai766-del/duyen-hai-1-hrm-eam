"use client";

import { useRef, useState } from "react";
import { Camera, Info, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useSetTicketUsagePhoto, useTicketUsagePhotos, type TicketUsagePhoto } from "@/hooks/useMaterialTickets";
import { MIN_USAGE_PHOTOS } from "@/lib/constants";
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
  busy,
}: {
  photo: TicketUsagePhoto;
  disabled: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt={photo.hint}
            style={{ width: "100%", height: 116, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }}
          />
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

  const rows = photos.data ?? [];
  const filled = rows.filter((row) => row.url).length;
  const enough = filled >= MIN_USAGE_PHOTOS;

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <b style={{ fontSize: 13 }}>Hình ảnh quá trình công tác</b>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: enough ? "#0f766e" : "#b45309" }}>
          {filled}/3 ảnh{enough ? "" : ` · cần tối thiểu ${MIN_USAGE_PHOTOS}`}
        </span>
      </div>

      <div
        style={{
          display: "flex", gap: 7, alignItems: "flex-start", background: "#f0f9ff", border: "1px solid #bae6fd",
          borderRadius: 8, padding: "7px 9px", fontSize: 12, color: "#075985", marginBottom: 10,
        }}
      >
        <Info size={13} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          Ba ảnh này được chèn thẳng vào bảng <b>Hình ảnh quá trình công tác</b> của biên bản
          BBNT D-Office, đúng thứ tự dưới đây. Bắt buộc tối thiểu <b>{MIN_USAGE_PHOTOS} trên 3 ảnh</b>.
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
