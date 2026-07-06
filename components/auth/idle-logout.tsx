"use client";

import * as React from "react";
import { signOut, useSession } from "next-auth/react";

// 30 phút không thao tác HOẶC mất kết nối mạng → tự động đăng xuất.
const TIMEOUT_MS = 30 * 60 * 1000;
const CHECK_INTERVAL_MS = 20 * 1000; // tần suất kiểm tra
const ACTIVITY_THROTTLE_MS = 5 * 1000; // hạn chế ghi localStorage liên tục
const STORAGE_KEY = "pp:last-activity";
const ORG_CHART_VIEWER_KEY = "pp:org-chart-viewer-active";

/**
 * Tự động đăng xuất khi người dùng không thao tác hoặc mất sóng wifi/internet quá 30 phút,
 * buộc đăng nhập lại để vào tiếp hệ thống.
 *
 * - Trang Overview và chế độ Viewer của sơ đồ tổ chức ca vận hành được xem là đang theo dõi,
 *   không tính idle.
 * - Thao tác (chuột/bàn phím/chạm/cuộn) khi ĐANG online sẽ làm mới mốc thời gian.
 * - Mất mạng được xem là "không hoạt động" nên vẫn tính vào 30 phút; nếu tới hạn lúc đang
 *   mất mạng thì hoãn đăng xuất tới khi có mạng lại (lúc đó cookie phía server cũng đã hết hạn).
 * - Mốc thời gian lưu ở localStorage để đồng bộ giữa các tab và khi tải lại / mở lại trang.
 */
export function IdleLogout() {
  const { status } = useSession();

  React.useEffect(() => {
    if (status !== "authenticated" || typeof window === "undefined") return;

    const now = () => Date.now();
    const readLast = () => {
      const v = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(v) && v > 0 ? v : 0;
    };
    const writeLast = (t: number) => {
      try {
        localStorage.setItem(STORAGE_KEY, String(t));
      } catch {
        /* localStorage không khả dụng */
      }
    };
    const isOrgChartViewerActive = () => {
      try {
        return window.location.pathname.startsWith("/hr/org-chart") && sessionStorage.getItem(ORG_CHART_VIEWER_KEY) === "1";
      } catch {
        return false;
      }
    };
    const isOverviewActive = () => window.location.pathname === "/";
    const isKeepAlivePage = () => isOverviewActive() || isOrgChartViewerActive();

    let signedOut = false;
    let lastWrite = 0;

    async function doLogout() {
      if (signedOut) return;
      // Đang mất mạng: hoãn lại, sự kiện "online" sẽ kích hoạt kiểm tra & đăng xuất sau.
      if (!navigator.onLine) return;
      signedOut = true;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* bỏ qua */
      }
      try {
        await fetch("/api/auth/logout-audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "timeout" }),
        }).catch(() => null);
        const result = await signOut({ callbackUrl: "/login?reason=timeout", redirect: false });
        window.location.assign(result?.url ?? "/login?reason=timeout");
      } catch {
        window.location.assign("/login?reason=timeout");
      }
    }

    function markActivity() {
      if (!navigator.onLine) return; // mất mạng không tính là hoạt động
      const t = now();
      if (t - lastWrite < ACTIVITY_THROTTLE_MS) return;
      lastWrite = t;
      writeLast(t);
    }

    function check() {
      if (isKeepAlivePage()) {
        writeLast(now());
        return;
      }
      const last = readLast();
      if (last && now() - last >= TIMEOUT_MS) doLogout();
    }

    // Khi vào trang: nếu mốc cũ đã quá hạn (vd mở lại sau >30 phút) thì đăng xuất ngay;
    // ngược lại đặt lại mốc về thời điểm hiện tại.
    const initial = readLast();
    if (!isKeepAlivePage() && initial && now() - initial >= TIMEOUT_MS) {
      doLogout();
    } else {
      writeLast(now());
    }

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
      "wheel",
    ];
    events.forEach((e) => window.addEventListener(e, markActivity, { passive: true }));

    const onWake = () => check();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);

    const intervalId = window.setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      events.forEach((e) => window.removeEventListener(e, markActivity));
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      window.clearInterval(intervalId);
    };
  }, [status]);

  return null;
}
