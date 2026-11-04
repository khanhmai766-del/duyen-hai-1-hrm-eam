import type { getRawDb } from "@/modules/ctktkt/db";
export const DEFAULT_SHIFT_LEADERS: string[] = [];
export const SHIFT_TEAMS = ["A", "B", "C", "D", "E", "F"] as const;
export const SHIFT_TIMES = ["06h00", "14h00", "22h00"] as const;
export async function ensureWaterSchema(_db: ReturnType<typeof getRawDb>) { /* prisma/manual/add-ctktkt.sql */ }
