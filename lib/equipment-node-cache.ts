import type { NormalizedEquipmentNode } from "@/lib/equipment-tree";
import { buildEquipmentTreeIndex, getNormalizedEquipmentNodeList, getNormalizedEquipmentNodes } from "@/lib/equipment-tree";
import { prisma } from "@/lib/prisma";

// Cây danh mục thiết bị (~9k node) gần như tĩnh giữa các lần sửa, và sau khi normalize
// là GIỐNG NHAU cho mọi người dùng — việc lọc quyền được làm sau. Cache in-process để
// không phải đọc + normalize 9k dòng trên mỗi request. Có 2 biến thể:
//  - "list": bản nhẹ (không ảnh/tài liệu) — cây thiết bị, kiểm tra quyền.
//  - "full": kèm imageUrl/attachedInfo/documentUrl — thẻ QR, chi tiết thiết bị,
//    danh sách thiết bị (trước đây các chỗ này đọc thẳng DB mỗi request).
const TTL_MS = 60_000;

type CacheEntry = { value: NormalizedEquipmentNode[]; expiresAt: number };

let generation = 0;

function makeCachedLoader(load: () => Promise<NormalizedEquipmentNode[]>) {
  let entry: CacheEntry | null = null;
  let inFlight: Promise<NormalizedEquipmentNode[]> | null = null;
  return {
    get(): Promise<NormalizedEquipmentNode[]> {
      const now = Date.now();
      if (entry && entry.expiresAt > now) return Promise.resolve(entry.value);
      if (inFlight) return inFlight;
      const gen = generation;
      inFlight = load()
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
    },
    clear() {
      entry = null;
      inFlight = null;
    },
  };
}

const lightCache = makeCachedLoader(() => getNormalizedEquipmentNodeList(prisma));
const fullCache = makeCachedLoader(() => getNormalizedEquipmentNodes(prisma));

export function getCachedEquipmentNodeList(): Promise<NormalizedEquipmentNode[]> {
  return lightCache.get();
}

/** Bản đầy đủ (ảnh/thông tin/tài liệu đính kèm) — cùng TTL và cơ chế invalidate với bản nhẹ. */
export function getCachedEquipmentNodeFull(): Promise<NormalizedEquipmentNode[]> {
  return fullCache.get();
}

export function invalidateEquipmentNodeCache() {
  generation++;
  lightCache.clear();
  fullCache.clear();
}

// Chỉ mục cây (bySeq/parentOf/childrenOf) dựng từ 22k node tốn ~10-20ms CPU mỗi lần.
// Memo theo CHÍNH mảng node đã cache (WeakMap): cùng một bản cache → dựng index đúng 1 lần;
// cache refresh → mảng mới → index tự dựng lại, entry cũ được GC.
const indexByNodes = new WeakMap<NormalizedEquipmentNode[], ReturnType<typeof buildEquipmentTreeIndex>>();

/** Trả index cây cho một mảng node (ưu tiên truyền mảng lấy từ getCachedEquipmentNode*). */
export function getEquipmentTreeIndexFor(nodes: NormalizedEquipmentNode[]) {
  let index = indexByNodes.get(nodes);
  if (!index) {
    index = buildEquipmentTreeIndex(nodes);
    indexByNodes.set(nodes, index);
  }
  return index;
}
