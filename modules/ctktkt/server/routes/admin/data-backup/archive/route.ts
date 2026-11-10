import JSZip from "jszip";
import { ok, fail } from "@/lib/api";
import { requirePermission } from "@/modules/ctktkt/lib/auth/server";
import { BACKUP_TABLES, createDataBackup, type BackupRow } from "@/modules/ctktkt/lib/data-backup";
import { loadBackupSchemas, readBackupTables, restoreBackup } from "@/modules/ctktkt/lib/data-backup-store";
import { readBackupArchive, archiveSummary, archiveStatements, MAX_ARCHIVE_BYTES } from "@/modules/ctktkt/lib/backup-archive";
import { rethrowKtktServerFault } from "@/modules/ctktkt/server/server-fault";

export async function POST(request: Request) {
  const guard = await requirePermission("restore_data"); if (!guard.ok) return guard.response;
  const form = await request.formData();
  const file = form.get("file"), action = form.get("action"), mode = form.get("mode");
  if (!(file instanceof File) || file.size > MAX_ARCHIVE_BYTES || !["preview", "restore"].includes(String(action)) || !["missing", "overwrite"].includes(String(mode))) {
    return fail("Gói sao lưu hoặc thao tác không hợp lệ.", 400);
  }
  if (action === "restore" && form.get("confirmed") !== "true") return fail("Hãy xác nhận trước khi nạp dữ liệu.", 400);
  let files, summary, statements;
  try {
    files = await readBackupArchive(Buffer.from(await file.arrayBuffer()));
    summary = archiveSummary(files);
    statements = archiveStatements(files, await loadBackupSchemas(), mode as "missing" | "overwrite");
  } catch (error) {
    rethrowKtktServerFault(error);
    return fail(error instanceof Error ? error.message : "Không đọc được gói sao lưu.", 400);
  }
  if (action === "preview") return ok(summary);
  if(guard.user.role!=="admin"&&files.some(part=>(part.tables.daily_inputs||[]).some(row=>String(row.field_code||"").startsWith("KTKT:"))))return fail("Chỉ tài khoản quản trị được nạp gói chứa số liệu Báo cáo KTKT. Người nhập phải gửi yêu cầu chỉnh sửa để duyệt.", 403);
  try {
    const changed = await restoreBackup(statements, { actorId: String(guard.user.id), checksum: summary.checksum, mode: String(mode), rowCount: summary.total });
    return ok({ changed, total: summary.total, message: `Đã nạp ${changed.toLocaleString("vi-VN")} bản ghi từ ${files.length} tệp. Tải lại báo cáo để xem số liệu.` });
  } catch {
    return fail("Chưa nạp được gói sao lưu. Giao dịch lỗi được hoàn tác; hãy kiểm tra dữ liệu trước khi thử lại nếu mất kết nối.", 503);
  }
}

export async function GET() {
  const guard = await requirePermission("backup_data"); if (!guard.ok) return guard.response;
  const data = await readBackupTables(BACKUP_TABLES, null, 250_001);
  if (data.reduce((sum, rows) => sum + rows.length, 0) > 250_000) return fail("Dữ liệu vượt giới hạn gói. Hãy tải riêng theo khoảng ngày.", 400);
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
