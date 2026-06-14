import crypto from "crypto";
import type { NextRequest } from "next/server";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const LOGIN_TOKEN_TTL_MS = 60 * 1000;

export interface ChallengePayload {
  challenge: string;
  email: string;
  userId?: string;
  credentialId?: string;
  exp: number;
  purpose: "register" | "authenticate";
}

export interface LoginTokenPayload {
  userId: string;
  email: string;
  exp: number;
}

export function randomChallenge() {
  return base64url(crypto.randomBytes(32));
}

export function base64url(input: Buffer | ArrayBuffer | Uint8Array | string) {
  const buffer = typeof input === "string" ? Buffer.from(input) : Buffer.from(input as Uint8Array);
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function fromBase64url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  return Buffer.from(normalized + pad, "base64");
}

export function originFromRequest(req: NextRequest) {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export function rpIdFromRequest(req: NextRequest) {
  return (req.headers.get("host") ?? "localhost:3000").split(":")[0];
}

export function createChallengeCookie(payload: Omit<ChallengePayload, "challenge" | "exp"> & { challenge?: string }) {
  const full: ChallengePayload = {
    ...payload,
    challenge: payload.challenge ?? randomChallenge(),
    exp: Date.now() + CHALLENGE_TTL_MS,
  };
  return { payload: full, value: signPayload(full) };
}

export function readChallengeCookie(value: string | undefined, purpose: ChallengePayload["purpose"]) {
  const payload = readSignedPayload<ChallengePayload>(value);
  if (!payload || payload.purpose !== purpose || payload.exp < Date.now()) return null;
  return payload;
}

export function createLoginToken(payload: Omit<LoginTokenPayload, "exp">) {
  return signPayload({ ...payload, exp: Date.now() + LOGIN_TOKEN_TTL_MS });
}

export function readLoginToken(value: string | undefined) {
  const payload = readSignedPayload<LoginTokenPayload>(value);
  if (!payload || payload.exp < Date.now()) return null;
  return payload;
}

export function verifyClientData({
  clientDataJSON,
  expectedChallenge,
  expectedOrigin,
  expectedType,
}: {
  clientDataJSON: string;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedType: "webauthn.create" | "webauthn.get";
}) {
  const clientData = JSON.parse(fromBase64url(clientDataJSON).toString("utf8"));
  return (
    clientData.type === expectedType &&
    clientData.challenge === expectedChallenge &&
    clientData.origin === expectedOrigin
  );
}

export function parseRegistrationResponse(attestationObject: string) {
  const decoded = decodeCbor(fromBase64url(attestationObject));
  const authData = Buffer.from(decoded.authData as Uint8Array);
  const flags = authData[32];
  if ((flags & 0x40) === 0) throw new Error("Authenticator data missing credential data");
  const credentialIdLength = authData.readUInt16BE(53);
  const credentialId = authData.subarray(55, 55 + credentialIdLength);
  const cosePublicKeyBytes = authData.subarray(55 + credentialIdLength);
  const cosePublicKey = decodeCbor(cosePublicKeyBytes);
  const publicKeyJwk = coseEc2ToJwk(cosePublicKey);
  return {
    credentialId: base64url(credentialId),
    publicKey: JSON.stringify(publicKeyJwk),
    counter: authData.readUInt32BE(33),
  };
}

export function verifyAuthenticationResponse({
  authenticatorData,
  clientDataJSON,
  signature,
  publicKey,
}: {
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
  publicKey: string;
}) {
  const authData = fromBase64url(authenticatorData);
  const clientDataHash = crypto.createHash("sha256").update(fromBase64url(clientDataJSON)).digest();
  const signedData = Buffer.concat([authData, clientDataHash]);
  const verify = crypto.createVerify("SHA256");
  verify.update(signedData);
  verify.end();
  const ok = verify.verify({ key: JSON.parse(publicKey), format: "jwk" }, fromBase64url(signature));
  return { ok, counter: authData.readUInt32BE(33) };
}

function signPayload(payload: object) {
  const body = base64url(JSON.stringify(payload));
  const sig = hmac(body);
  return `${body}.${sig}`;
}

function readSignedPayload<T>(value: string | undefined) {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig || hmac(body) !== sig) return null;
  try {
    return JSON.parse(fromBase64url(body).toString("utf8")) as T;
  } catch {
    return null;
  }
}

function hmac(body: string) {
  return base64url(crypto.createHmac("sha256", authSecret()).update(body).digest());
}

function authSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "dev-passkey-secret";
}

function coseEc2ToJwk(cose: Map<unknown, unknown>) {
  const x = cose.get(-2);
  const y = cose.get(-3);
  if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) throw new Error("Unsupported public key");
  return {
    kty: "EC",
    crv: "P-256",
    x: base64url(x),
    y: base64url(y),
    ext: true,
  };
}

function decodeCbor(input: Buffer | Uint8Array) {
  const buffer = Buffer.from(input);
  let offset = 0;

  function readLength(additional: number) {
    if (additional < 24) return additional;
    if (additional === 24) return buffer[offset++];
    if (additional === 25) {
      const v = buffer.readUInt16BE(offset);
      offset += 2;
      return v;
    }
    if (additional === 26) {
      const v = buffer.readUInt32BE(offset);
      offset += 4;
      return v;
    }
    throw new Error("Unsupported CBOR length");
  }

  function read(): any {
    const head = buffer[offset++];
    const major = head >> 5;
    const additional = head & 0x1f;
    const length = readLength(additional);

    if (major === 0) return length;
    if (major === 1) return -1 - length;
    if (major === 2) {
      const value = buffer.subarray(offset, offset + length);
      offset += length;
      return value;
    }
    if (major === 3) {
      const value = buffer.subarray(offset, offset + length).toString("utf8");
      offset += length;
      return value;
    }
    if (major === 4) {
      return Array.from({ length }, () => read());
    }
    if (major === 5) {
      const map = new Map();
      for (let i = 0; i < length; i++) map.set(read(), read());
      return Array.from(map.keys()).every((key) => typeof key === "string") ? Object.fromEntries(map) : map;
    }
    if (major === 7) {
      if (additional === 20) return false;
      if (additional === 21) return true;
      if (additional === 22) return null;
    }
    throw new Error("Unsupported CBOR value");
  }

  const value = read();
  if (value instanceof Map) return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return value;
}
