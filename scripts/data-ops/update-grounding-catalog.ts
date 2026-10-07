/** Mặc định chỉ lập phương án. --snapshot đọc JSON để đối chiếu production mà không ghi DB.
 * --apply cập nhật danh mục; --import-images nạp ảnh cho vị trí mới/import v2, không đụng ảnh cũ hoặc lịch sử.
 */
import { loadEnvConfig } from "@next/env";
import { readFile, writeFile } from "node:fs/promises";
import { readGroundingCatalogWorkbook } from "../../lib/server/grounding-catalog-workbook";
import { buildGroundingCatalogPlan, type SavedCatalogItem } from "../../lib/server/grounding-catalog-plan";

loadEnvConfig(process.cwd());
const args = process.argv.slice(2);
const option = (name: string) => args[args.indexOf(name) + 1];

async function main() {
  const file = args.includes("--file") ? option("--file") : undefined;
  if (!file) throw new Error("Thiếu --file dẫn tới danh sách Excel mới");
  const apply = args.includes("--apply");
  if (apply && args.includes("--snapshot")) throw new Error("Không áp dụng từ bản snapshot; phải đối chiếu DB hiện tại");
  const workbook = await readGroundingCatalogWorkbook(file);
  const { prisma } = await import("../../lib/prisma");
  try {
    const readCatalog = () => prisma.groundingLightningItem.findMany({ include: { points: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const saved: SavedCatalogItem[] = args.includes("--snapshot")
      ? JSON.parse(await readFile(option("--snapshot"), "utf8")) : await readCatalog();
    const plan = buildGroundingCatalogPlan(workbook.locations, saved);
    const photoEntries = plan.entries.filter((entry) => !entry.existingId || saved.find((item) => item.id === entry.existingId)?.sourceKey === entry.sourceKey)
      .map((entry) => ({ entry, imageIds: entry.incoming.rows.flatMap((row) => workbook.photos.get(`${entry.incoming.sheet}|${row}`) ?? []) }))
      .filter((row) => row.imageIds.length);
    console.log("Phương án cập nhật:", plan.summary);
    console.log("Vị trí mới có ảnh theo dòng:", photoEntries.length, "· Chỉ nạp khi có --apply --import-images");
    const bySheet = new Map<string, number>();
    for (const entry of plan.entries) bySheet.set(entry.incoming.sheet, (bySheet.get(entry.incoming.sheet) ?? 0) + 1);
    console.log("Vị trí theo sheet:", Object.fromEntries(bySheet));
    console.log("Giữ mỗi dòng trùng thành một vị trí riêng. Mục tổng được chuyển sang chỉ lưu lịch sử.");
    console.log("Mục đang có: giữ ID, kết quả, ghi chú, ảnh và xác nhận; chỉ thêm loại kiểm tra còn thiếu.");
    console.log("Mục mới: kết quả khởi tạo từ file, không tạo lượt xác nhận thay người vận hành.");
    if (args.includes("--out")) await writeFile(option("--out"), JSON.stringify({ ...plan, headings: workbook.headings }, null, 2));
    const unresolved = plan.entries.filter((entry) => !entry.existingId && !entry.incoming.points.length);
    if (unresolved.length) console.log("Cần xác định loại kiểm tra:", unresolved.map((entry) => `${entry.incoming.sheet}:${entry.incoming.rows} ${entry.incoming.areaEquipment}`));
    if (!apply) { console.log("Chỉ xem trước; chưa thay đổi dữ liệu."); return; }
    const databaseHost = new URL(process.env.DATABASE_URL ?? "").hostname;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseHost) && !args.includes("--allow-remote")) {
      throw new Error("Chỉ áp dụng trên DB local; DB ngoài máy yêu cầu --allow-remote và phê duyệt riêng");
    }
    if (unresolved.length) throw new Error("Chưa xác định đủ loại kiểm tra cho các vị trí mới; chưa ghi dữ liệu");
    if (args.includes("--import-images") && photoEntries.some((row) => row.imageIds.length !== 1 || (row.entry.incoming.points.filter((point) => point.status === "DEFECT").length !== 1 && row.entry.incoming.points.length !== 1))) {
      throw new Error("Có dòng ảnh chưa xác định duy nhất hạng mục hoặc có nhiều ảnh; cần đối chiếu trước khi nạp");
    }
    await prisma.$transaction(async (tx) => {
      const current = await tx.groundingLightningItem.findMany({ include: { points: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      const fresh = buildGroundingCatalogPlan(workbook.locations, current);
      if (JSON.stringify(fresh.summary) !== JSON.stringify(plan.summary) || JSON.stringify(fresh.entries.map((entry) => entry.existingId)) !== JSON.stringify(plan.entries.map((entry) => entry.existingId))) {
        throw new Error("Danh mục vừa thay đổi; hãy xem lại phương án trước khi áp dụng");
      }
      for (const entry of fresh.entries) {
        const row = entry.incoming;
        if (entry.existingId) {
          const previous = current.find((item) => item.id === entry.existingId)!;
          if ((entry.splitFromId && previous.splitFromId !== entry.splitFromId) || previous.machine !== entry.machine) {
            await tx.groundingLightningItem.update({ where: { id: previous.id }, data: { machine: entry.machine, ...(entry.splitFromId ? { splitFromId: entry.splitFromId } : {}), updatedAt: previous.updatedAt } });
          }
          // Không đổi tên/updatedAt của mục cũ để không làm mất hiệu lực lượt đã xác nhận.
          for (const point of row.points.filter((point) => entry.addedTypes.includes(point.type))) {
            await tx.groundingLightningPoint.create({ data: { itemId: entry.existingId, ...point } });
          }
        } else {
          await tx.groundingLightningItem.create({ data: {
            areaEquipment: row.areaEquipment, position: row.position, positionCode: row.positionCode,
            machine: entry.machine, sourceKey: entry.sourceKey, sourceSheet: row.sheet, sourceRow: row.rows[0],
            splitFromId: entry.splitFromId, note: row.note, points: { create: row.points },
          } });
        }
      }
      if (fresh.archiveIds.length) await tx.groundingLightningItem.updateMany({ where: { id: { in: fresh.archiveIds } }, data: { isActive: false } });
    }, { timeout: 120_000, isolationLevel: "Serializable" });
    console.log("Đã cập nhật danh mục theo phương án; lịch sử và ảnh cũ được giữ.");
    if (args.includes("--import-images")) {
      const { uploadImageBufferToS3, deleteS3ObjectByKey } = await import("../../lib/s3");
      let imported = 0, skipped = 0;
      for (const { entry, imageIds } of photoEntries) {
        const draft = entry.incoming.points.find((point) => point.status === "DEFECT") ?? entry.incoming.points[0];
        const point = await prisma.groundingLightningPoint.findFirst({
          where: { item: { sourceKey: entry.sourceKey, isActive: true }, type: draft.type }, include: { attachments: true },
        });
        // Không ghi đè ảnh hoặc tình trạng vừa được VHV cập nhật trong lúc nạp.
        if (!point || point.attachments.length || point.status !== draft.status || point.defectDescription !== draft.defectDescription) { skipped++; continue; }
        const media = workbook.getImage(imageIds[0]);
        const buffer = media?.buffer ? Buffer.from(media.buffer as unknown as Uint8Array) : media?.base64 ? Buffer.from(media.base64.replace(/^data:[^;]+;base64,/, ""), "base64") : null;
        if (!buffer) throw new Error(`Không đọc được ảnh ${entry.incoming.sheet}:${entry.incoming.rows[0]}`);
        const mimeType = media.extension === "jpeg" ? "image/jpeg" : media.extension === "gif" ? "image/gif" : "image/png";
        const uploaded = await uploadImageBufferToS3({ buffer, contentType: mimeType, folder: `grounding-lightning/${point.itemId}/imported`, preset: "image" });
        try {
          const attachment = await prisma.$transaction(async (tx) => {
            const current = await tx.groundingLightningPoint.findUniqueOrThrow({ where: { id: point.id }, include: { attachments: true, item: true } });
            if (!current.item.isActive || current.attachments.length || current.status !== point.status || current.updatedAt.getTime() !== point.updatedAt.getTime()) return null;
            return tx.groundingLightningAttachment.create({ data: { pointId: point.id, s3Key: uploaded.key,
              originalName: `${entry.incoming.sheet}-dong-${entry.incoming.rows[0]}.${media.extension}`, mimeType: "image/webp", bytes: buffer.length } });
          }, { isolationLevel: "Serializable" });
          if (!attachment) { await deleteS3ObjectByKey(uploaded.key); skipped++; } else imported++;
        } catch (error) { await deleteS3ObjectByKey(uploaded.key); throw error; }
      }
      console.log(`Đã nạp ${imported} ảnh vào vị trí mới; bỏ qua ${skipped} vị trí đã có ảnh hoặc được cập nhật. Không thêm lượt xác nhận.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
