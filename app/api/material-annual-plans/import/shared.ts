import type { NextRequest } from "next/server";
import { fail } from "@/lib/api";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function readAnnualPlanWorkbook(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) throw fail("Yêu cầu phải là multipart/form-data", 400);
  const file = form.get("file");
  if (!(file instanceof File)) throw fail("Chưa chọn tệp QLVT.20", 400);
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw fail("Chỉ chấp nhận tệp .xlsx", 400);
  if (file.size > MAX_UPLOAD_BYTES) throw fail("Tệp vượt quá 10 MB", 413);
  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    fileName: file.name,
    sheetName: String(form.get("sheetName") ?? "").trim() || null,
    form,
  };
}
