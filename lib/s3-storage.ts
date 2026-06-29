import path from "path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type S3Env = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

let client: S3Client | null = null;

function readEnv(): S3Env | null {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, region, bucket, accessKeyId, secretAccessKey };
}

export function getS3Env(): S3Env {
  const env = readEnv();
  if (!env) {
    throw new Error("Thiếu cấu hình S3 trong .env");
  }
  return env;
}

function getClient() {
  if (client) return client;
  const env = getS3Env();
  client = new S3Client({
    endpoint: env.endpoint,
    region: env.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
  return client;
}

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
  const env = getS3Env();
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType || "application/octet-stream",
      Metadata: params.originalName ? { originalName: metadataValue(params.originalName) } : undefined,
    })
  );
  return params.key;
}

export async function signedS3Url(key: string, expiresIn = 300) {
  const env = getS3Env();
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: env.bucket,
      Key: key,
    }),
    { expiresIn }
  );
}

export async function getS3Object(key: string) {
  const env = getS3Env();
  return getClient().send(
    new GetObjectCommand({
      Bucket: env.bucket,
      Key: key,
    })
  );
}

export function s3ProxyUrl(key: string) {
  return `/api/files/s3?key=${encodeURIComponent(key)}`;
}

export async function userWithSignedMedia<T extends { avatarUrl?: string | null; signatureUrl?: string | null; avatarKey?: string | null; signatureKey?: string | null }>(
  user: T
): Promise<T> {
  const avatarUrl = user.avatarKey ? s3ProxyUrl(user.avatarKey) : user.avatarUrl ?? null;
  const signatureUrl = user.signatureKey ? s3ProxyUrl(user.signatureKey) : user.signatureUrl ?? null;
  return { ...user, avatarUrl, signatureUrl };
}
