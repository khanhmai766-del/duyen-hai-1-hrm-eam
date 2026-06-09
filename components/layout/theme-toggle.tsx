"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Light/dark toggle. The initial `dark` class is set pre-hydration by the
 * no-FOUC script in the root layout; this button just flips it and persists the
 * choice to localStorage. We avoid rendering theme-specific UI until mounted to
 * keep the server/client markup identical (no hydration mismatch).
 */
export function ThemeToggle() {
  const [dark, setDark] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const el = document.documentElement;
    const next = !el.classList.contains("dark");
    el.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
    setDark(next);
  }

  return (
    <button
      onClick={toggle}
      className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-lg shadow-slate-900/30 ring-1 ring-white/40 transition-transform duration-200 before:absolute before:inset-x-1 before:top-0.5 before:h-1/3 before:rounded-t-lg before:bg-white/25 hover:scale-105 active:scale-95 dark:from-amber-300 dark:to-orange-500 dark:shadow-amber-500/30"
      aria-label={dark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
      title={mounted ? (dark ? "Chế độ sáng" : "Chế độ tối") : "Đổi giao diện"}
    >
      {mounted && dark ? (
        <Sun className="relative h-[18px] w-[18px] drop-shadow-sm" />
      ) : (
        <Moon className="relative h-[18px] w-[18px] drop-shadow-sm" />
      )}
    </button>
  );
}
