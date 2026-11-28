import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { materialCategoryMatches } from "@/lib/constants";

type Db = Pick<Prisma.TransactionClient, "material">;

/**
 * Chuẩn hoá danh sách dầu thay thế của một điểm: bỏ trùng và bỏ chính loại chính; mỗi loại
 * phải tồn tại, là dầu bôi trơn và cùng tổ máy với loại chính (phiếu vật tư lọc theo tổ máy).
 */
export async function normalizeAlternateMaterialIds(
  db: Db,
  main: { id: string; machine: string },
  input: unknown,
): Promise<string[]> {
  if (input == null) return [];
  if (!Array.isArray(input)) throw fail("Danh sách dầu thay thế không hợp lệ");
  const ids = [...new Set(input.map((id) => String(id ?? "").trim()).filter((id) => id && id !== main.id))];
  if (!ids.length) return [];
  const found = await db.material.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, category: true, machine: true } });
  for (const id of ids) {
    const material = found.find((item) => item.id === id);
    if (!material) throw fail("Không tìm thấy dầu thay thế đã chọn", 404);
    if (!materialCategoryMatches(material.category, "Dầu bôi trơn")) throw fail(`"${material.name}" không phải dầu bôi trơn`);
    if (material.machine !== main.machine) throw fail(`"${material.name}" khác tổ máy với dầu chính`);
  }
  return ids;
}

/** Điều kiện chọn các điểm phục vụ một vật tư: vật tư là loại chính HOẶC một dầu thay thế của điểm. */
export const replacementPointsOfMaterial = (materialId: string) => ({
  OR: [{ materialId }, { alternateMaterialIds: { has: materialId } }],
});
