import type { KtktTx } from "../db/prisma";

/** Kết quả một ngày PPA (chuỗi như cột trong bảng) + ghi chú đánh giá hai tổ máy. */
export type PpaDayRecord = {
  operatingDate: string; sourceData: string; sourceFiles: string;
  grossS1Kwh: string; netS1Kwh: string; grossS2Kwh: string; netS2Kwh: string;
  ppaPlant: string; ppaS1: string; ppaS2: string; noteS1: string; noteS2: string;
};

/**
 * Thêm/ghi đè số liệu PPA một ngày (bản Prisma của `INSERT … ON CONFLICT(operating_date) DO UPDATE` cũ):
 * ghi đè toàn bộ số đo + kết quả; ghi chú gửi lên RỖNG thì giữ ghi chú đang có (CASE WHEN excluded.note = '' …).
 */
export async function upsertPpaDay(tx: KtktTx, record: PpaDayRecord, updatedAt: string) {
  const values = {
    source_data: record.sourceData, source_files: record.sourceFiles,
    gross_s1_kwh: record.grossS1Kwh, net_s1_kwh: record.netS1Kwh, gross_s2_kwh: record.grossS2Kwh, net_s2_kwh: record.netS2Kwh,
    ppa_plant: record.ppaPlant, ppa_s1: record.ppaS1, ppa_s2: record.ppaS2,
  };
  const existing = await tx.ctktktPpaHeatRateDaily.findUnique({ where: { operating_date: record.operatingDate }, select: { note_s1: true, note_s2: true } });
  if (!existing) {
    await tx.ctktktPpaHeatRateDaily.create({ data: { operating_date: record.operatingDate, ...values, note_s1: record.noteS1, note_s2: record.noteS2 } });
    return;
  }
  await tx.ctktktPpaHeatRateDaily.update({
    where: { operating_date: record.operatingDate },
    data: { ...values, note_s1: record.noteS1 === "" ? existing.note_s1 : record.noteS1, note_s2: record.noteS2 === "" ? existing.note_s2 : record.noteS2, updated_at: updatedAt },
  });
}
