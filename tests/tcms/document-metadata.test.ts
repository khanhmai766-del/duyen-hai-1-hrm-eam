import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("document migration keeps new metadata immutable and applies least privilege", async () => {
  const [metadataSql, scannerSql] = await Promise.all([
    readFile(
      new URL("../../prisma/manual/tcms/019_document_metadata_google_drive.sql", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../../prisma/manual/tcms/020_document_scanner_visibility.sql", import.meta.url),
      "utf8"
    ),
  ]);

  assert.match(metadataSql, /NEW\.drive_parent_folder_id IS DISTINCT FROM OLD\.drive_parent_folder_id/);
  assert.match(metadataSql, /NEW\.drive_web_url IS DISTINCT FROM OLD\.drive_web_url/);
  assert.match(metadataSql, /GRANT SELECT,INSERT,UPDATE ON tcms\.documents TO tcms_app_runtime/);
  assert.doesNotMatch(metadataSql, /GRANT ALL/);
  assert.match(scannerSql, /malware_scan_status = 'CLEAN'/);
  assert.match(scannerSql, /uploaded_by = current_setting\('app\.actor_id', true\)/);
  assert.match(scannerSql, /tcms\.has_permission\('document\.scan\.update'\)/);
});

test("document API is server authorized and does not implement unsafe upload", async () => {
  const route = await readFile(
    new URL("../../app/api/tcms/documents/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(route, /requireRolePermission\(context\.principal,"document\.read"\)/);
  assert.match(route, /withSecurityTransaction/);
  assert.match(route, /TCMS_CLAMSCAN_PATH/);
  assert.doesNotMatch(route, /export async function POST/);
});

test("document links are derived from the Drive file id", async () => {
  const repository = await readFile(
    new URL("../../lib/tcms/server/documents/postgres-document-repository.ts", import.meta.url),
    "utf8"
  );

  assert.match(repository, /https:\/\/drive\.google\.com\/file\/d\/\$\{encodeURIComponent\(value\)\}\/view/);
});
