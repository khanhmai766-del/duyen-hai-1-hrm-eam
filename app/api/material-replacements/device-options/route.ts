import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { canViewMaterialReplacement } from "@/lib/material-replacement-access";
import { resolvePositionViewScope } from "@/lib/position-data-scope";
import { materialCategoryMatches } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
import { positionsMatch } from "@/lib/position-catalog";

export const dynamic = "force-dynamic";

/**
 * THIẾT BỊ ĐÃ KHAI BÁO CHO MỘT VẬT TƯ + CƯƠNG VỊ — để gắn thiết bị cho dòng lịch sử
 * thay thế nhập từ sổ theo dõi.
 *
 * KHÁC với `/api/material-replacements/points`, đừng gộp hai cái làm một: endpoint kia
 * phục vụ việc RA PHIẾU nên chỉ trả điểm khai báo còn trống (`isActive=false`, chưa có
 * lịch sử). Ở đây người dùng đang gắn thiết bị cho một lần thay ĐÃ XẢY RA, nên điểm đã
 * dùng rồi vẫn phải chọn được — lọc như bên kia là danh sách trống rỗng đúng những
 * thiết bị hay thay nhất.
 *
 * Khoá lọc là TÊN VẬT TƯ chứ không phải materialId: dòng lưu trữ nhập từ Sheet phần lớn
 * không tra được materialId (danh mục Sheet rộng hơn Danh mục Vận Hành 1), tên lại là
 * thứ luôn có. So khớp qua normalizeText nên khác hoa thường/dấu vẫn ăn.
 *
 * HAI MỨC KHỚP, và phải theo đúng thứ tự này:
 *   1. `name`     — có điểm khai báo đúng tên vật tư ⇒ chỉ trả đúng những điểm đó.
 *   2. `category` — không có điểm nào trùng tên ⇒ nới ra cả Loại vật tư của cương vị đó.
 *
 * Mức 2 tồn tại vì chính lý do ở trên: sổ theo dõi ghi tên rộng hơn danh mục, khớp cứng
 * theo tên thì phần lớn dòng lưu trữ nhận danh sách RỖNG — đúng lúc cần gợi ý nhất. Danh
 * sách nới là để THAM KHẢO nên giao diện phải nói rõ đang ở mức nào, đừng để người dùng
 * tưởng thiết bị đang bày ra là khai báo của đúng vật tư đó.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const access = await resolveEquipmentAccessForUser(user);
    const viewScope = await resolvePositionViewScope(user, "replacement");
    const sp = req.nextUrl.searchParams;
    const machine = sp.get("machine")?.trim();
    const position = sp.get("position")?.trim();
    const materialId = sp.get("materialId")?.trim();
    const materialName = sp.get("materialName")?.trim();

    const category = sp.get("category")?.trim();

    // Thiếu cương vị thì tập kết quả trải cả nhà máy — vô nghĩa với một ô chọn thiết bị,
    // và tốn một lượt quét bảng.
    if (!position || (!materialId && !materialName && !category)) return ok({ scope: "none", options: [] });

    const rows = await prisma.materialReplacement.findMany({
      where: {
        deviceSeq: { not: null },
        ...(machine ? { machine } : {}),
        ...(materialId ? { materialId } : {}),
      },
      orderBy: [{ deviceSeq: "asc" }],
      select: {
        deviceSeq: true,
        machine: true,
        system: true,
        location: true,
        managingPosition: true,
        isActive: true,
        material: { select: { id: true, code: true, name: true, unit: true, category: true } },
        device: { select: { seq: true, name: true, parentSeq: true } },
      },
    });

    // Cùng cương vị + trong tầm xem: tập nền của cả hai mức khớp.
    const visible = rows.filter(
      (row) => positionsMatch(row.managingPosition, position) && canViewMaterialReplacement(access, row, viewScope)
    );

    const wantedName = materialId ? null : normalizeText(materialName ?? "");
    const byName = visible.filter((row) => (materialId ? true : !wantedName || normalizeText(row.material.name) === wantedName));
    const scope: "name" | "category" = byName.length > 0 || !category ? "name" : "category";
    const matched = scope === "name"
      ? byName
      : visible.filter((row) => materialCategoryMatches(row.material.category, category ?? ""));

    const parentSeqs = [...new Set(matched.map((row) => row.device?.parentSeq).filter(Boolean) as string[])];
    const parentNames = new Map<string, string>();
    if (parentSeqs.length > 0) {
      const parents = await prisma.equipmentNode.findMany({
        where: { seq: { in: parentSeqs } },
        select: { seq: true, name: true },
      });
      for (const parent of parents) parentNames.set(parent.seq, parent.name);
    }

    // Một thiết bị có thể được khai báo nhiều dòng (nhiều chu kỳ, nhiều lần khai lại);
    // ô chọn chỉ cần mỗi thiết bị một lần.
    const seen = new Set<string>();
    const options = [];
    for (const row of matched) {
      const seq = row.deviceSeq as string;
      if (seen.has(seq)) continue;
      seen.add(seq);
      options.push({
        deviceSeq: seq,
        deviceName: row.device?.name ?? row.location ?? seq,
        systemName: (row.device?.parentSeq ? parentNames.get(row.device.parentSeq) : null) ?? row.system ?? "",
        materialId: row.material.id,
        materialCode: row.material.code,
        materialName: row.material.name,
        machine: row.machine,
      });
    }
    return ok({ scope: options.length > 0 ? scope : "none", options });
  });
}
