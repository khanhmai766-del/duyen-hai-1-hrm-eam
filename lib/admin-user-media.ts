import path from "path";
import yauzl from "yauzl";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/api";
import { fileExtension, safeEmployeeCode, uploadS3Object } from "@/lib/s3-storage";

type MediaKind = "avatar" | "signature";

type ZipEntryBuffer = {
  fileName: string;
  buffer: Buffer;
};

const EXECUTABLE_EXTENSIONS = new Set(["exe", "sh", "php", "js", "mjs", "cjs", "bat", "cmd", "ps1", "jar", "com", "scr"]);
const ALLOWED_SINGLE: Record<MediaKind, string[]> = {
  avatar: ["jpg", "jpeg", "png", "webp"],
  signature: ["png", "jpg", "jpeg", "pdf"],
};

function maxSingleBytes() {
  return Number(process.env.USER_UPLOAD_MAX_FILE_MB ?? 5) * 1024 * 1024;
}

function maxZipBytes() {
  return Number(process.env.USER_UPLOAD_MAX_ZIP_MB ?? 100) * 1024 * 1024;
}

function contentType(ext: string) {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    case "zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

function validateMediaFile(name: string, size: number, kind: MediaKind) {
  const ext = fileExtension(name);
  if (EXECUTABLE_EXTENSIONS.has(ext)) throw new Error("Không chấp nhận file thực thi");
  if (!ALLOWED_SINGLE[kind].includes(ext)) {
    throw new Error(kind === "avatar" ? "Ảnh đại diện chỉ chấp nhận jpg, jpeg, png, webp" : "Chữ ký chỉ chấp nhận png, jpg, jpeg, pdf");
  }
  if (size > maxSingleBytes()) throw new Error(`Tệp vượt quá ${Number(process.env.USER_UPLOAD_MAX_FILE_MB ?? 5)}MB`);
  return ext;
}

function validateZipPath(fileName: string) {
  const normalized = fileName.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("../") || normalized.includes("..\\")) {
    throw new Error("Đường dẫn trong zip không hợp lệ");
  }
}

function normalizedZipPath(fileName: string) {
  return fileName.replace(/\\/g, "/");
}

function shouldIgnoreZipEntry(fileName: string) {
  const normalized = normalizedZipPath(fileName);
  const base = path.posix.basename(normalized);
  return normalized.startsWith("__MACOSX/") || base === ".DS_Store" || base.startsWith("._");
}

function zipFromBuffer(buffer: Buffer): Promise<ZipEntryBuffer[]> {
  return new Promise((resolve, reject) => {
    const entries: ZipEntryBuffer[] = [];
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error("Không đọc được file zip"));
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }
        if (shouldIgnoreZipEntry(entry.fileName)) {
          zipfile.readEntry();
          return;
        }
        try {
          validateZipPath(entry.fileName);
          if (entry.uncompressedSize > maxSingleBytes()) throw new Error(`File ${entry.fileName} vượt quá dung lượng cho phép`);
        } catch (e) {
          zipfile.close();
          reject(e);
          return;
        }
        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) {
            reject(streamErr ?? new Error("Không đọc được file trong zip"));
            return;
          }
          const chunks: Buffer[] = [];
          let total = 0;
          stream.on("data", (chunk) => {
            total += chunk.length;
            if (total > maxSingleBytes()) {
              stream.destroy(new Error(`File ${entry.fileName} vượt quá dung lượng cho phép`));
              return;
            }
            chunks.push(Buffer.from(chunk));
          });
          stream.on("error", reject);
          stream.on("end", () => {
            entries.push({ fileName: path.posix.basename(normalizedZipPath(entry.fileName)), buffer: Buffer.concat(chunks) });
            zipfile.readEntry();
          });
        });
      });
      zipfile.on("end", () => resolve(entries));
      zipfile.on("error", reject);
    });
  });
}

function keyFor(kind: MediaKind, employeeCode: string, ext: string) {
  return `${kind === "avatar" ? "avatars" : "signatures"}/${employeeCode}.${ext}`;
}

async function uploadForUser(kind: MediaKind, employeeCode: string, fileName: string, buffer: Buffer, mimeType?: string) {
  const ext = validateMediaFile(fileName, buffer.length, kind);
  const code = safeEmployeeCode(employeeCode);
  const existing = await prisma.user.findUnique({ where: { employeeId: code }, select: { id: true } });
  if (!existing) throw new Error("Không tìm thấy mã nhân viên");
  const key = keyFor(kind, code, ext);
  await uploadS3Object({ key, body: buffer, contentType: mimeType || contentType(ext), originalName: fileName });
  await prisma.user.update({
    where: { id: existing.id },
    data:
      kind === "avatar"
        ? { avatarKey: key, avatarUrl: null }
        : { signatureKey: key, signatureUrl: null },
  });
  return key;
}

export async function uploadSingleUserMedia(form: FormData, actorId: string, kind: MediaKind) {
  const employeeCode = String(form.get("employee_code") ?? form.get("employeeId") ?? "").trim();
  if (!employeeCode) throw new Error("Thiếu mã nhân viên");
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Thiếu tệp tải lên");
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = await uploadForUser(kind, employeeCode, file.name, buffer, file.type || undefined);
  await audit(actorId, kind === "avatar" ? "UPLOAD_USER_AVATAR" : "UPLOAD_USER_SIGNATURE", "User", employeeCode, key);
  return { employee_code: employeeCode, key };
}

export async function uploadUserMediaZip(form: FormData, actorId: string, kind: MediaKind) {
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Thiếu file zip");
  const ext = fileExtension(file.name);
  if (ext !== "zip") throw new Error("Chỉ chấp nhận file .zip");
  if (file.size > maxZipBytes()) throw new Error(`File zip vượt quá ${Number(process.env.USER_UPLOAD_MAX_ZIP_MB ?? 100)}MB`);

  const zipBuffer = Buffer.from(await file.arrayBuffer());
  const entries = await zipFromBuffer(zipBuffer);
  const errors: Array<{ file: string; reason: string }> = [];
  let success = 0;

  for (const entry of entries) {
    const base = path.posix.basename(entry.fileName);
    const employeeCode = path.posix.basename(base, path.posix.extname(base));
    try {
      await uploadForUser(kind, employeeCode, base, entry.buffer);
      success++;
    } catch (e) {
      errors.push({ file: entry.fileName, reason: e instanceof Error ? e.message : "Lỗi không xác định" });
    }
  }

  await audit(
    actorId,
    kind === "avatar" ? "UPLOAD_USER_AVATARS_ZIP" : "UPLOAD_USER_SIGNATURES_ZIP",
    "User",
    undefined,
    JSON.stringify({ total: entries.length, success, error: errors.length, errors }).slice(0, 6000)
  );

  return {
    total_files: entries.length,
    success_files: success,
    error_files: errors.length,
    errors,
  };
}
