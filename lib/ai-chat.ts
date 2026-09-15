import { prisma } from "@/lib/prisma";
import { verifyAiCitationProof } from "@/lib/ai-auth";

export const AI_CHAT_RETENTION_DAYS = 14;
export const AI_CHAT_MAX_QUESTION_LENGTH = 2_000;
export const AI_CHAT_HISTORY_LIMIT = 10;

export type AiCitation = {
  sourceType: "DEVICE" | "DEFECT" | "DEFECT_HISTORY" | "REPAIR" | "MATERIAL_REPLACEMENT";
  sourceId: string;
  title: string;
  url: string;
  occurredAt?: string | null;
};

export function aiConversationExpiry(from = new Date()) {
  return new Date(from.getTime() + AI_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export function sanitizeAiCitations(value: unknown, conversationId: string): AiCitation[] {
  if (!Array.isArray(value)) return [];
  const allowedTypes = new Set<AiCitation["sourceType"]>([
    "DEVICE", "DEFECT", "DEFECT_HISTORY", "REPAIR", "MATERIAL_REPLACEMENT",
  ]);
  const allowedPaths = /^\/(devices|defects|repair-history|replacement-history)(\/|\?|$)/;
  const seen = new Set<string>();
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    const sourceType = String(item.sourceType ?? "") as AiCitation["sourceType"];
    const sourceId = String(item.sourceId ?? "").trim().slice(0, 200);
    const title = String(item.title ?? "").trim().slice(0, 300);
    const url = String(item.url ?? "").trim().slice(0, 500);
    const proof = String(item.proof ?? "").trim();
    const key = `${sourceType}:${sourceId}`;
    if (
      !allowedTypes.has(sourceType) || !sourceId || !title || !allowedPaths.test(url) || seen.has(key) ||
      !verifyAiCitationProof(conversationId, { sourceType, sourceId, url, proof })
    ) return [];
    seen.add(key);
    return [{
      sourceType,
      sourceId,
      title,
      url,
      occurredAt: item.occurredAt ? String(item.occurredAt) : null,
    }];
  }).slice(0, 20);
}

export function cleanupExpiredAiConversations() {
  void prisma.aiConversation.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch((error) => {
    console.error("[ai chat cleanup]", error);
  });
}
