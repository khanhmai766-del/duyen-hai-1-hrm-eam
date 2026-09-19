"use client";

import * as React from "react";
import { useSonner, type ToastT } from "sonner";

/**
 * BẢN SAO DANH SÁCH THÔNG BÁO TOAST, giữ ở tầng gốc (app/providers.tsx) để mascot trợ lý đọc lại.
 *
 * `useSonner()` chỉ nghe được thông báo phát ra SAU khi nó được gắn. Mascot lại chỉ gắn sau khi tải
 * xong quyền ở trang chính, nên thông báo phát trước đó — điển hình "Đăng nhập thành công" phát ngay
 * trên trang đăng nhập rồi mới chuyển trang — bị bỏ lỡ. Đặt bộ nghe ở gốc, có mặt từ trang đầu tiên,
 * thì không thông báo nào lọt.
 */
const ToastMirrorContext = React.createContext<ToastT[]>([]);

export function ToastMirrorProvider({ children }: { children: React.ReactNode }) {
  const { toasts } = useSonner();
  return <ToastMirrorContext.Provider value={toasts}>{children}</ToastMirrorContext.Provider>;
}

/** Thông báo đang hiện, mới nhất đứng đầu. */
export function useMirroredToasts() {
  return React.useContext(ToastMirrorContext);
}
