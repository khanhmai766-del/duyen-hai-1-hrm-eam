"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { VcRootClassContext } from "@/components/vibration/vc-app-root";

const subscribeNothing = () => () => {};

/**
 * Hộp thoại kiểu web độ rung cũ (`.modal-backdrop > .modal`) vẽ ra `document.body`, bọc trong `.vc-app[data-theme=light]`
 * (display: contents) để dùng đúng CSS/biến màu sáng. Cần portal vì tiêu đề trang dính (z 25) và thanh "Thường dùng",
 * mascot, thanh đáy điện thoại (z 40) của khung ứng dụng nằm NGOÀI `.vc-app`, đè lên hộp nếu hộp nằm trong `.vc-app`.
 * Nhấn Esc hoặc bấm nền tối ⇒ onClose.
 */
export function VcModal({ onClose, className, children }: { onClose: () => void; className?: string; children: React.ReactNode }) {
  const mounted = React.useSyncExternalStore(subscribeNothing, () => true, () => false);
  const rootClass = React.useContext(VcRootClassContext);
  const closeRef = React.useRef(onClose);
  React.useEffect(() => { closeRef.current = onClose; });
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, []);
  if (!mounted) return null;
  return createPortal(
    <div className={`vc-app vc-portal ${rootClass}`} data-theme="light">
      <div className={`modal-backdrop open ${className ?? ""}`} role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
