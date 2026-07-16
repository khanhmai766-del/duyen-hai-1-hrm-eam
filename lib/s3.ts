import crypto from "crypto";
import path from "path";
import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import { Readable } from "stream";
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";

type ImagePreset = "avatar" | "signature" | "image" | "document-image";

type UploadBufferParams = {
  buffer: Buffer;
  contentType: string;
  folder: string;
  filename?: string;
  cacheControl?: string;
};

type MaybeUploadParams = {
  value: string | null | undefined;
  folder: string;
  preset?: ImagePreset;
};

const DEFAULT_CACHE_CONTROL = "public, max-age=31536000, immutable";
const LOCAL_OBJECT_ROOT = path.join(process.cwd(), ".local-storage");

function hasS3Config() {
  return Boolean(
    process.env.S3_ENDPOINT &&
    process.env.S3_ACCESS_KEY &&
    process.env.S3_SECRET_KEY &&
    process.env.S3_BUCKET
  );
}

function localObjectPath(key: string) {
  const normalized = key.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error("Key tệp không hợp lệ");
  }
  const target = path.resolve(LOCAL_OBJECT_ROOT, normalized);
  if (!target.startsWith(`${path.resolve(LOCAL_OBJECT_ROOT)}${path.sep}`)) {
    throw new Error("Key tệp không hợp lệ");
  }
  return target;
}

function contentTypeFromKey(key: string) {
  const ext = path.extname(key).toLowerCase();
  const map: Record<string, string> = {
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".json": "application/json",
  };
  return map[ext] || "application/octet-stream";
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

let _client: S3Client | null = null;

function s3Client() {
  if (_client) return _client;
  _client = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: requiredEnv("S3_ENDPOINT"),
    credentials: {
      accessKeyId: requiredEnv("S3_ACCESS_KEY"),
      secretAccessKey: requiredEnv("S3_SECRET_KEY"),
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  });
  return _client;
}

function bucket() {
  return requiredEnv("S3_BUCKET");
}

function publicBaseUrl() {
  return (process.env.S3_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
}

function cleanFolder(folder: string) {
  return folder.replace(/^\/+|\/+$/g, "").replace(/\\/g, "/");
}

function extensionFromContentType(contentType: string) {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "text/plain": "txt",
  };
  return map[contentType] ?? "bin";
}

function extensionFromFilename(filename?: string) {
  if (!filename) return "";
  const ext = path.extname(filename).replace(/^\./, "").toLowerCase();
  return ext.replace(/[^a-z0-9]/g, "");
}

function objectUrl(key: string) {
  const base = publicBaseUrl();
  if (base) return `${base}/${key}`;
  return `${requiredEnv("S3_ENDPOINT").replace(/\/+$/, "")}/${bucket()}/${key}`;
}

