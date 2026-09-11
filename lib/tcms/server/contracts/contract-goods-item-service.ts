import { z } from "zod";
import type { CreateContractGoodsItemInput } from "../../types/contract-goods-item";

const text = z.string().trim().transform((value) => value || undefined).optional().nullable().transform((value) => value ?? undefined);
const schema = z.object({
  workScopeId: z.uuid().optional().nullable().transform((value) => value ?? undefined),
  itemCode: text,
  description: z.string().trim().min(1), technicalSpecification: text, manufacturer: text, model: text, origin: text,
  quantity: z.number().nonnegative().optional().nullable().transform((value) => value ?? undefined), unit: text,
  documentRequirementText: text, rawClause: text, sourcePage: z.number().int().positive().optional().nullable().transform((value) => value ?? undefined),
  evidence: text, confidence: z.number().min(0).max(1).optional().nullable().transform((value) => value ?? undefined),
}).strict();

export function parseContractGoodsItemInput(value: unknown): CreateContractGoodsItemInput {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new SyntaxError("INVALID_CONTRACT_GOODS_ITEM");
  return parsed.data;
}

export function parseExpectedVersion(value: unknown) {
  if (!Number.isInteger(value) || Number(value) <= 0) throw new SyntaxError("EXPECTED_VERSION_REQUIRED");
  return Number(value);
}
