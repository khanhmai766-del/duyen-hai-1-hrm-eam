"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/sonner";

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

  return (
    // refetchInterval: làm mới phiên mỗi 5 phút khi tab đang mở & online (giữ phiên "trượt"
    // cho người dùng đang hoạt động); không refetch khi offline để cookie kịp hết hạn sau 30 phút.
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus refetchWhenOffline={false}>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </SessionProvider>
  );
}
