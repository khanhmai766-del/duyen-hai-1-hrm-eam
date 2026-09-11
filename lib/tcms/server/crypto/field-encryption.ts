import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const FORMAT_VERSION = 1;
const KEY_VERSION = 1;

function key() {
  const path = process.env.TCMS_FIELD_ENCRYPTION_KEY_FILE?.trim();
  const encoded = path ? readFileSync(path, "utf8").trim() : process.env.TCMS_FIELD_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new Error("Thiếu cấu hình khóa mã hóa hợp đồng.");
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length !== 32) throw new Error("Khóa mã hóa hợp đồng phải có 32 byte, mã hóa Base64.");
  return decoded;
}

export function encryptJson(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    ciphertext: Buffer.concat([Buffer.from([FORMAT_VERSION]), iv, cipher.getAuthTag(), ciphertext]),
    keyVersion: KEY_VERSION,
  };
}

export function decryptJson<T>(payload: Buffer | null): T | undefined {
  if (!payload) return undefined;
  if (payload[0] !== FORMAT_VERSION || payload.length < 30) throw new Error("Dữ liệu mã hóa không hợp lệ.");
  const decipher = createDecipheriv("aes-256-gcm", key(), payload.subarray(1, 13));
  decipher.setAuthTag(payload.subarray(13, 29));
  const plaintext = Buffer.concat([decipher.update(payload.subarray(29)), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
