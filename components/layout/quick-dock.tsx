"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { GripVertical, Minus, RotateCcw, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { hrefActive, useNavAccess } from "@/components/layout/use-nav-access";

/**
 * Thanh nổi "Thường dùng" (11/10/2026) — thay nhóm "Thường dùng" ở thanh bên máy tính: 5 mục hay mở, bấm để chuyển trang,
 * KÉO bằng tay nắm tới bất kỳ chỗ nào trên màn hình, thu gọn thành nút tròn. Vị trí + thu gọn nhớ riêng trên trình duyệt
 * này (localStorage — chỉ là tiện ích cá nhân, mất cũng không sao). Chỉ hiện trên máy tính; điện thoại có thanh đáy.
 */
const STORE_KEY = "dh1:quick-dock";
const EDGE = 8;
/** Tên ngắn trên thanh nổi (tên đầy đủ hiện khi rê chuột). */
const SHORT_LABELS: Record<string, string> = { "/work-permits": "Sổ PCT" };
// Mặc định: giữa đáy VÙNG NỘI DUNG (lệch nửa bề rộng thanh bên 280px), không đè chân thanh bên.

type Saved = { x: number | null; y: number | null; collapsed: boolean };

function readSaved(): Saved {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Partial<Saved> | null;
    return { x: typeof value?.x === "number" ? value.x : null, y: typeof value?.y === "number" ? value.y : null, collapsed: value?.collapsed === true };
  } catch {
    return { x: null, y: null, collapsed: false };
  }
}
function writeSaved(value: Saved) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(value)); } catch { /* chế độ ẩn danh / chặn lưu trữ: bỏ qua */ }
}
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

const subscribeNothing = () => () => {};

export function QuickDock() {
  // Chỉ dựng sau khi vào trình duyệt: vị trí đọc từ localStorage, server không biết → tránh lệch hydrate.
  const mounted = React.useSyncExternalStore(subscribeNothing, () => true, () => false);
  return mounted ? <QuickDockBar /> : null;
}

function QuickDockBar() {
  const { quickItems, tintOf } = useNavAccess();
  const pathname = usePathname();
  const search = useSearchParams();
  const [saved, setSaved] = React.useState<Saved>(readSaved);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ dx: number; dy: number; id: number; x: number; y: number } | null>(null);

  const update = (next: Saved) => { setSaved(next); writeSaved(next); };
  const placed = saved.x !== null && saved.y !== null;

  // Cửa sổ thu nhỏ: kéo thanh về trong màn hình (không ghi lại — mở rộng cửa sổ thì về chỗ cũ).
  const [viewport, setViewport] = React.useState({ w: window.innerWidth, h: window.innerHeight });
  React.useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // Kích thước thanh (đổi khi thu gọn / mở rộng) — đo bằng ResizeObserver, không đọc ref lúc render.
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const hasItems = quickItems.length > 0;
  React.useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() => setSize({ w: box.offsetWidth, h: box.offsetHeight }));
    observer.observe(box);
    return () => observer.disconnect();
  }, [hasItems]);
  const position = placed
    ? { left: clamp(saved.x!, EDGE, viewport.w - size.w - EDGE), top: clamp(saved.y!, EDGE, viewport.h - size.h - EDGE) }
    : null;

  function onPointerDown(event: React.PointerEvent) {
    const box = boxRef.current;
    if (!box || event.button !== 0) return;
    const rect = box.getBoundingClientRect();
    drag.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, id: event.pointerId, x: rect.left, y: rect.top };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function onPointerMove(event: React.PointerEvent) {
    const state = drag.current;
    const box = boxRef.current;
    if (!state || state.id !== event.pointerId || !box) return;
    const x = clamp(event.clientX - state.dx, EDGE, window.innerWidth - box.offsetWidth - EDGE);
    const y = clamp(event.clientY - state.dy, EDGE, window.innerHeight - box.offsetHeight - EDGE);
    state.x = x; state.y = y;
    setSaved((current) => ({ ...current, x, y }));
  }
  function onPointerUp(event: React.PointerEvent) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    writeSaved({ ...saved, x: state.x, y: state.y });
  }

  if (!quickItems.length) return null;
  const handle = (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="flex h-10 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
      aria-label="Kéo để di chuyển thanh Thường dùng"
      title="Kéo để di chuyển"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return (
    <div
      ref={boxRef}
      role="toolbar"
      aria-label="Thường dùng"
      style={position ?? { left: "calc(50% + 140px)", bottom: 20, transform: "translateX(-50%)" }}
      className="fixed z-40 hidden items-center gap-1 rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.45)] backdrop-blur lg:flex"
    >
      {handle}
      {saved.collapsed ? (
        <button type="button" onClick={() => update({ ...saved, collapsed: false })}
          className="flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-100"
          title="Mở thanh Thường dùng" aria-label="Mở thanh Thường dùng">
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />Thường dùng
        </button>
      ) : (
        <>
          {quickItems.map((item) => {
            const Icon = item.icon;
            const active = hrefActive(pathname, search, item.href, item.exact);
            const tint = tintOf(item.href);
            return (
              <Link key={item.href} href={item.href} prefetch={false} title={item.label} aria-current={active ? "page" : undefined}
                className={cn("group flex h-10 items-center gap-2 rounded-xl px-2 pr-3 text-[13px] font-semibold leading-tight transition-colors",
                  active ? "bg-blue-50 text-navy ring-1 ring-blue-200"
                    : "text-slate-600 hover:bg-slate-100 hover:text-navy")}>
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1",
                  active ? "bg-gradient-to-br from-blue-500 to-blue-800 text-white ring-blue-700/20" : cn(tint ?? "bg-white text-slate-500", "ring-black/5"))}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="whitespace-nowrap">{SHORT_LABELS[item.href.split("?")[0]] ?? item.label}</span>
              </Link>
            );
          })}
          <span className="mx-0.5 h-6 w-px shrink-0 bg-slate-200" aria-hidden="true" />
          {placed && (
            <button type="button" onClick={() => update({ ...saved, x: null, y: null })}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Đặt lại vị trí (giữa đáy màn hình)" aria-label="Đặt lại vị trí thanh Thường dùng">
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={() => update({ ...saved, collapsed: true })}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Thu gọn" aria-label="Thu gọn thanh Thường dùng">
            <Minus className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
