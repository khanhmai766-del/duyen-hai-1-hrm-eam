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
  const code = value.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(code)) {
    throw new Error("Mã nhân viên chỉ được chứa chữ, số, dấu chấm, gạch ngang hoặc gạch dưới");
  }
  return code;
}

export function fileExtension(fileName: string) {
  const ext = path.extname(fileName).toLowerCase().replace(".", "");
  if (!ext) throw new Error("Không xác định được phần mở rộng tệp");
  return ext;
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
      Metadata: params.originalName ? { originalName: params.originalName.slice(0, 255) } : undefined,
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

export async function userWithSignedMedia<T extends { avatarUrl?: string | null; signatureUrl?: string | null; avatarKey?: string | null; signatureKey?: string | null }>(
  user: T
): Promise<T> {
  try {
    const [avatarUrl, signatureUrl] = await Promise.all([
      user.avatarKey ? signedS3Url(user.avatarKey) : Promise.resolve(user.avatarUrl ?? null),
      user.signatureKey ? signedS3Url(user.signatureKey) : Promise.resolve(user.signatureUrl ?? null),
    ]);
    return { ...user, avatarUrl, signatureUrl };
  } catch {
    return user;
  }
}
