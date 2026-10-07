import { createHash } from "node:crypto";
import { catalogNameKey, type CatalogLocation } from "@/lib/server/grounding-catalog-workbook";

export type SavedCatalogItem = {
  id: string; areaEquipment: string; positionCode: string | null; machine: string;
  sourceKey: string | null; isActive?: boolean; splitFromId?: string | null; points: Array<{ type: string; status: string }>;
};
export type CatalogPlanEntry = {
  incoming: CatalogLocation; existingId: string | null; splitFromId: string | null;
  sourceKey: string; machine: string; addedTypes: string[];
};

function aliasKey(name: string, code: string | null) {
  let key = catalogNameKey(name);
  if (code === "TURBINE_ASSISTANT") {
    key = key.replace(/\btuabine?\b/g, "tuabin").replace(/\s+s[12]$/, "");
    if (/^tiep dia (cos )?24\s*m$/.test(key)) key = "tiep dia cos 24 m";
  }
  return key;
}

/** Mã theo tên/nhóm + thứ tự dòng trùng, không dùng số dòng làm khoá nhận diện duy nhất. */
export function buildGroundingCatalogPlan(locations: CatalogLocation[], saved: SavedCatalogItem[]) {
  const active = saved.filter((item) => item.isActive !== false);
  const keyOf = (row: { positionCode: string | null; machine: string; areaEquipment: string }) => `${row.positionCode}|${row.machine}|${aliasKey(row.areaEquipment, row.positionCode)}`;
  const occurrences = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const row of locations) counts.set(keyOf(row), (counts.get(keyOf(row)) ?? 0) + 1);
  const used = new Set<string>();
  const archiveIds = new Set<string>();
  const entries: CatalogPlanEntry[] = [];
  for (const incoming of locations) {
    const key = keyOf(incoming);
    const ordinal = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, ordinal);
    const sourceKey = `grounding-location-v2|${createHash("sha256").update(`${key}|${ordinal}`).digest("hex").slice(0, 40)}`;
    const imported = active.find((item) => item.sourceKey === sourceKey);
    let existing = imported
      ?? active.find((item) => !used.has(item.id) && item.positionCode === incoming.positionCode && item.machine === incoming.machine && catalogNameKey(item.areaEquipment) === catalogNameKey(incoming.areaEquipment))
      ?? active.find((item) => !used.has(item.id) && keyOf(item) === key);
    if (!existing) {
      const candidates = active.filter((item) => !used.has(item.id) && item.positionCode === incoming.positionCode && aliasKey(item.areaEquipment, item.positionCode) === aliasKey(incoming.areaEquipment, incoming.positionCode));
      if (candidates.length === 1 && (!incoming.machineExplicit || candidates[0].machine === "COMMON")) existing = candidates[0];
    }
    let parentName = incoming.parentName;
    if (!parentName && incoming.positionCode === "ASH_HANDLING" && incoming.machine === "S2") {
      const name = catalogNameKey(incoming.areaEquipment);
      if (/^bom nuoc dong [ab] ho bun xi s2$/.test(name)) parentName = "Bơm nước đọng hố bùn xỉ S2";
    }
    const existingParentId = existing?.splitFromId;
    let parent = existingParentId ? saved.find((item) => item.id === existingParentId) : parentName ? saved.find((item) => item.positionCode === incoming.positionCode && item.machine === incoming.machine && catalogNameKey(item.areaEquipment) === catalogNameKey(parentName)) : undefined;
    // Một mục cũ gom nhiều dòng cùng tên: giữ nó làm lịch sử, tạo riêng tất cả vị trí nhỏ.
    if (!imported && (counts.get(key) ?? 0) > 1 && existing && !existing.sourceKey?.startsWith("grounding-location-v2|")) {
      parent = existing;
      existing = undefined;
    }
    if (!existing && !parent && (counts.get(key) ?? 0) > 1) {
      parent = saved.find((item) => keyOf(item) === key && !item.sourceKey?.startsWith("grounding-location-v2|"));
    }
    if (existing && !parent && (counts.get(key) ?? 0) === 1 && incoming.positionCode === "TURBINE_ASSISTANT") {
      const existingId = existing.id;
      parent = active.find((item) => item.id !== existingId && !used.has(item.id) && keyOf(item) === key);
    }
    if (parent && parent.id !== existing?.id && parent.isActive !== false) archiveIds.add(parent.id);
    if (existing) used.add(existing.id);
    entries.push({ incoming, sourceKey, existingId: existing?.id ?? null, splitFromId: parent?.id ?? null,
      machine: existing && !(incoming.machineExplicit && existing.machine === "COMMON" && incoming.machine !== "COMMON") ? existing.machine : incoming.machine,
      addedTypes: incoming.points.filter((point) => !existing?.points.some((savedPoint) => savedPoint.type === point.type)).map((point) => point.type),
    });
  }
  const retireGroups = archiveIds.size;
  const untouched = active.filter((item) => !used.has(item.id) && !archiveIds.has(item.id));
  for (const item of untouched) archiveIds.add(item.id);
  return {
    entries, archiveIds: [...archiveIds], untouched,
    summary: {
      workbookLocations: locations.length, currentActive: active.length,
      reuse: entries.filter((entry) => entry.existingId).length,
      create: entries.filter((entry) => !entry.existingId).length,
      retireGroups, retireOutsideWorkbook: untouched.length, retireTotal: archiveIds.size, keepOutsideWorkbook: 0,
      activeAfter: active.length - archiveIds.size + entries.filter((entry) => !entry.existingId).length,
    },
  };
}
