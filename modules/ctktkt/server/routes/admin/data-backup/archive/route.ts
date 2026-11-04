import JSZip from "jszip";
import { requireAdmin } from "@/modules/ctktkt/lib/auth/server";
import { getRawDb, readBackupSnapshot } from "@/modules/ctktkt/db";
import { BACKUP_TABLES, backupSchemas, createDataBackup, type BackupRow } from "@/modules/ctktkt/lib/data-backup";
import { readBackupArchive, archiveSummary, archiveStatements, MAX_ARCHIVE_BYTES } from "@/modules/ctktkt/lib/backup-archive";

export async function POST(request: Request) {
  const guard = await requireAdmin(); if (!guard.ok) return guard.response;
  const form = await request.formData();
  const file = form.get("file"), action = form.get("action"), mode = form.get("mode");
  if (!(file instanceof File) || file.size > MAX_ARCHIVE_BYTES || !["preview", "restore"].includes(String(action)) || !["missing", "overwrite"].includes(String(mode))) {
    return Response.json({ error: "Gói sao lưu hoặc thao tác không hợp lệ." }, { status: 400 });
  }
  if (action === "restore" && form.get("confirmed") !== "true") return Response.json({ error: "Hãy xác nhận trước khi nạp dữ liệu." }, { status: 400 });
  let files, summary, statements;
  try {
    files = await readBackupArchive(Buffer.from(await file.arrayBuffer()));
    summary = archiveSummary(files);
    statements = archiveStatements(files, await backupSchemas(getRawDb()), mode as "missing" | "overwrite");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không đọc được gói sao lưu." }, { status: 400 });
  }
  if (action === "preview") return Response.json(summary);
  try {
    const result = await getRawDb().batch([...statements, { sql: "INSERT INTO data_restore_audit(actor_id,checksum,mode,row_count) VALUES(?,?,?,?)", args: [guard.user.id, summary.checksum, mode, summary.total] }]);
    const changed = result.slice(0, -1).reduce((sum, item) => sum + item.meta.changes, 0);
    return Response.json({ changed, total: summary.total, message: `Đã nạp ${changed.toLocaleString("vi-VN")} bản ghi từ ${files.length} tệp. Tải lại báo cáo để xem số liệu.` });
  } catch {
    return Response.json({ error: "Chưa nạp được gói sao lưu. Giao dịch lỗi được hoàn tác; hãy kiểm tra dữ liệu trước khi thử lại nếu mất kết nối." }, { status: 503 });
  }
}

export async function GET() {
  const guard = await requireAdmin(); if (!guard.ok) return guard.response;
  const data = await readBackupSnapshot(BACKUP_TABLES.map(table => ({ sql: `SELECT * FROM ${table.name} ORDER BY ${table.keys.join(",")} LIMIT 250001`, args: [] })));
  if (data.reduce((sum, rows) => sum + rows.length, 0) > 250_000) return Response.json({ error: "Dữ liệu vượt giới hạn gói. Hãy tải riêng theo khoảng ngày." }, { status: 400 });
  const zip = new JSZip();
  BACKUP_TABLES.forEach((table, index) => {
    for (let offset = 0; offset < data[index].length; offset += 1000) {
      const tables = Object.fromEntries(BACKUP_TABLES.map(item => [item.name, [] as BackupRow[]]));
      tables[table.name] = data[index].slice(offset, offset + 1000) as BackupRow[];
      zip.file(`${table.name}-${String(offset / 1000 + 1).padStart(4, "0")}.json`, JSON.stringify(createDataBackup(tables, null)));
    }
  });
  if (!Object.keys(zip.files).length) {
    const tables = Object.fromEntries(BACKUP_TABLES.map(table => [table.name, [] as BackupRow[]]));
    zip.file("du-lieu-trong.json", JSON.stringify(createDataBackup(tables, null)));
  }
  const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return new Response(new Uint8Array(body), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="ctktkt-backup-all-${new Date().toISOString().slice(0, 10)}.zip"`, "Cache-Control": "private, no-store" } });
}
