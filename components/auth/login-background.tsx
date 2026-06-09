"use client";

import * as React from "react";

const VIDEOS = ["/videos/bg1.mp4", "/videos/bg2.mp4", "/videos/bg3.mp4", "/videos/bg4.mp4"];

/**
 * Cycling, blurred & dimmed video backdrop for the login brand panel.
 * Plays one clip at a time, advancing on `ended`; a navy overlay (~55%)
 * plus blur keeps the foreground title fully legible.
 */
export function LoginBackground() {
  const [index, setIndex] = React.useState(0);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    // Autoplay can be rejected before user interaction; retry quietly.
    videoRef.current?.play().catch(() => {});
  }, [index]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-navy">
      <video
        ref={videoRef}
        key={index}
        className="absolute inset-0 h-full w-full scale-105 object-cover"
        style={{ filter: "blur(2px) brightness(0.82) saturate(1.1)" }}
        src={VIDEOS[index]}
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={() => setIndex((i) => (i + 1) % VIDEOS.length)}
        onError={() => setIndex((i) => (i + 1) % VIDEOS.length)}
      />
      {/* Lighter navy tint + bottom-weighted gradient keeps text readable while
          letting the footage show through clearly. */}
      <div className="absolute inset-0 bg-navy/35" />
      <div className="absolute inset-0 bg-gradient-to-t from-navy/75 via-transparent to-navy/25" />
    </div>
  );
}
