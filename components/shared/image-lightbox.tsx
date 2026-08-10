"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Xem ảnh phóng to ngay trong trang, thay cho việc mở tab mới.
 *
 * Ảnh phục vụ qua proxy `/api/files/s3?key=…` cần phiên đăng nhập; mở tab mới vẫn
 * chạy nhưng bắt người dùng rời khỏi bảng đang xem rồi phải quay lại.
 *
 * Cố ý KHÔNG dùng components/ui/dialog: DialogContent gắn cứng nền trắng, padding và
 * một nút X nằm đè lên ảnh — với nền tối của khung xem ảnh thì nút đó gần như tàng hình.
 */
export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
  alt = "Ảnh",
}: {
  images: string[];
  /** Ảnh đang mở; null = đóng. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  alt?: string;
}) {
  const open = index !== null && index >= 0 && index < images.length;
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const many = images.length > 1;

  const go = React.useCallback(
    (step: number) => {
      if (index === null) return;
      onIndexChange((index + step + images.length) % images.length);
    },
    [images.length, index, onIndexChange]
  );

  // Esc để đóng, ←/→ để chuyển ảnh — thao tác quen thuộc của mọi trình xem ảnh.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && many) go(-1);
      else if (e.key === "ArrowRight" && many) go(1);
    };
    window.addEventListener("keydown", onKey);
    // Khoá cuộn nền để bánh xe chuột không kéo bảng phía sau khi đang xem ảnh.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [go, many, onClose, open]);

  if (!open) return null;
  const navButtonClass =
    "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} ${index + 1} trên ${images.length}`}
      // Bấm nền tối để đóng; bấm trúng ảnh thì không (stopPropagation bên dưới).
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Đóng"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X className="h-5 w-5" />
      </button>

      {many && (
        <>
          <button
            type="button"
            aria-label="Ảnh trước"
            onClick={(e) => { e.stopPropagation(); go(-1); }}
            className={cn(navButtonClass, "left-4")}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="Ảnh sau"
            onClick={(e) => { e.stopPropagation(); go(1); }}
            className={cn(navButtonClass, "right-4")}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[index]}
        alt={`${alt} ${index + 1}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
      />

      {many && (
        <div className="absolute bottom-5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
