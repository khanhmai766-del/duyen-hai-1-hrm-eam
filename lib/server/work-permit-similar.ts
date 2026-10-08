import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/nav";
import { positionCodeOf } from "@/lib/position-catalog";
import { compactOverhaulContent } from "@/lib/work-permit-overhaul";

/*
 * Cảnh báo TRÙNG NỘI DUNG (rà soát phiếu hủy 08/10/2026): 4501/4502 bấm cấp hai lần cùng nội dung, 4499 "đã có PCT cấp
 * trước đó", 4111–4113 "đã công tác trong số phiếu khác". Cùng sổ + cùng cương vị, nội dung gần giống một phiếu ĐANG HIỆU
 * LỰC (nháp chờ NKVH / đã cấp / đang làm / chờ làm tiếp / tạm dừng) hoặc vừa tạo trong 24 giờ → hỏi lại / hiện cảnh báo.
 * Chỉ CẢNH BÁO, không chặn: việc lặp lại thật (bảo dưỡng định kỳ nhiều thiết bị cùng tên) vẫn cấp được.
 */
const ACTIVE = ["DRAFT", "ISSUED", "ACTIVE", "WAITING", "PAUSED"];
const RECENT_MS = 24 * 3600_000;
const LOOKBACK_MS = 45 * 24 * 3600_000;
const THRESHOLD = 0.9;

function tokens(content: string) {
  return new Set(normalizeText(compactOverhaulContent(content)).split(/[^a-z0-9.]+/).filter(token => token.length >= 2));
}
/**
 * Hệ số Dice trên tập từ (bỏ dấu, bỏ hoa thường): 1 = trùng hẳn. Từ có CHỮ SỐ (mã thiết bị 2E1 / 20HFA60BB001, tổ máy
 * S1/S2, số bơm…) phải khớp TRỌN BỘ — "tắc than máy cấp 2E1" và "… 2D1" là hai việc khác nhau, không phải trùng.
 */
export function contentSimilarity(a: string, b: string) {
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return 0;
  const codes = (set: Set<string>) => [...set].filter(token => /\d/.test(token)).sort().join(" ");
  if (codes(x) !== codes(y)) return 0;
  let common = 0;
  for (const token of x) if (y.has(token)) common++;
  return (2 * common) / (x.size + y.size);
}
const samePosition = (a: string, b: string) => {
  const [ca, cb] = [positionCodeOf(a), positionCodeOf(b)];
  return ca && cb ? ca === cb : normalizeText(a).trim() === normalizeText(b).trim();
};

export type SimilarPermit = { id: string; number: string; year: number; status: string; content: string; issuerName: string; createdAt: Date; score: number };

export async function findSimilarPermits(db: Prisma.TransactionClient | typeof prisma, input: { kind: string; position: string; content: string; excludeId?: string | null }, now = new Date()): Promise<SimilarPermit[]> {
  const content = input.content.trim();
  if (tokens(content).size < 3) return [];
  const rows = await db.workPermit.findMany({
    where: {
      kind: input.kind, createdAt: { gte: new Date(now.getTime() - LOOKBACK_MS) }, status: { not: "CANCELLED" },
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      OR: [{ status: { in: ACTIVE } }, { createdAt: { gte: new Date(now.getTime() - RECENT_MS) } }],
    },
    select: { id: true, number: true, year: true, status: true, content: true, position: true, issuerName: true, createdAt: true },
    take: 500, orderBy: { createdAt: "desc" },
  });
  const position = input.position.trim();
  return rows
    .filter(row => !position || !row.position.trim() || samePosition(position, row.position))
    .map(row => ({ id: row.id, number: row.number, year: row.year, status: row.status, content: row.content, issuerName: row.issuerName, createdAt: row.createdAt, score: contentSimilarity(content, row.content) }))
    .filter(row => row.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
