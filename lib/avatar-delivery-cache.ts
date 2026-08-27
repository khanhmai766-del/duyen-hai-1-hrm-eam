import crypto from "crypto";
import sharp from "sharp";
import { getS3Object } from "@/lib/s3";

const AVATAR_CACHE_TTL_MS = 10 * 60_000;
const AVATAR_CACHE_MAX_ENTRIES = 512;
const AVATAR_CACHE_MAX_BYTES = 32 * 1024 * 1024;

export type DeliveredAvatar = {
  body: Buffer;
  etag: string;
  lastModified: string | null;
};

type CacheEntry = DeliveredAvatar & {
  expiresAt: number;
  createdAt: number;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<DeliveredAvatar>>();
let cachedBytes = 0;

async function streamBodyToBuffer(body: NonNullable<Awaited<ReturnType<typeof getS3Object>>["Body"]>) {
  const stream = body.transformToWebStream();
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function removeEntry(key: string) {
  const entry = cache.get(key);
  if (!entry) return;
  cachedBytes -= entry.body.byteLength;
  cache.delete(key);
}

function prune(now = Date.now()) {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) removeEntry(key);
  }
  while (cache.size > AVATAR_CACHE_MAX_ENTRIES || cachedBytes > AVATAR_CACHE_MAX_BYTES) {
    let oldestKey: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [key, entry] of cache) {
      if (entry.createdAt < oldestAt) {
        oldestAt = entry.createdAt;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    removeEntry(oldestKey);
  }
}

async function loadAvatar(key: string): Promise<DeliveredAvatar> {
  const object = await getS3Object(key);
  if (!object.Body) throw new Error("Không đọc được ảnh đại diện");
  const source = await streamBodyToBuffer(object.Body);
  // Nhiều avatar cũ là PNG 300–380 KB. Chuyển về WebP vuông 256 px khi phục vụ,
  // không sửa object gốc nên dữ liệu cũ và quy trình upload hiện tại vẫn tương thích.
  const body = await sharp(source)
    .rotate()
    .resize({ width: 256, height: 256, fit: "cover", withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();
  const digest = crypto.createHash("sha256").update(body).digest("base64url");
  return {
    body,
    etag: `"avatar-${digest}"`,
    lastModified: object.LastModified?.toUTCString() ?? null,
  };
}

export async function getDeliveredAvatar(key: string): Promise<DeliveredAvatar> {
  const now = Date.now();
  prune(now);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    // LRU: lần đọc gần nhất trở thành entry mới nhất trong Map.
    cache.delete(key);
    cache.set(key, { ...hit, createdAt: now });
    return hit;
  }

  const pending = inFlight.get(key);
  if (pending) return pending;
  const promise = loadAvatar(key)
    .then((value) => {
      removeEntry(key);
      cache.set(key, {
        ...value,
        expiresAt: Date.now() + AVATAR_CACHE_TTL_MS,
        createdAt: Date.now(),
      });
      cachedBytes += value.body.byteLength;
      prune();
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export function avatarResponseHeaders(avatar: DeliveredAvatar, visibility: "private" | "public") {
  return {
    "Content-Type": "image/webp",
    "Content-Length": String(avatar.body.byteLength),
    "Cache-Control": `${visibility}, max-age=300, stale-while-revalidate=86400`,
    ETag: avatar.etag,
    ...(avatar.lastModified ? { "Last-Modified": avatar.lastModified } : {}),
    "X-Content-Type-Options": "nosniff",
  };
}

export function avatarNotModified(request: Request, avatar: DeliveredAvatar) {
  return request.headers.get("if-none-match") === avatar.etag;
}

export function avatarResponseBody(avatar: DeliveredAvatar) {
  // Buffer dùng ArrayBufferLike nên không khớp BodyInit của lib.dom trong TS strict.
  // Copy sang Uint8Array sở hữu ArrayBuffer chuẩn; kích thước avatar sau nén chỉ vài KB.
  const body = new Uint8Array(avatar.body.byteLength);
  body.set(avatar.body);
  return body;
}

export function avatarDeliveryCacheStats() {
  prune();
  return {
    entries: cache.size,
    bytes: cachedBytes,
    inFlight: inFlight.size,
    maxEntries: AVATAR_CACHE_MAX_ENTRIES,
    maxBytes: AVATAR_CACHE_MAX_BYTES,
  };
}
