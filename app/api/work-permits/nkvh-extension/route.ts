import { requireUser } from "@/lib/api";
import { buildNkvhPctExtensionPackage } from "@/lib/server/nkvh-pct-extension-package";
import { permitHandle } from "@/lib/server/work-permits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return permitHandle(async () => {
    await requireUser();
    const { bytes, version } = await buildNkvhPctExtensionPackage();
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="cap-so-pct-nkvh-v${version}.zip"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
