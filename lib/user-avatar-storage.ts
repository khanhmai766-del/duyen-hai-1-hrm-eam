import { safeEmployeeCode, uploadS3Object } from "@/lib/s3";

const AVATAR_DATA_URL_RE = /^data:([^;,]+);base64,(.+)$/;

function imageExtensionForMime(mimeType: string, label: string) {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw new Error(`${label} chỉ chấp nhận jpg, png hoặc webp`);
  }
}

function isS3ProxyUrl(value: string) {
  return value.startsWith("/api/files/s3?") || value.includes("/api/files/s3?");
}

export async function avatarUpdate(value: unknown, employeeId: string) {
  if (value === undefined) return {};
  const raw = String(value ?? "").trim();
  if (!raw) return { avatarUrl: null, avatarKey: null };
  if (isS3ProxyUrl(raw)) return {};

  const match = raw.match(AVATAR_DATA_URL_RE);
  if (!match) return { avatarUrl: raw, avatarKey: null };

  const mimeType = match[1];
  const ext = imageExtensionForMime(mimeType, "Ảnh đại diện");
  const code = safeEmployeeCode(employeeId);
  const key = `avatars/${code}.${ext}`;
  await uploadS3Object({
    key,
    body: Buffer.from(match[2], "base64"),
    contentType: mimeType,
    originalName: `${code}.${ext}`,
  });
  return { avatarUrl: null, avatarKey: key };
}

export async function signatureUpdate(value: unknown, employeeId: string) {
  if (value === undefined) return {};
  const raw = String(value ?? "").trim();
  if (!raw) return { signatureUrl: null, signatureKey: null };
  if (isS3ProxyUrl(raw)) return {};

  const match = raw.match(AVATAR_DATA_URL_RE);
  if (!match) return { signatureUrl: raw, signatureKey: null };

  const mimeType = match[1];
  const ext = imageExtensionForMime(mimeType, "Chữ ký số");
  const code = safeEmployeeCode(employeeId);
  const key = `signatures/${code}.${ext}`;
  await uploadS3Object({
    key,
    body: Buffer.from(match[2], "base64"),
    contentType: mimeType,
    originalName: `${code}.${ext}`,
  });
  return { signatureUrl: null, signatureKey: key };
}
