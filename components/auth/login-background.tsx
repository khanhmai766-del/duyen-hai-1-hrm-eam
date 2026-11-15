"use client";

import * as React from "react";
import Aurora from "@/components/react-bits/Aurora";

const auroraQuery = "(min-width: 1024px) and (prefers-reduced-motion: no-preference)";
function subscribeAurora(callback: () => void) {
  const query = window.matchMedia(auroraQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const getAuroraEnabled = () => window.matchMedia(auroraQuery).matches;
const getServerAuroraEnabled = () => false;

/**
 * Cycling, blurred & dimmed video backdrop for the login brand panel.
 * Plays a single pre-merged clip (bg1–bg3 ghép liền) on loop, so the footage
 * runs continuously without any gap between clips. A navy overlay (~55%)
 * plus blur keeps the foreground title fully legible.
 */
export function LoginBackground() {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const auroraEnabled = React.useSyncExternalStore(subscribeAurora, getAuroraEnabled, getServerAuroraEnabled);

  React.useEffect(() => {
    const video = videoRef.current;
    const update = () => {
      if (auroraEnabled && !document.hidden) video?.play().catch(() => {});
      else video?.pause();
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      video?.pause();
      document.removeEventListener("visibilitychange", update);
    };
  }, [auroraEnabled]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-navy">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full scale-105 object-cover"
        style={{ filter: "blur(2px) brightness(0.82) saturate(1.1)" }}
        src="/videos/bg.mp4"
        muted
        loop
        playsInline
        preload="none"
      />
      {/* Lighter navy tint + bottom-weighted gradient keeps text readable while
          letting the footage show through clearly. */}
      <div className="absolute inset-0 bg-navy/35" />
      <div className="absolute inset-0 bg-gradient-to-t from-navy/75 via-transparent to-navy/25" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.16),transparent_65%)]">
        {auroraEnabled && (
          <Aurora colorStops={["#0c4a6e", "#38bdf8", "#1d4ed8"]} speed={0.25} amplitude={0.45} brightness={0.6} opacity={0.45} layers={1} dpr={1} intro={false} mouseInteraction={false} />
        )}
      </div>
    </div>
  );
}
