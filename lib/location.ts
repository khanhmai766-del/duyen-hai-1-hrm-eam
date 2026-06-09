// User-location helpers for the weather card: browser geolocation, reverse
// geocoding (BigDataCloud — free, no key), and representative imagery for a
// coordinate (Wikimedia Commons geosearch — free, no key, CORS-enabled).

export interface Coords {
  latitude: number;
  longitude: number;
}

export interface PlaceInfo {
  name: string;
  images: string[];
}

/** Ask the browser for the user's position. Resolves null if unavailable/denied. */
export function getBrowserLocation(): Promise<Coords | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 1000 * 60 * 30 }
    );
  });
}

/** Reverse-geocode a coordinate to a human-readable "City, Region" label (vi). */
export async function reverseGeocode({ latitude, longitude }: Coords): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=vi`
    );
    if (!res.ok) return null;
    const j = await res.json();
    const place = j.city || j.locality || j.principalSubdivision || "";
    const region = j.principalSubdivision && j.principalSubdivision !== place ? j.principalSubdivision : "";
    const name = [place, region].filter(Boolean).join(", ");
    return name || j.countryName || null;
  } catch {
    return null;
  }
}

interface CommonsPage {
  title?: string;
  imageinfo?: { url: string; thumburl?: string; width: number; height: number; mime: string }[];
  categories?: { title: string }[];
}

// Sensitive topics we never want as a public dashboard backdrop. Matched as whole
// words (tokens) against the image title + its Commons categories, so benign names
// like "Monuments" (contains "men") are NOT blocked. Broad people-words (people,
// man, woman, face, model…) are deliberately excluded — they false-positive on
// landmarks (e.g. "People's Committee" buildings); people-centric content is caught
// by the phrase list below instead.
const BLOCKED_TOKENS = new Set([
  // Nudity / sexual / explicit
  "nude", "nudes", "nudity", "naked", "topless", "sex", "sexual", "sexuality",
  "erotic", "erotica", "porn", "pornography", "nsfw", "breast", "breasts",
  "genitalia", "genitals", "penis", "vulva", "buttocks", "underwear",
  "lingerie", "bikini", "bikinis", "swimsuit", "swimwear", "fetish",
  // Portraits / individuals
  "portrait", "portraits", "selfie", "selfies",
  // Distressing
  "corpse", "corpses", "gore",
]);

// People/ethnographic-centric category phrases — substring-matched on the lowercased
// text. Phrases (not bare words) so "People's Committee" is NOT caught, but
// "People of Vietnam" / "Portrait photographs of…" / "Models" categories are.
const BLOCKED_PHRASES = [
  "people of", "men of", "women of", "girls of", "boys of", "children of",
  "portrait photographs", "head shots", "human faces", "fashion models",
  "glamour", "swimwear models",
];

function tokensOf(s: string): string[] {
  return s.toLowerCase().replace(/^(file|category):/i, "").match(/[a-z]+/g) ?? [];
}

/** True if the title/categories hit any blocked topic. */
function isSensitive(page: CommonsPage): boolean {
  const haystacks = [page.title ?? "", ...(page.categories ?? []).map((c) => c.title)];
  return haystacks.some((h) => {
    const lower = h.toLowerCase();
    if (BLOCKED_PHRASES.some((p) => lower.includes(p))) return true;
    const toks = tokensOf(h);
    return toks.some((t) => BLOCKED_TOKENS.has(t));
  });
}

/** Find representative, moderated landscape photos near a coordinate (Wikimedia Commons). */
export async function fetchPlaceImages({ latitude, longitude }: Coords, limit = 3): Promise<string[]> {
  // Widen the radius progressively so sparsely-photographed areas still get hits.
  for (const radius of [10000, 50000]) {
    try {
      const url =
        `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
        `&generator=geosearch&ggscoord=${latitude}%7C${longitude}&ggsradius=${radius}` +
        `&ggsnamespace=6&ggslimit=30` +
        `&prop=imageinfo%7Ccategories&iiprop=url%7Csize%7Cmime&iiurlwidth=1280` +
        `&clshow=!hidden&cllimit=500`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const j = await res.json();
      const pages: CommonsPage[] = Object.values(j?.query?.pages ?? {});
      const picks = pages
        .filter((p) => {
          const info = p.imageinfo?.[0];
          return (
            !!info &&
            info.mime?.startsWith("image/") &&
            info.mime !== "image/svg+xml" &&
            info.width >= info.height && // landscape only — suits a wide card
            info.width >= 800 &&
            !isSensitive(p) // moderation: skip 18+/portraits/inappropriate
          );
        })
        .map((p) => p.imageinfo![0].thumburl || p.imageinfo![0].url)
        .filter(Boolean);
      const unique = Array.from(new Set(picks)).slice(0, limit);
      if (unique.length) return unique;
    } catch {
      // try next radius
    }
  }
  return [];
}
