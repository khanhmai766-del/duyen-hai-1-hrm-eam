// Helpers to give Recharts bars a vivid, modern 3D look:
// vertical gloss gradients (light top → solid bottom) + a soft drop shadow
// (the shadow is applied via the `.chart-3d` CSS class in globals.css).

function mixWhite(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.round(r + (255 - r) * amt);
  g = Math.round(g + (255 - g) * amt);
  b = Math.round(b + (255 - b) * amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function gradId(hex: string): string {
  return "bar3d-" + hex.replace("#", "");
}

export function barFill(hex: string): string {
  return `url(#${gradId(hex)})`;
}

/** Renders <linearGradient> defs for each distinct bar color. Drop into a chart. */
export function Bar3DDefs({ colors }: { colors: string[] }) {
  const unique = Array.from(new Set(colors));
  return (
    <defs>
      {unique.map((c) => (
        <linearGradient key={c} id={gradId(c)} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={mixWhite(c, 0.55)} />
          <stop offset="45%" stopColor={mixWhite(c, 0.12)} />
          <stop offset="100%" stopColor={c} />
        </linearGradient>
      ))}
    </defs>
  );
}
