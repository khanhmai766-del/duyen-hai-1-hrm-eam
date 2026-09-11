import { z } from "zod";

import type { DepartmentInput } from "../../types/department";

const departmentSchema = z.object({
  code: z.string().trim().min(2).max(30).regex(/^[\p{L}\p{N}._-]+$/u).transform((value) => value.toLocaleUpperCase("vi")),
  name: z.string().trim().min(2).max(200),
  active: z.boolean().default(true),
}).strict();

export function parseDepartmentInput(value: unknown): DepartmentInput {
  const result = departmentSchema.safeParse(value);
  if (!result.success) throw new SyntaxError("INVALID_DEPARTMENT_FIELDS");
  return result.data;
}

export function parseDepartmentVersion(value: unknown) {
  const result = z.coerce.number().int().positive().safeParse(value);
  if (!result.success) throw new SyntaxError("INVALID_DEPARTMENT_VERSION");
  return result.data;
}
