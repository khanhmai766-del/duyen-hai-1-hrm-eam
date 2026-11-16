"use client";

// Adapted from React Bits SpotlightCard (TS-TW), circle highlight only.
// Copyright (c) 2026 David Haz. MIT + Commons Clause; see LICENSE.md.
import { useRef, type ReactNode } from "react";

export function SpotlightCard({ children }: { children: ReactNode }) {
  const light = useRef<HTMLSpanElement>(null);

  return (
    <div
      className="group/spotlight relative isolate min-w-0 rounded-xl [&>button]:h-full [&>button]:w-full"
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (light.current) {
          light.current.style.background = `radial-gradient(circle 180px at ${event.clientX - rect.left}px ${event.clientY - rect.top}px, rgba(14, 116, 144, 0.09), transparent)`;
          light.current.style.opacity = "1";
        }
      }}
      onPointerLeave={() => {
        if (light.current) light.current.style.opacity = "0";
      }}
    >
      {children}
      <span
        ref={light}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-200 motion-reduce:hidden"
      />
    </div>
  );
}
