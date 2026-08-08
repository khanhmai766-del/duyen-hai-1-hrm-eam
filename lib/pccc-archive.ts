/**
 * LƯU TRỮ KỲ PCCC TRÊN S3.
 *
 * Ràng buộc gốc của cả cơ chế tự động (xem lib/pccc-rollover.ts): **DB chỉ giữ 6 kỳ
 * gần nhất, file Excel trên S3 mới là bản lưu trữ dài hạn.** Vì vậy:
 *
 *  - Chốt kỳ mà chưa upload xong file thì KHÔNG được chốt — mất kỳ là mất luôn.
 *  - Danh sách file cho người dùng tải về đọc TỪ S3, không đọc từ DB: DB đã xoá kỳ cũ
 *    nhưng file vẫn còn, và đó chính là thứ người dùng cần khi tra lại tháng cũ.
 *  - File không bao giờ bị xoá tự động. Chỗ này là kho lưu trữ; quá hạn giữ trên web
 *    thì chỉ thôi liệt kê, không xoá (muốn dọn thì đặt lifecycle rule trên bucket).
 */
import { prisma } from "@/lib/prisma";
import { getS3ObjectBuffer, listS3Objects, uploadS3Object } from "@/lib/s3";
import { buildPcccWorkbook, type ExportSheet, type SignatureImages } from "@/lib/pccc-export-xlsx";
import { signaturesOf } from "@/lib/pccc-service";

const ALL_SHEETS: ExportSheet[] = ["BCC", "TCC", "FCD"];

export const PCCC_ARCHIVE_PREFIX = (process.env.PCCC_ARCHIVE_S3_PREFIX || "pccc/archive").replace(/^\/+|\/+$/g, "");

/** Số tháng bản lưu trữ được liệt kê cho người dùng tải lại. */
export const PCCC_ARCHIVE_LIST_MONTHS = 12;

const LABEL_PATTERN = /^T(0[1-9]|1[0-2])\.(\d{4})$/;

export function isPeriodLabel(value: string): boolean {
  return LABEL_PATTERN.test(value);
}

/** `T08.2026` → `pccc/archive/2026/PCCC-T08.2026.xlsx`. Chia theo năm cho dễ dò tay trên bucket. */
export function archiveKeyOf(label: string) {
  const match = LABEL_PATTERN.exec(label);
  if (!match) throw new Error(`Nhãn kỳ không hợp lệ: ${label}`);
  return `${PCCC_ARCHIVE_PREFIX}/${match[2]}/PCCC-${label}.xlsx`;
}

export function archiveFileNameOf(label: string) {
  return `PCCC-${label}.xlsx`;
}

/** Nhãn kỳ suy ngược từ key — dùng khi liệt kê S3, nơi DB không còn kỳ đó nữa. */
export function labelFromArchiveKey(key: string): string | null {
  const name = key.split("/").pop() ?? "";
  const match = /^PCCC-(T\d{2}\.\d{4})\.xlsx$/.exec(name);
  return match && isPeriodLabel(match[1]) ? match[1] : null;
}

/**
 * Tải ảnh chữ ký từ S3 cho các bản ký có trong file.
 *
 * Tải theo KEY DUY NHẤT chứ không theo dòng: cả kỳ thường chỉ vài người ký, mà tải theo
 * dòng thì 747 dòng là 747 lượt gọi S3 cho cùng một tấm ảnh.
 *
 * Một ảnh hỏng/mất trên S3 KHÔNG được làm hỏng cả lần xuất file — bỏ qua ảnh đó, cột chữ
 * ký vẫn còn tên và thời điểm ký.
 */
export async function loadSignatureImages(keys: (string | null | undefined)[]): Promise<SignatureImages> {
  const unique = [...new Set(keys.filter((k): k is string => Boolean(k)))];
  const images: SignatureImages = new Map();
  await Promise.all(
    unique.map(async (key) => {
      try {
        images.set(key, await getS3ObjectBuffer(key));
      } catch {
        // chữ ký thiếu trên S3 → để trống ô ảnh, không chặn xuất file
      }
    })
  );
  return images;
}

/**
 * Dựng workbook đầy đủ của một kỳ: LẤY TOÀN BỘ dữ liệu, không áp bộ lọc cương vị/tổ máy
 * như nút xuất trên web — bản lưu trữ phải là bản đầy đủ của tháng đó.
 */
