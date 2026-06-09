// Maps a shift duty seat (cương vị trực ca) to the control-screen / system image
// shown as the background of the "Cương vị trực ca" dashboard card.
//
// Image source: IMG_Chucvu.xlsx → public/chucvu/*. Keys are the seat titles from
// lib/org-template.ts, normalized (accent-free, lower-case) so S1/S2 variants and
// minor casing differences all resolve. Seats without a dedicated image (e.g.
// "Trạm nước thô") simply fall through to null and the card keeps its plain style.

import { normalizeText } from "@/lib/nav";

const BASE = "/chucvu";

// Normalized base-title → image file. The trailing " s1" / " s2" suffix is
// stripped before lookup, so "Lò phó S1" and "Lò phó S2" share one image.
const POSITION_IMAGE: Record<string, string> = {
  "truong ca": `${BASE}/truong-ca.jpg`,
  "truong kip lo - may dh1": `${BASE}/tk-lo-may.png`,
  "truong kip dien": `${BASE}/truong-kip-dien.png`,
  "may truong": `${BASE}/may-truong.png`,
  "may pho": `${BASE}/may-pho.png`,
  "tro thu": `${BASE}/tro-thu.png`,
  "tram bom tuan hoan": `${BASE}/tram-bom-tuan-hoan.png`,
  "lo truong": `${BASE}/lo-truong.png`,
  "lo pho": `${BASE}/lo-pho.png`,
  "may nghien": `${BASE}/may-nghien.png`,
  "thai xi": `${BASE}/thai-xi.png`,
  "i&c": `${BASE}/i-c.png`,
  esp: `${BASE}/esp.png`,
  fgd: `${BASE}/fgd.png`,
  "khi nen - nha dau 300m3": `${BASE}/khi-nen.png`,
  "truc chinh dien": `${BASE}/truc-chinh-dien.png`,
  "truc phu dien": `${BASE}/truc-phu-dien.png`,
  "xln hon hop": `${BASE}/xln-hon-hop.png`,
  "xlnt - nha dau 5000m3": `${BASE}/xlnt.png`,
  "nh3 - lo hoi phu": `${BASE}/nh3.png`,
  // "Trạm nước thô" intentionally has no image.
};

/** Resolve a duty seat title to its background image URL, or null if none. */
export function positionImage(label?: string | null): string | null {
  if (!label) return null;
  const key = normalizeText(label).replace(/\s+s[12]$/, "");
  return POSITION_IMAGE[key] ?? null;
}