function makeKey(folder: string, ext: string) {
  return `${cleanFolder(folder)}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
}

function isDataUrl(value: string) {
  return /^data:[^;]+;base64,/i.test(value);
}

function dataUrlToBuffer(value: string) {
  const match = value.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) throw new Error("Dữ liệu file không hợp lệ");
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

async function optimizeImage(buffer: Buffer, contentType: string, preset: ImagePreset) {
  if (!contentType.startsWith("image/")) {
    return { buffer, contentType, ext: extensionFromContentType(contentType) };
  }

  if (preset === "signature") {
    const output = await sharp(buffer)
      .resize({ width: 600, height: 240, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    return { buffer: output, contentType: "image/png", ext: "png" };
  }

  const size = preset === "avatar" ? 256 : preset === "document-image" ? 1280 : 1600;
  const quality = preset === "avatar" ? 82 : 78;
  const output = await sharp(buffer)
    .rotate()
    .resize({
      width: size,
      height: preset === "avatar" ? size : undefined,
      fit: preset === "avatar" ? "cover" : "inside",
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 4 })
    .toBuffer();

  return { buffer: output, contentType: "image/webp", ext: "webp" };
}

export async function uploadBufferToS3({
  buffer,
  contentType,
  folder,
  filename,
  cacheControl = DEFAULT_CACHE_CONTROL,
}: UploadBufferParams) {
  const ext = extensionFromFilename(filename) || extensionFromContentType(contentType);
  const key = makeKey(folder, ext);
  await s3Client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: cacheControl,
    })
  );
  return { key, url: objectUrl(key) };
}

export async function uploadImageBufferToS3({
  buffer,
  contentType,
  folder,
  preset = "image",
}: {
  buffer: Buffer;
  contentType: string;
  folder: string;
  preset?: ImagePreset;
}) {
  const optimized = await optimizeImage(buffer, contentType, preset);
  return uploadBufferToS3({
    buffer: optimized.buffer,
    contentType: optimized.contentType,
    folder,
    filename: `image.${optimized.ext}`,
  });
}

// Tầng 3 — Quy ước lưu trữ: cột ảnh/tài liệu trong DB chỉ chứa URL ngắn (MinIO/link),
// KHÔNG BAO GIỜ chứa base64. Chuỗi quá dài không phải data URL bị từ chối 400.
const MAX_STORED_URL_LENGTH = 2048;

// Response envelope 400 thuần (không import lib/api để script tsx không phải kéo next-auth).
function storedUrlViolation(message: string) {
  return new Response(JSON.stringify({ data: null, meta: null, error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

export async function maybeUploadDataUrl({ value, folder, preset = "image" }: MaybeUploadParams) {
  if (!value) return value ?? null;
  if (!isDataUrl(value)) {
    if (value.length > MAX_STORED_URL_LENGTH) {
      throw storedUrlViolation(
        `Tệp/ảnh không hợp lệ: cột lưu trữ chỉ nhận URL tối đa ${MAX_STORED_URL_LENGTH} ký tự. Ảnh phải gửi dạng data URL (data:image/...) để hệ thống tự đưa lên kho tệp.`
      );
    }
    return value;
  }
  const parsed = dataUrlToBuffer(value);
  const uploaded = await uploadImageBufferToS3({
    buffer: parsed.buffer,
    contentType: parsed.contentType,
    folder,
    preset,
  });
  return uploaded.url;
}

export async function maybeUploadDataUrlList(values: string[] | null | undefined, folder: string, preset: ImagePreset = "image") {
  if (!Array.isArray(values)) return [];
  const uploaded = await Promise.all(values.filter(Boolean).map((value) => maybeUploadDataUrl({ value, folder, preset })));
  return uploaded.filter((value): value is string => !!value);
}

export function keyFromPublicUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("/api/files/s3?")) {
    try {
      return new URL(url, "http://local").searchParams.get("key");
    } catch {
      return null;
    }
  }
  const base = publicBaseUrl();
  if (base && url.startsWith(`${base}/`)) return url.slice(base.length + 1);
  const endpoint = process.env.S3_ENDPOINT?.replace(/\/+$/, "");
  const b = process.env.S3_BUCKET;
  const prefix = endpoint && b ? `${endpoint}/${b}/` : "";
  if (prefix && url.startsWith(prefix)) return url.slice(prefix.length);
  return null;
}

export async function deleteFromS3(url: string | null | undefined) {
  const key = keyFromPublicUrl(url);
  if (!key) return;
  await s3Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function deleteS3ObjectByKey(key: string) {
  if (!hasS3Config()) {
    await unlink(localObjectPath(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    return;
  }
  await s3Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

// ───────────────────────────────────────────────────────────────────────────
// Lưu trữ theo KHÓA do caller chỉ định, phục vụ qua app proxy (/api/files/s3)
// hoặc signed URL. (Gộp từ lib/s3-storage.ts cũ — dùng chung client/bucket ở trên.)
// ───────────────────────────────────────────────────────────────────────────

export function dateFolder(date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export function safeEmployeeCode(value: string) {
  const code = value.trim().normalize("NFC");
  if (!/^[\p{L}\p{M}\p{N}._-]+$/u.test(code)) {
    throw new Error("Mã nhân viên chỉ được chứa chữ, số, dấu chấm, gạch ngang hoặc gạch dưới");
  }
  return code;
}

export function fileExtension(fileName: string) {
  const ext = path.extname(fileName).toLowerCase().replace(".", "");
  if (!ext) throw new Error("Không xác định được phần mở rộng tệp");
  return ext;
}

function metadataValue(value: string) {
  return encodeURIComponent(value).slice(0, 1024);
}

export async function uploadS3Object(params: {
  key: string;
  body: Buffer;
  contentType?: string;
  originalName?: string;
}) {
  if (!hasS3Config()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Thiếu cấu hình S3; production không được phép lưu tệp audit xuống ổ đĩa local");
    }
    const target = localObjectPath(params.key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, params.body);
    return params.key;
  }
  await s3Client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType || "application/octet-stream",
      Metadata: params.originalName ? { originalName: metadataValue(params.originalName) } : undefined,
    })
  );
  return params.key;
}

export async function listS3ObjectKeys(prefix: string) {
  if (!hasS3Config()) throw new Error("Thiếu cấu hình S3 để liệt kê tệp");
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const response = await s3Client().send(new ListObjectsV2Command({
      Bucket: bucket(),
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    keys.push(...(response.Contents ?? []).flatMap((item) => item.Key ? [item.Key] : []));
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

export async function getS3ObjectBuffer(key: string) {
  const object = await getS3Object(key);
  if (!object.Body) throw new Error(`Tệp S3 không có nội dung: ${key}`);
  const reader = object.Body.transformToWebStream().getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

export async function signedS3Url(key: string, expiresIn = 300) {
  return getSignedUrl(s3Client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn });
}

export async function getS3Object(key: string) {
  if (!hasS3Config()) {
    const target = localObjectPath(key);
    const [buffer, fileStat] = await Promise.all([readFile(target), stat(target)]);
    return {
      Body: {
        transformToWebStream: () => Readable.toWeb(Readable.from(buffer)) as ReadableStream,
      },
      ContentType: contentTypeFromKey(key),
      LastModified: fileStat.mtime,
    };
  }
  return s3Client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
}

export function s3ProxyUrl(key: string, fileName?: string) {
  const params = new URLSearchParams({ key });
  if (fileName) params.set("filename", fileName);
  return `/api/files/s3?${params.toString()}`;
}

/**
 * Tầng 4 — user nhúng trong DANH SÁCH (createdBy/doneBy...): avatar phục vụ qua
 * proxy theo key; tuyệt đối không để base64 lọt vào payload list (mỗi avatar
 * base64 ~20-40KB, list 50 dòng kèm avatar = hàng MB).
 */
export function publicUserRef<T extends { avatarUrl?: string | null; avatarKey?: string | null }>(user: T) {
  const { avatarKey, avatarUrl, ...rest } = user;
  return {
    ...rest,
    avatarUrl: avatarKey
      ? s3ProxyUrl(avatarKey)
      : avatarUrl && !avatarUrl.startsWith("data:")
        ? avatarUrl
        : null,
  };
}

export async function userWithSignedMedia<
  T extends { avatarUrl?: string | null; signatureUrl?: string | null; avatarKey?: string | null; signatureKey?: string | null }
>(user: T): Promise<T> {
  const cleanStoredUrl = (value?: string | null) => (value && !value.startsWith("data:") ? value : null);
  const avatarUrl = user.avatarKey ? s3ProxyUrl(user.avatarKey) : cleanStoredUrl(user.avatarUrl);
  const signatureUrl = user.signatureKey ? s3ProxyUrl(user.signatureKey) : cleanStoredUrl(user.signatureUrl);
  return { ...user, avatarUrl, signatureUrl };
}
