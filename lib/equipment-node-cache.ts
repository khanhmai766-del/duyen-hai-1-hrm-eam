import type { NormalizedEquipmentNode } from "@/lib/equipment-tree";
import { getNormalizedEquipmentNodeList } from "@/lib/equipment-tree";
import { prisma } from "@/lib/prisma";

// Cây danh mục thiết bị (~9k node) gần như tĩnh giữa các lần sửa, và danh sách "nhẹ"
// (không kèm ảnh base64) sau khi normalize là GIỐNG NHAU cho mọi người dùng — việc lọc
// quyền được làm sau. Cache in-process để không phải đọc + normalize 9k dòng trên mỗi
// request (tải cây, xem chi tiết node, kiểm tra quyền theo cương vị...).
const TTL_MS = 60_000;

let entry: { value: NormalizedEquipmentNode[]; expiresAt: number } | null = null;
let inFlight: Promise<NormalizedEquipmentNode[]> | null = null;
let generation = 0;

export async function getCachedEquipmentNodeList(): Promise<NormalizedEquipmentNode[]> {
  const now = Date.now();
  if (entry && entry.expiresAt > now) return entry.value;
  if (inFlight) return inFlight;

  const gen = generation;
  inFlight = getNormalizedEquipmentNodeList(prisma)
    .then((value) => {
      // Bỏ qua nếu đã bị invalidate trong lúc đang tải (tránh cache dữ liệu cũ).
      if (gen === generation) {
        entry = { value, expiresAt: Date.now() + TTL_MS };
      }
      return value;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function invalidateEquipmentNodeCache() {
  generation++;
  entry = null;
  inFlight = null;
}
