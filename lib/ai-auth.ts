import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/api";
import { hasAssignedPermissionLevel } from "@/lib/rbac-permissions";

const CAPABILITY_TTL_SECONDS = 120;

export type AiCapability = {
  sub: string;
  conversationId: string;
  role: string;
  systemRole: string;
  position: string | null;
  /** Mã của lượt hỏi (xem lib/ai-request-registry.ts). Tuỳ chọn để capability cũ vẫn hợp lệ. */
  rid?: string;
  iat: number;
  exp: number;
};

function secret() {
  const value = process.env.AI_CAPABILITY_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("AI_CAPABILITY_SECRET_NOT_CONFIGURED");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createAiCapability(input: {
  userId: string;
  conversationId: string;
  role: string;
  systemRole?: string | null;
  position?: string | null;
  requestId?: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const capability: AiCapability = {
    sub: input.userId,
    conversationId: input.conversationId,
    role: input.role,
    systemRole: input.systemRole ?? input.role,
    position: input.position?.trim() || null,
    ...(input.requestId ? { rid: input.requestId } : {}),
    iat: now,
    exp: now + CAPABILITY_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(capability), "utf8").toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function createAiCitationProof(
  conversationId: string,
  citation: { sourceType: string; sourceId: string; url: string }
) {
  return signature(`citation:${conversationId}:${citation.sourceType}:${citation.sourceId}:${citation.url}`);
}

export function verifyAiCitationProof(
  conversationId: string,
  citation: { sourceType: string; sourceId: string; url: string; proof?: string }
) {
  if (!citation.proof) return false;
  return constantTimeEqual(createAiCitationProof(conversationId, citation), citation.proof);
}

export function verifyAiCapability(token: string | null | undefined): AiCapability {
  const [payload, receivedSignature, extra] = String(token ?? "").split(".");
  if (!payload || !receivedSignature || extra || !constantTimeEqual(signature(payload), receivedSignature)) {
    throw fail("Quyền tra cứu AI không hợp lệ", 401);
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<AiCapability>;
    const now = Math.floor(Date.now() / 1000);
    if (
      !parsed.sub || !parsed.conversationId || !parsed.role || !parsed.systemRole ||
      !Number.isInteger(parsed.iat) || !Number.isInteger(parsed.exp) ||
      parsed.exp! < now || parsed.iat! > now + 30 || parsed.exp! - parsed.iat! > CAPABILITY_TTL_SECONDS ||
      (parsed.rid !== undefined && (typeof parsed.rid !== "string" || !parsed.rid || parsed.rid.length > 100))
    ) {
      throw new Error("invalid payload");
    }
    return parsed as AiCapability;
  } catch (error) {
    if (error instanceof Response) throw error;
    throw fail("Quyền tra cứu AI đã hết hạn hoặc không hợp lệ", 401);
  }
}

export function verifyN8nAiToolToken(received: string | null) {
  const expected = process.env.N8N_AI_TOOL_TOKEN?.trim() ?? "";
  const token = received?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!expected || !token) return false;
  return constantTimeEqual(
    createHmac("sha256", "ai-tool-token").update(expected).digest("hex"),
    createHmac("sha256", "ai-tool-token").update(token).digest("hex")
  );
}

export async function requireAiToolUser(req: NextRequest) {
  if (!verifyN8nAiToolToken(req.headers.get("authorization"))) {
    throw fail("Token công cụ AI không hợp lệ", 401);
  }
  const capability = verifyAiCapability(req.headers.get("x-ai-capability"));
  const dbUser = await prisma.user.findUnique({
    where: { id: capability.sub },
    select: {
      id: true,
      // Tên dùng cho công cụ lịch trực ca giải nghĩa person="tôi"; website vẫn gửi tên sang n8n
      // trong mọi câu hỏi nên đây không phải dữ liệu mới bị lộ.
      name: true,
      role: true,
      accessMode: true,
      position: true,
      secondaryPosition: true,
      secondaryPosition2: true,
      currentPosition: true,
      isActive: true,
      lockedAt: true,
    },
  });
  if (!dbUser?.isActive || dbUser.lockedAt) throw fail("Tài khoản không còn hợp lệ", 401);
  if (dbUser.role !== capability.systemRole) throw fail("Quyền tài khoản đã thay đổi", 401);

  const assignedPositions = [
    dbUser.position,
    dbUser.secondaryPosition,
    dbUser.secondaryPosition2,
    dbUser.currentPosition,
  ].filter((value): value is string => Boolean(value?.trim()));
  if (capability.position && !assignedPositions.includes(capability.position)) {
    throw fail("Cương vị làm việc đã thay đổi", 401);
  }

  const toolUser = {
    ...dbUser,
    role: capability.role,
    systemRole: capability.systemRole,
    currentPosition: capability.position,
    position: capability.position ?? dbUser.currentPosition ?? dbUser.position,
    conversationId: capability.conversationId,
    requestId: capability.rid ?? null,
  };
  if (!(await hasAssignedPermissionLevel(toolUser, "ai-chat", ["read", "personal", "manage", "full"]))) {
    throw fail("Tài khoản không còn quyền sử dụng trợ lý AI", 403);
  }
  return toolUser;
}
