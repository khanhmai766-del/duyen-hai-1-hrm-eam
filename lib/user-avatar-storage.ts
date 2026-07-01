import { safeEmployeeCode, uploadS3Object } from "@/lib/s3";

const AVATAR_DATA_URL_RE = /^data:([^;,]+);base64,(.+)$/;

function avatarExtensionForMime(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw new Error("Ảnh đại diện chỉ chấp nhận jpg, png hoặc webp");
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
  const ext = avatarExtensionForMime(mimeType);
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
