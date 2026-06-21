"use client";

import * as React from "react";

/**
 * Cycling, blurred & dimmed video backdrop for the login brand panel.
 * Plays a single pre-merged clip (bg1–bg3 ghép liền) on loop, so the footage
 * runs continuously without any gap between clips. A navy overlay (~55%)
 * plus blur keeps the foreground title fully legible.
 */
export function LoginBackground() {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    // Autoplay can be rejected before user interaction; retry quietly.
    videoRef.current?.play().catch(() => {});
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-navy">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full scale-105 object-cover"
        style={{ filter: "blur(2px) brightness(0.82) saturate(1.1)" }}
        src="/videos/bg.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
      {/* Lighter navy tint + bottom-weighted gradient keeps text readable while
          letting the footage show through clearly. */}
      <div className="absolute inset-0 bg-navy/35" />
      <div className="absolute inset-0 bg-gradient-to-t from-navy/75 via-transparent to-navy/25" />
    </div>
  );
}
