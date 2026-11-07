import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { requirePermission } from "@/modules/ctktkt/lib/auth/server";
import { buildSection1ImportPackage } from "@/modules/ctktkt/lib/bcsx-section1-import";

const maxFileBytes = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const guard = await requirePermission("edit_bcsx");
  if (!guard.ok) return guard.response;
  if (!isCtktktSameOrigin(request)) {
    return Response.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    return Response.json({ error: "Hãy gửi đồng thời 2 file Excel S1 và S2." }, { status: 415 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);
    if (files.length !== 2) throw new Error("Hãy chọn đồng thời đúng 2 file Excel BCSX: một file S1 và một file S2.");
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error(`${file.name}: chỉ chấp nhận file .xlsx.`);
      if (file.size <= 0 || file.size > maxFileBytes) throw new Error(`${file.name}: dung lượng file không hợp lệ hoặc vượt quá 4 MB.`);
    }
    const importPackage = await buildSection1ImportPackage(await Promise.all(files.map(async file => ({
      fileName: file.name,
      bytes: await file.arrayBuffer(),
    }))));
    return Response.json(importPackage, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không đọc được hai file Excel S1/S2." }, { status: 400 });
  }
}
