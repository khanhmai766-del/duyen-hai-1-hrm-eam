/** Compare against the configured public URL, never client-supplied forwarding headers.
 * Next.js behind Nginx may expose an internal http://localhost request URL even
 * though the browser correctly sends Origin: https://duyenhai1.vn.
 */
export function isCtktktSameOrigin(request: Request, required = false): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return !required;
  // Origin is a serialized origin, not a URL with a path, credentials or a list.
  let parsed: URL;
  try { parsed = new URL(origin); } catch { return false; }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) return false;
  if (origin === new URL(request.url).origin) return true;
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://duyenhai1.vn";
  try {
    const publicUrl = new URL(configured);
    if (!["http:", "https:"].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password) return false;
    return origin === publicUrl.origin;
  } catch { return false; }
}
