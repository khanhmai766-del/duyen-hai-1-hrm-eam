import { fromBuffer } from "yauzl";
import { createHash } from "node:crypto";
import { BACKUP_TABLES, MAX_BACKUP_BYTES, validateDataBackup, restoreStatements, type DataBackup, type BackupColumn } from "./data-backup";
import type { Statement } from "../db";

export const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_ROWS = 250_000;

/** Đọc có giới hạn từng stream; không giải nén tệp ra đĩa hoặc tin kích thước trong ZIP. */
export async function readBackupArchive(buffer: Buffer): Promise<DataBackup[]> {
  if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error("Gói sao lưu vượt 25 MB.");
  return new Promise((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) { reject(new Error("Gói ZIP không hợp lệ.")); return; }
      const files: DataBackup[] = [];
      const names = new Set<string>();
      let expanded = 0, entries = 0;
      const stop = (error: unknown) => { zip.close(); reject(error); };
      zip.on("error", stop);
      zip.on("end", () => {
        if (!files.length) reject(new Error("Gói ZIP không có tệp sao lưu JSON."));
        else resolve(files);
      });
      zip.on("entry", entry => {
        if (++entries > 500 || entry.uncompressedSize > MAX_BACKUP_BYTES ||
          expanded + entry.uncompressedSize > MAX_EXPANDED_BYTES ||
          entry.fileName.split(/[\\/]/).includes("..") || names.has(entry.fileName)) {
          stop(new Error("Gói sao lưu có tệp trùng, đường dẫn hoặc dung lượng không hợp lệ.")); return;
        }
        names.add(entry.fileName);
        if (!entry.fileName.endsWith(".json")) { expanded += entry.uncompressedSize; zip.readEntry(); return; }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) { stop(new Error("Không đọc được tệp trong ZIP.")); return; }
          const chunks: Buffer[] = []; let size = 0;
          stream.on("error", stop);
          stream.on("data", (chunk: Buffer) => {
            size += chunk.length; expanded += chunk.length;
            if (size > MAX_BACKUP_BYTES || expanded > MAX_EXPANDED_BYTES) {
              stream.destroy(); stop(new Error("Dữ liệu giải nén vượt giới hạn.")); return;
            }
            chunks.push(chunk);
          });
          stream.on("end", () => {
            try { files.push(validateDataBackup(JSON.parse(Buffer.concat(chunks).toString("utf8")))); zip.readEntry(); }
            catch { stop(new Error(`Tệp ${entry.fileName} hỏng, sai checksum hoặc không đúng định dạng sao lưu.`)); }
          });
        });
      });
      zip.readEntry();
    });
  });
}

/** Kiểm tra trùng khoá xuyên các phần, trước khi tạo bất kỳ câu ghi nào. */
export function archiveSummary(files: DataBackup[]) {
  let total = 0;
  const tables = BACKUP_TABLES.map(table => {
    const keys = new Set<string>();
    let count = 0;
    for (const file of files) for (const row of file.tables[table.name]) {
      const key = JSON.stringify(table.keys.map(column => row[column]));
      if (keys.has(key)) throw new Error(`Gói có bản ghi trùng khoá trong ${table.label}.`);
      keys.add(key); count++; total++;
      if (total > MAX_ARCHIVE_ROWS) throw new Error("Gói vượt 250.000 bản ghi.");
    }
    return { name: table.name, label: table.label, count };
  });
  return { createdAt: files[0].createdAt, range: null, tables, total, files: files.length,
    checksum: createHash("sha256").update(files.map(file => file.checksum).join("\n")).digest("hex") };
}

export function archiveStatements(files: DataBackup[], schemas: Map<string, BackupColumn[]>, mode: "missing" | "overwrite"): Statement[] {
  archiveSummary(files);
  return files.flatMap(file => restoreStatements(file, schemas, mode));
}
