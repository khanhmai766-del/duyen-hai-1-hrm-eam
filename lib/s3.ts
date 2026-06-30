import crypto from "crypto";
import path from "path";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

function s3Client() {
  return new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: requiredEnv("S3_ENDPOINT"),
    credentials: {
      accessKeyId: requiredEnv("S3_ACCESS_KEY"),
      secretAccessKey: requiredEnv("S3_SECRET_KEY"),
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  });
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

export async function maybeUploadDataUrl({ value, folder, preset = "image" }: MaybeUploadParams) {
  if (!value) return value ?? null;
  if (!isDataUrl(value)) return value;
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
