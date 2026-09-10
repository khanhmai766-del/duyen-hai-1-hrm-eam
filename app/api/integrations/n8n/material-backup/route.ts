import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { verifyN8nMaterialTicketToken } from "@/lib/material-ticket-n8n-sync";
import { BACKUP_SCOPES, readBackupChanges, readBackupSnapshot, type BackupScope } from "@/lib/material-backup-sync";

export const dynamic = "force-dynamic";

// API đọc dành riêng cho bản dự phòng, không chạy cơ chế tự dọn hồ sơ.
export async function GET(req: NextRequest) {
  return handle(async () => {
    if (!verifyN8nMaterialTicketToken(req.headers.get("authorization"))) {
      return fail("Không có quyền đồng bộ dự phòng vật tư", 401);
    }
    const scope = req.nextUrl.searchParams.get("scope");
    if (!BACKUP_SCOPES.includes(scope as BackupScope)) {
      return fail("Phạm vi đồng bộ phải là materials, chemicals hoặc receipts", 400);
    }
    const sp = req.nextUrl.searchParams;
    const since = sp.get("updatedAfter");
    if (since && (!Number.isFinite(Date.parse(since)) || Date.parse(since) > Date.now())) {
      return fail("Mốc đồng bộ không hợp lệ", 400);
    }
    const snapshot = sp.get("mode") === "incremental"
      ? await readBackupChanges(prisma, scope as BackupScope, since ? new Date(since) : null, sp.get("reconcile") === "true")
      : await readBackupSnapshot(prisma, scope as BackupScope);
    const response = ok(snapshot.rows, snapshot.meta);
    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}
