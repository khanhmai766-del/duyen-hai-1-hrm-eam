import JSZip from "jszip";
import { fail, ok } from "@/lib/api";
import { inspectUpload } from "@/lib/upload-guard";
import { requireSession } from "@/modules/ctktkt/lib/auth/server";
import { canEditCtktktField } from "@/modules/ctktkt/lib/ctktkt-permissions";
import { calculateCsvProduction } from "@/modules/ctktkt/lib/production-csv";
import { readRarCsv } from "./rar";

const MAX_BYTES = 5 * 1024 * 1024;

function decodeCsv(bytes: Uint8Array) {
  const text = new TextDecoder("utf-8").decode(bytes);
  if (text.includes("\0")) throw new Error("CSV chứa dữ liệu nhị phân không hợp lệ.");
  return text.includes("\uFFFD") ? new TextDecoder("windows-1258").decode(bytes) : text;
}

/** Preview only. Saving uses ctktkt-report's permission, date and shift controls. */
export async function POST(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  if (!["J157", "K157", "J158", "K158"].every(cell => canEditCtktktField(guard.user, cell))) return fail("Bạn chưa có quyền nhập sản lượng PMIS.", 403);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) return fail("Tệp tải lên quá lớn.", 413);
  try {
    const form = await request.formData();
    const uploads = form.getAll("files");
    if (!uploads.length || uploads.length > 16 || uploads.some(file => !(file instanceof File))) throw new Error("Chọn tối đa 16 tệp CSV, ZIP hoặc RAR.");
    if ((uploads as File[]).reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) return fail("Tổng dung lượng tệp tải lên vượt quá 5 MB.", 413);
    const files: { name: string; text: string }[] = [];
    let totalBytes = 0;
    for (const upload of uploads as File[]) {
      if (upload.size > MAX_BYTES) throw new Error("Tệp vượt quá 5 MB.");
      const buffer = Buffer.from(await upload.arrayBuffer());
      if (/\.csv$/i.test(upload.name)) {
        await inspectUpload(buffer, { fileName: upload.name });
        totalBytes += buffer.length;
        files.push({ name: upload.name, text: decodeCsv(buffer) });
      } else if (/\.zip$/i.test(upload.name)) {
        await inspectUpload(buffer, { fileName: upload.name, kinds: ["zip"], label: "ZIP" });
        const zip = await JSZip.loadAsync(buffer);
        const members = Object.values(zip.files).filter(file => !file.dir && !file.name.startsWith("__MACOSX/"));
        if (!members.length || members.length > 16 || members.some(file => !/\.csv$/i.test(file.name))) throw new Error("ZIP phải chứa từ 1 đến 16 CSV.");
        for (const member of members) {
          // Stream with a hard decompressed-size limit to reject ZIP bombs.
          const bytes = await new Promise<Uint8Array>((resolve, reject) => {
            const chunks: Uint8Array[] = [];
            let size = 0;
            const stream = member.nodeStream("nodebuffer");
            stream.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size + totalBytes > MAX_BYTES) { stream.pause(); reject(new Error("Tổng CSV sau giải nén vượt quá 5 MB.")); }
              else chunks.push(chunk);
            }).on("error", reject).on("end", () => resolve(Buffer.concat(chunks))).resume();
          });
          totalBytes += bytes.length;
          const name = member.name.split(/[\\/]/).at(-1)!;
          await inspectUpload(Buffer.from(bytes), { fileName: name });
          files.push({ name, text: decodeCsv(bytes) });
        }
      } else if (/\.rar$/i.test(upload.name)) {
        await inspectUpload(buffer, { fileName: upload.name, kinds: ["rar"], label: "RAR" });
        for (const { name, bytes } of await readRarCsv(buffer, MAX_BYTES - totalBytes, 16 - files.length)) {
          await inspectUpload(bytes, { fileName: name });
          totalBytes += bytes.length;
          files.push({ name, text: decodeCsv(bytes) });
        }
      } else throw new Error("Chỉ nhận CSV, ZIP hoặc RAR chứa CSV.");
      if (totalBytes > MAX_BYTES || files.length > 16) throw new Error("Tối đa 16 CSV, tổng dung lượng 5 MB.");
    }
    return ok(calculateCsvProduction(files));
  } catch (error) {
    // UploadRejectedError is handled centrally, preserving scanner failures.
    if (error instanceof Error && error.name === "UploadRejectedError") throw error;
    return fail(error instanceof Error ? error.message : "Không đọc được CSV.", 400);
  }
}
