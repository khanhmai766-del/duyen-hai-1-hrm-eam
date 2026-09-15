import assert from "node:assert/strict";
import test from "node:test";
import {
  createAiCapability,
  createAiCitationProof,
  verifyAiCapability,
} from "../../lib/ai-auth";
import { sanitizeAiCitations } from "../../lib/ai-chat";

process.env.AI_CAPABILITY_SECRET = "test-secret-123456789012345678901234567890";

test("capability hợp lệ giữ đúng phạm vi đã ký", () => {
  const token = createAiCapability({
    userId: "user-1",
    conversationId: "conversation-1",
    role: "TECHNICIAN",
    systemRole: "TECHNICIAN",
    position: "VHV Lò S1",
  });
  const result = verifyAiCapability(token);
  assert.equal(result.sub, "user-1");
  assert.equal(result.conversationId, "conversation-1");
  assert.equal(result.position, "VHV Lò S1");
});

test("capability bị sửa bị từ chối", () => {
  const token = createAiCapability({
    userId: "user-1",
    conversationId: "conversation-1",
    role: "VIEWER",
  });
  assert.throws(() => verifyAiCapability(`${token}x`));
});

test("chỉ nhận citation có chữ ký đúng và đường dẫn nội bộ", () => {
  const base = {
    sourceType: "DEVICE" as const,
    sourceId: "DH1.S1.1",
    title: "Bơm dầu A",
    url: "/devices/DH1.S1.1",
  };
  const proof = createAiCitationProof("conversation-1", base);
  assert.equal(sanitizeAiCitations([{ ...base, proof }], "conversation-1").length, 1);
  assert.equal(sanitizeAiCitations([{ ...base, proof: "sai" }], "conversation-1").length, 0);
  assert.equal(sanitizeAiCitations([{ ...base, url: "https://example.com", proof }], "conversation-1").length, 0);
});
