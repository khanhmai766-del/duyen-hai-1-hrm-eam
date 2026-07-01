"use client";

import * as React from "react";
import { Flame, Gauge, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type PowerLoadingOverlayProps = {
  active: boolean;
  delayMs?: number;
  message?: string;
  className?: string;
};

export function PowerLoadingOverlay({
  active,
  delayMs = 10000,
  message = "Đang tải dữ liệu vận hành",
  className,
}: PowerLoadingOverlayProps) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message}
      className={cn(
        "fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-[3px]",
        className
      )}
    >
      <div className="relative w-full max-w-[480px] overflow-hidden rounded-[8px] border border-cyan-100/25 bg-[linear-gradient(145deg,rgba(8,19,38,0.96),rgba(15,35,61,0.96)_52%,rgba(3,81,98,0.9))] p-6 text-white shadow-[0_26px_90px_-34px_rgba(7,89,133,0.9)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200 to-transparent" />
        <div className="absolute -right-20 -top-24 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-16 h-44 w-44 rounded-full bg-amber-300/20 blur-3xl" />

        <div className="relative flex items-center justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-white/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-100">
              <Zap className="h-3.5 w-3.5 text-amber-300" />
              Hệ thống đang xử lý
            </div>
            <h2 className="text-3xl font-black uppercase tracking-[0.08em] text-white">VẬN HÀNH 1</h2>
            <p className="mt-2 max-w-[320px] text-sm leading-6 text-slate-200">{message}</p>
          </div>

          <div className="relative h-20 w-20 shrink-0">
            <div className="vh1-turbine absolute inset-0 rounded-full border-[7px] border-cyan-200/20 border-t-cyan-300 border-r-amber-300" />
            <div className="absolute inset-5 rounded-full border border-white/20 bg-slate-950/50" />
            <Gauge className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-cyan-100" />
          </div>
        </div>

        <div className="relative mt-7 rounded-[8px] border border-white/10 bg-slate-950/36 p-5">
          <div className="grid grid-cols-[1fr_84px_1fr] items-end gap-4">
            <div className="space-y-2">
              <div className="h-5 rounded-sm bg-cyan-100/18" />
              <div className="h-5 rounded-sm bg-cyan-100/14" />
              <div className="h-5 rounded-sm bg-cyan-100/10" />
              <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
                <span className="vh1-energy absolute inset-y-0 left-0 w-1/2 rounded-full bg-gradient-to-r from-cyan-300 via-white to-amber-300" />
              </div>
            </div>

            <div className="relative mx-auto flex h-24 w-20 items-end justify-center">
              <span className="vh1-steam vh1-steam-a" />
              <span className="vh1-steam vh1-steam-b" />
              <span className="vh1-steam vh1-steam-c" />
              <div className="h-20 w-8 rounded-t-sm bg-gradient-to-b from-slate-500 to-slate-800 shadow-inner" />
              <div className="h-24 w-9 rounded-t-sm bg-gradient-to-b from-slate-400 to-slate-900 shadow-inner" />
            </div>

            <div className="rounded-[8px] border border-amber-200/18 bg-amber-300/10 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-100">
                <Flame className="h-4 w-4 text-amber-300" />
                Lò hơi
              </div>
              <div className="flex items-end gap-1.5">
                <span className="vh1-heat h-7 w-3 rounded-full bg-amber-300" />
                <span className="vh1-heat h-11 w-3 rounded-full bg-orange-400 [animation-delay:160ms]" />
                <span className="vh1-heat h-8 w-3 rounded-full bg-red-400 [animation-delay:320ms]" />
                <span className="vh1-heat h-12 w-3 rounded-full bg-amber-200 [animation-delay:480ms]" />
                <span className="vh1-heat h-9 w-3 rounded-full bg-orange-300 [animation-delay:640ms]" />
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">
          <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.9)]" />
          Đang đồng bộ dữ liệu ca trực
        </div>
      </div>

      <style>{`
        @keyframes vh1-turbine-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes vh1-energy-flow {
          0% { transform: translateX(-110%); opacity: .25; }
          45% { opacity: 1; }
          100% { transform: translateX(220%); opacity: .25; }
        }
        @keyframes vh1-steam-rise {
          0% { opacity: 0; transform: translateY(22px) scale(.58); }
          35% { opacity: .72; }
          100% { opacity: 0; transform: translateY(-38px) scale(1.18); }
        }
        @keyframes vh1-heat-pulse {
          0%, 100% { transform: scaleY(.74); opacity: .58; }
          50% { transform: scaleY(1); opacity: 1; }
        }
        .vh1-turbine {
          animation: vh1-turbine-spin 1.35s linear infinite;
        }
        .vh1-energy {
          animation: vh1-energy-flow 1.6s ease-in-out infinite;
        }
        .vh1-steam {
          position: absolute;
          top: 0;
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: rgba(207, 250, 254, .72);
          filter: blur(3px);
          animation: vh1-steam-rise 2.3s ease-out infinite;
        }
        .vh1-steam-a { left: 18px; animation-delay: 0ms; }
        .vh1-steam-b { left: 32px; animation-delay: 520ms; }
        .vh1-steam-c { left: 46px; animation-delay: 1040ms; }
        .vh1-heat {
          transform-origin: bottom;
          animation: vh1-heat-pulse 1.1s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .vh1-turbine,
          .vh1-energy,
          .vh1-steam,
          .vh1-heat {
            animation-duration: 4s !important;
          }
        }
      `}</style>
    </div>
  );
}
