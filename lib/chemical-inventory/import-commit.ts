import type { Prisma, PrismaClient } from "@prisma/client";
import { RECONCILE_EPSILON } from "./constants";
import { toDecimal } from "./serialize";
import type { ImportPlan } from "./importer";

/**
 * Ghi kế hoạch import xuống DB trong MỘT transaction.
 *
 * Tách khỏi `importer.ts` để phần đọc/đối soát chạy được mà không cần cơ sở dữ liệu —
 * thử khô là thao tác hay dùng nhất và không nên đòi kết nối.
 *
 * Idempotent theo hai lớp:
 *   - `ChemicalReceipt.sourceKey` (duy nhất): nhập lại đúng tệp không sinh dòng mới
 *   - `ChemicalStockReading` khóa (itemId, positionCode, readDate, kind): upsert
 */

/**
 * Gộp biển số của hai nguồn cho cùng một chuyến xe.
 *
 * Sổ Excel hay ghi tắt (chỉ vài chữ số cuối), bản ghi tận nơi thường đủ hơn — nên
 * giữ bản ĐẦY ĐỦ HƠN. Nếu bên này là phần đuôi của bên kia thì coi như cùng một
 * biển; khác hẳn nhau thì gắn cờ cho người dùng đối chiếu, KHÔNG tự chọn hộ.
 */
function mergeVehicleNumber(
  existing: string | null,
  incoming: string | null
): { vehicleNumber: string | null; conflict: boolean } {
  if (!existing) return { vehicleNumber: incoming, conflict: false };
  if (!incoming) return { vehicleNumber: existing, conflict: false };
  if (existing === incoming) return { vehicleNumber: existing, conflict: false };
  if (existing.endsWith(incoming)) return { vehicleNumber: existing, conflict: false };
  if (incoming.endsWith(existing)) return { vehicleNumber: incoming, conflict: false };
  return {
    vehicleNumber: existing.length >= incoming.length ? existing : incoming,
    conflict: true,
  };
}

/**
 * Cảnh báo của một phiếu phải suy từ TRẠNG THÁI CUỐI CÙNG, không cộng dồn.
 * Sau khi gộp hai nguồn, phiếu có thể đã đủ hai số cân — giữ lại MISSING_WEIGHT
 * lúc đó là bày ra một cảnh báo không còn đúng nữa.
 */
function finalWarnings(
  incoming: string[],
  plantWeight: unknown,
  contractorWeight: unknown,
  vehicleConflict: boolean
): string[] {
  const warnings = new Set(incoming);
  if (plantWeight !== null && contractorWeight !== null) warnings.delete("MISSING_WEIGHT");
  else warnings.add("MISSING_WEIGHT");
  if (vehicleConflict) warnings.add("VEHICLE_CONFLICT");
  else warnings.delete("VEHICLE_CONFLICT");
  return [...warnings];
}

export type CommitResult = {
  batchId: string;
  periodsUpserted: number;
  readingsUpserted: number;
  receiptsCreated: number;
  receiptsUpdated: number;
  receiptsLinked: number;
  contractsUpserted: number;
  itemsUpdated: number;
};

