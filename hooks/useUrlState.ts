"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Giá trị tab / lựa chọn của trang giữ trong tham số URL (?key=…) — tải lại trang (F5) vẫn ở đúng tab, gửi link cũng
 * mở đúng tab (17/10/2026: trước đây tab nằm trong useState nên F5 là về tab đầu).
 *
 * Đọc thẳng từ useSearchParams (không có state riêng): Next.js App Router đồng bộ useSearchParams với
 * window.history.replaceState, nên đổi tab không điều hướng / không tải lại dữ liệu / không cuộn trang.
 * Giá trị lạ hoặc không có trong `allowed` → `fallback`; chọn lại `fallback` thì xoá tham số cho URL gọn.
 */
export function useUrlState<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (next: T) => void] {
  const params = useSearchParams();
  const raw = params.get(key);
  const value = raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const setValue = useCallback(
    (next: T) => {
      const url = new URL(window.location.href);
      if (next === fallback) url.searchParams.delete(key);
      else url.searchParams.set(key, next);
      const target = `${url.pathname}${url.search}${url.hash}`;
      if (target !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        // state = null: Next.js chỉ đồng bộ useSearchParams khi state KHÔNG mang dấu nội bộ của nó (__NA) — truyền
        // window.history.state thì URL đổi mà trang không đổi tab.
        window.history.replaceState(null, "", target);
      }
    },
    [key, fallback]
  );
  return [value, setValue];
}
