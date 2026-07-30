import { prisma } from "@/lib/prisma";
import type { TreeScope } from "@/lib/equipment-units";

// Sau khi tách cây theo tổ máy, EquipmentProfile chỉ còn vai trò LƯU GHI ĐÈ: cấu trúc và
// tên/KKS của S2 đều dẫn xuất từ node S1, bảng profile chỉ ghi những nút mà một tổ máy đặt
// KHÁC đi. Số dòng có ghi đè thực sự rất ít (hiện 0) nên nạp trọn vào một Map in-process —
// cây bung nhánh không phải bắn thêm query nào, RAM gần như bằng 0.
//
// Cùng khuôn cache với lib/equipment-node-cache.ts (TTL + generation chống ghi đè dữ liệu cũ).
const TTL_MS = 60_000;

export type ProfileOverride = { name: string | null; kks: string | null };
type OverrideMap = Map<string, ProfileOverride>; // key: `${nodeSeq}|${machine}`

const overrideKey = (nodeSeq: string, machine: TreeScope) => `${nodeSeq}|${machine}`;

let entry: { value: OverrideMap; expiresAt: number } | null = null;
let inFlight: Promise<OverrideMap> | null = null;
let generation = 0;

async function load(): Promise<OverrideMap> {
  const rows = await prisma.equipmentProfile.findMany({
    // Cây chỉ cần tên/KKS; các ghi đè khác (ảnh/tài liệu) đọc ở màn hình chi tiết thiết bị.
    where: { OR: [{ name: { not: null } }, { kks: { not: null } }] },
    select: { nodeSeq: true, machine: true, name: true, kks: true },
  });
  const map: OverrideMap = new Map();
  for (const r of rows) {
    map.set(overrideKey(r.nodeSeq, r.machine as TreeScope), { name: r.name, kks: r.kks });
  }
  return map;
}

function getMap(): Promise<OverrideMap> {
  const now = Date.now();
  if (entry && entry.expiresAt > now) return Promise.resolve(entry.value);
  if (inFlight) return inFlight;
  const gen = generation;
  inFlight = load()
    .then((value) => {
      if (gen === generation) entry = { value, expiresAt: Date.now() + TTL_MS };
      return value;
    })
    .catch(() => new Map() as OverrideMap) // lỗi đọc ghi đè không được làm hỏng cả cây
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Hàm tra ghi đè cho một phạm vi. Trả `undefined` khi nút không có ghi đè (trường hợp
 * gần như luôn xảy ra) để phía gọi dùng thẳng dữ liệu node.
 */
export async function getProfileOverrides(scope: TreeScope) {
  const map = await getMap();
  return (nodeSeq: string): ProfileOverride | undefined => map.get(overrideKey(nodeSeq, scope));
}

export function invalidateEquipmentProfileCache() {
  generation++;
  entry = null;
  inFlight = null;
}