export async function commitImportPlan(
  prisma: PrismaClient,
  plan: ImportPlan,
  createdById: string
): Promise<CommitResult> {
  const items = await prisma.chemicalInventoryItem.findMany({ select: { id: true, code: true } });
  const itemIdByCode = new Map(items.map((i) => [i.code, i.id]));

  const missing = [
    ...new Set([
      ...plan.readings.map((r) => r.itemCode),
      ...plan.receipts.map((r) => r.itemCode),
      ...plan.contracts.map((c) => c.itemCode),
    ]),
  ].filter((code) => !itemIdByCode.has(code));

  if (missing.length > 0) {
    throw new Error(
      `Danh mục thiếu các mặt hàng: ${missing.join(", ")}. Chạy scripts/seed-chemical-inventory.ts trước.`
    );
  }

  const result: CommitResult = {
    batchId: "",
    periodsUpserted: 0,
    readingsUpserted: 0,
    receiptsCreated: 0,
    receiptsUpdated: 0,
    receiptsLinked: 0,
    contractsUpserted: 0,
    itemsUpdated: 0,
  };

  await prisma.$transaction(
    async (tx) => {
      // --- Mã vật tư ERP lấy từ tab hợp đồng, dùng chung cho mọi năm -------
      for (const [itemCode, materialCode] of Object.entries(plan.itemMaterialCodes)) {
        const id = itemIdByCode.get(itemCode);
        if (!id) continue;
        await tx.chemicalInventoryItem.update({ where: { id }, data: { materialCode } });
        result.itemsUpdated += 1;
      }

      // --- Kỳ ---------------------------------------------------------------
      const periodIdByKey = new Map<string, string>();
      for (const period of plan.periods) {
        const row = await tx.chemicalInventoryPeriod.upsert({
          where: { periodKey: period.periodKey },
          // KHÔNG động vào status: kỳ đã khóa thì import không được tự mở ra.
          update: { isSeed: period.isSeed, note: period.note },
          create: { periodKey: period.periodKey, isSeed: period.isSeed, note: period.note, status: "DRAFT" },
        });
        periodIdByKey.set(period.periodKey, row.id);
        result.periodsUpserted += 1;
      }

      // --- Bản đọc tồn cuối tháng -------------------------------------------
      for (const reading of plan.readings) {
        const itemId = itemIdByCode.get(reading.itemCode)!;
        const periodId = periodIdByKey.get(reading.periodKey);
        if (!periodId) continue;
        const readDate = new Date(reading.readDateIso);

        await tx.chemicalStockReading.upsert({
          where: {
            itemId_positionCode_readDate_kind: {
              itemId,
              positionCode: reading.positionCode,
              readDate,
              kind: "MONTH_END",
            },
          },
          update: {
            quantity: toDecimal(reading.quantity),
            rawText: reading.rawText,
            source: "SHEET_IMPORT",
            periodId,
            periodKey: reading.periodKey,
          },
          create: {
            periodId,
            periodKey: reading.periodKey,
            itemId,
            positionCode: reading.positionCode,
            readDate,
            kind: "MONTH_END",
            quantity: toDecimal(reading.quantity),
            rawText: reading.rawText,
            source: "SHEET_IMPORT",
          },
        });
        result.readingsUpserted += 1;
      }

      // --- Phiếu nhập -------------------------------------------------------
      for (const receipt of plan.receipts) {
        const itemId = itemIdByCode.get(receipt.itemCode)!;
        const receivedAt = new Date(receipt.receivedAtIso);
        const accepted = toDecimal(receipt.acceptedWeight)!;

        const data = {
          periodKey: receipt.periodKey,
          vehicleNumber: receipt.vehicleNumber,
          vehicleRef: receipt.vehicleRef,
          plantWeight: toDecimal(receipt.plantWeight),
          contractorWeight: toDecimal(receipt.contractorWeight),
          acceptedWeight: accepted,
          receivingPosition: receipt.receivingPosition,
          receivingPositionRaw: receipt.receivingPositionRaw,
          sourceSheet: receipt.sheet,
          sourceRow: receipt.row,
          warnings: receipt.warnings,
        };

        // 1) Đã nhập từ chính tệp này rồi → cập nhật tại chỗ.
        const bySourceKey = await tx.chemicalReceipt.findUnique({ where: { sourceKey: receipt.sourceKey } });
        if (bySourceKey) {
          // Không ghi đè biển số đầy đủ bằng bản ghi tắt của sổ: nhập lại lần hai
          // mà làm mất thông tin thì tính idempotent chỉ đúng trên số lượng dòng.
          const merged = mergeVehicleNumber(bySourceKey.vehicleNumber, receipt.vehicleNumber);
          await tx.chemicalReceipt.update({
            where: { id: bySourceKey.id },
            data: {
              ...data,
              vehicleNumber: merged.vehicleNumber,
              warnings: finalWarnings(receipt.warnings, data.plantWeight, data.contractorWeight, merged.conflict),
            },
          });
          result.receiptsUpdated += 1;
          continue;
        }

        // 2) Chuyến xe này có thể đã được ghi từ CỬA KHÁC (nhật ký ngày hoặc phiếu
        //    vật tư). Không dò theo biển số được: sổ Excel ghi "mã xe" 3 chữ số
        //    KHÔNG phải biển số — đối chiếu tháng 07/2026 cho thấy cùng một mã ứng
        //    với hai xe khác nhau ở hai ngày khác nhau. Dò theo (ngày + khối lượng),
        //    cặp này khớp tuyệt đối 17/17 chuyến khi đối chiếu thử.
        const sameDay = await tx.chemicalReceipt.findMany({
          where: { itemId, receivedAt, sourceKey: null },
        });
        const twin = sameDay.find(
          (row) => Math.abs(row.acceptedWeight.toNumber() - receipt.acceptedWeight) < RECONCILE_EPSILON
        );

        if (twin) {
          const merged = mergeVehicleNumber(twin.vehicleNumber, receipt.vehicleNumber);
          await tx.chemicalReceipt.update({
            where: { id: twin.id },
            data: {
              ...data,
              sourceKey: receipt.sourceKey,
              vehicleNumber: merged.vehicleNumber,
              warnings: finalWarnings(
                [...twin.warnings, ...receipt.warnings],
                data.plantWeight,
                data.contractorWeight,
                merged.conflict
              ),
            },
          });
          result.receiptsLinked += 1;
          continue;
        }

        await tx.chemicalReceipt.create({
          data: {
            ...data,
            itemId,
            receivedAt,
            sourceKey: receipt.sourceKey,
            source: "SHEET_IMPORT",
            createdById,
          },
        });
        result.receiptsCreated += 1;
      }

      // --- Hợp đồng ---------------------------------------------------------
      for (const contract of plan.contracts) {
        const itemId = itemIdByCode.get(contract.itemCode)!;
        await tx.chemicalContract.upsert({
          where: { year_itemId: { year: contract.year, itemId } },
          update: {
            materialCode: contract.materialCode,
            supplier: contract.supplier,
            origin: contract.origin,
            contractQuantity: toDecimal(contract.contractQuantity)!,
            forecastDemand: toDecimal(contract.forecastDemand)!,
          },
          create: {
            year: contract.year,
            itemId,
            materialCode: contract.materialCode,
            supplier: contract.supplier,
            origin: contract.origin,
            contractQuantity: toDecimal(contract.contractQuantity)!,
            forecastDemand: toDecimal(contract.forecastDemand)!,
          },
        });
        result.contractsUpserted += 1;
      }

      // --- Lô import --------------------------------------------------------
      const batch = await tx.chemicalImportBatch.create({
        data: {
          fileName: plan.fileName,
          fileHash: plan.fileHash,
          status: "COMMITTED",
          importedRows: result.receiptsCreated + result.readingsUpserted,
          updatedRows: result.receiptsUpdated + result.receiptsLinked,
          skippedRows: plan.bySheet.reduce((s, x) => s + x.rowsSkipped, 0),
          errorRows: plan.bySheet.reduce((s, x) => s + x.rowsError, 0),
          detail: {
            bySheet: plan.bySheet,
            issues: plan.issues,
            reconcile: plan.reconcile.filter((r) => !r.ok),
          } as unknown as Prisma.InputJsonValue,
          createdById,
        },
      });
      result.batchId = batch.id;
    },
    { timeout: 180_000, maxWait: 30_000 }
  );

  return result;
}
