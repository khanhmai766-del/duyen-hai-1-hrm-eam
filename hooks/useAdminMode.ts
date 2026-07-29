"use client";

import * as React from "react";
import { ADMIN_MODE_COOKIE, ADMIN_MODE_STORAGE_KEY, adminModeEnabled } from "@/lib/admin-mode";

const EVENT_NAME = "pp:admin-mode-change";

export function useAdminMode() {
  const [enabled, setEnabledState] = React.useState(true);

  React.useEffect(() => {
    const read = () => {
      const next = adminModeEnabled(localStorage.getItem(ADMIN_MODE_STORAGE_KEY));
      setEnabledState(next);
      document.cookie = `${ADMIN_MODE_COOKIE}=${next ? "on" : "off"}; Path=/; Max-Age=31536000; SameSite=Lax`;
    };
    read();
    window.addEventListener(EVENT_NAME, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT_NAME, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const setEnabled = React.useCallback((next: boolean) => {
    localStorage.setItem(ADMIN_MODE_STORAGE_KEY, next ? "on" : "off");
    document.cookie = `${ADMIN_MODE_COOKIE}=${next ? "on" : "off"}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setEnabledState(next);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  return [enabled, setEnabled] as const;
}
