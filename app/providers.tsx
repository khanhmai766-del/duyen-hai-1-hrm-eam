"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/sonner";
import { ToastMirrorProvider } from "@/components/ai/toast-mirror";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  // Báo cho lib/legacy-browser-guard.ts biết JS của app đã chạy — có cờ này thì lưới an toàn không
  // hiện thông báo "Chưa tải được ứng dụng" dù trước đó có lỗi lẻ tẻ. Khung "trình duyệt quá cũ"
  // (data-kind="old") thì giữ nguyên: máy dưới mốc hỗ trợ không nên dùng tiếp dù app chạy được phần nào.
  React.useEffect(() => {
    document.documentElement.setAttribute("data-app-ready", "");
    document.querySelector('#dh1-legacy-browser[data-kind="broken"]')?.remove();
  }, []);

  return (
    // refetchInterval: làm mới phiên mỗi 5 phút khi tab đang mở & online (giữ phiên "trượt"
    // cho người dùng đang hoạt động); không refetch khi offline để cookie kịp hết hạn sau 30 phút.
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus refetchWhenOffline={false}>
      <QueryClientProvider client={queryClient}>
        <ToastMirrorProvider>
          {children}
          <Toaster />
        </ToastMirrorProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
