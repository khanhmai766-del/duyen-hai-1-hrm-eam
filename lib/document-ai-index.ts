import { createHash } from "node:crypto";
import {
  AI_KNOWLEDGE_CHUNKER_VERSION,
  cleanExtractedPdfText,
  chunkKnowledgeText,
} from "@/lib/ai-knowledge";
import { AI_EMBEDDING_DIMENSIONS, AI_EMBEDDING_MODEL } from "@/lib/ai-embedding";

export const DOCUMENT_AI_INDEX_PIPELINE_VERSION = 1;
export const MAX_DOCUMENT_PDF_BYTES = 25 * 1024 * 1024;

export function documentAiSourcePath(documentId: string) {
  return `digital-document:${documentId}`;
}

export function buildDocumentAiIndexVersion(input: {
  driveChecksum?: string | null;
  driveModifiedAt?: Date | string | null;
}) {
  const sourceVersion = String(input.driveChecksum ?? "").trim()
    || (input.driveModifiedAt ? new Date(input.driveModifiedAt).toISOString() : "unknown");
  return [
    `pipeline-${DOCUMENT_AI_INDEX_PIPELINE_VERSION}`,
    `chunker-${AI_KNOWLEDGE_CHUNKER_VERSION}`,
    AI_EMBEDDING_MODEL,
    AI_EMBEDDING_DIMENSIONS,
    sourceVersion,
  ].join(":");
}

export function prepareDocumentAiContent(rawText: string, title: string) {
  const content = cleanExtractedPdfText(rawText);
  const chunks = chunkKnowledgeText(content);
  const contentHash = createHash("sha256")
    .update(JSON.stringify({
      content,
      title,
      category: "quy-trinh",
      model: AI_EMBEDDING_MODEL,
      dimensions: AI_EMBEDDING_DIMENSIONS,
      chunker: AI_KNOWLEDGE_CHUNKER_VERSION,
      pipeline: DOCUMENT_AI_INDEX_PIPELINE_VERSION,
    }))
    .digest("hex");
  return { content, chunks, contentHash };
}

export function needsDocumentAiIndex(current: string | null | undefined, desired: string) {
  return !current || current !== desired;
}