export async function buildPeriodWorkbook(periodId: string, closing?: { closedAt: Date; closedBy: string }) {
  const period = await prisma.pcccPeriod.findUnique({ where: { id: periodId } });
  if (!period) throw new Error("Không tìm thấy kỳ để xuất");

  const [extinguishers, cabinets, bulks, panels, sigBcc, sigTcc, sigBulk] = await Promise.all([
    prisma.pcccExtinguisher.findMany({ where: { periodId }, orderBy: [{ stt: "asc" }, { ma: "asc" }] }),
    prisma.pcccCabinet.findMany({
      where: { periodId },
      orderBy: [{ stt: "asc" }, { ma: "asc" }],
      include: { components: { orderBy: [{ groupOrder: "asc" }, { statusOrder: "asc" }] } },
    }),
    prisma.pcccBulk.findMany({ where: { periodId }, orderBy: [{ stt: "asc" }, { ten: "asc" }] }),
    prisma.pcccFm200Panel.findMany({ where: { periodId }, orderBy: { panelKey: "asc" } }),
    signaturesOf(periodId, "EXTINGUISHER"),
    signaturesOf(periodId, "CABINET"),
    signaturesOf(periodId, "BULK"),
  ]);

  const signatureImages = await loadSignatureImages([
    ...[...sigBcc.values()].map((s) => s.signatureKey),
    ...[...sigTcc.values()].map((s) => s.signatureKey),
    ...[...sigBulk.values()].map((s) => s.signatureKey),
  ]);

  return buildPcccWorkbook(
    {
      periodLabel: period.label,
      signatureImages,
      extinguishers: extinguishers.map((r) => ({ ...r, signature: sigBcc.get(r.id) ?? null })),
      cabinets: cabinets.map((r) => ({ ...r, signature: sigTcc.get(r.id) ?? null })),
      bulks: bulks.map((r) => ({ ...r, signature: sigBulk.get(r.id) ?? null })),
      panels: panels.map((p) => ({
        ...p,
        mucValues: (p.mucValues ?? {}) as Record<string, number | null>,
        apValues: (p.apValues ?? {}) as Record<string, number | null>,
      })),
      closing: closing && {
        ...closing,
        soBinh: extinguishers.length,
        soTu: cabinets.length,
        soBon: bulks.length,
        soBangFm200: panels.length,
        soChuKy: sigBcc.size + sigTcc.size + sigBulk.size,
      },
    },
    ALL_SHEETS
  );
}

/** Xuất + đẩy lên S3. Trả về key và dung lượng để ghi lại vào kỳ. */
export async function uploadPeriodArchive(periodId: string, label: string, closing: { closedAt: Date; closedBy: string }) {
  const buffer = Buffer.from(await buildPeriodWorkbook(periodId, closing));
  const key = archiveKeyOf(label);
  await uploadS3Object({
    key,
    body: buffer,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    originalName: archiveFileNameOf(label),
  });
  return { key, bytes: buffer.byteLength };
}

export type PcccArchiveEntry = {
  label: string;
  key: string;
  bytes: number;
  archivedAt: string | null;
};

/**
 * Bản lưu trữ mới nhất trên S3, mới trước cũ sau. Cắt còn `months` mục — mặc định 12
 * tháng gần nhất, đúng phạm vi cho người dùng tra lại trên web.
 */
export async function listPcccArchives(months = PCCC_ARCHIVE_LIST_MONTHS): Promise<PcccArchiveEntry[]> {
  const objects = await listS3Objects(`${PCCC_ARCHIVE_PREFIX}/`).catch(() => []);
  return objects
    .flatMap((o) => {
      const label = labelFromArchiveKey(o.key);
      return label
        ? [{ label, key: o.key, bytes: o.size, archivedAt: o.lastModified ? o.lastModified.toISOString() : null }]
        : [];
    })
    // Sắp theo NHÃN KỲ, không theo ngày ghi tệp: chạy bù một kỳ cũ vẫn phải nằm đúng chỗ.
    .sort((a, b) => b.label.slice(4).localeCompare(a.label.slice(4)) || b.label.localeCompare(a.label))
    .slice(0, months);
}

export async function readPcccArchive(label: string) {
  if (!isPeriodLabel(label)) throw new Error(`Nhãn kỳ không hợp lệ: ${label}`);
  return getS3ObjectBuffer(archiveKeyOf(label));
}
