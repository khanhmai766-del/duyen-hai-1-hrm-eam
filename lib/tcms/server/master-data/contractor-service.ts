import { z } from "zod";

import type { ContractorInput } from "../../types/contractor";

const optionalText = (maximum: number) => z.union([
  z.string().trim().max(maximum).transform((value) => value || undefined),
  z.undefined(),
]);

const contractorSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[\p{L}\p{N}._/-]+$/u).transform((value) => value.toLocaleUpperCase("vi")),
  name: z.string().trim().min(2).max(300),
  taxCode: optionalText(40).refine((value) => !value || /^[\p{L}\p{N}._/-]+$/u.test(value), "INVALID_TAX_CODE"),
  address: optionalText(500),
  phone: optionalText(50),
  representative: optionalText(200),
  active: z.boolean(),
}).strict();

export function parseContractorInput(value: unknown): ContractorInput {
  const result = contractorSchema.safeParse(value);
  if (!result.success) throw new SyntaxError(result.error.issues[0]?.message ?? "INVALID_CONTRACTOR_FIELDS");
  return result.data;
}

export function parseContractorVersion(value: unknown) {
  const result = z.coerce.number().int().positive().safeParse(value);
  if (!result.success) throw new SyntaxError("INVALID_CONTRACTOR_VERSION");
  return result.data;
}
