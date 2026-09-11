BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tcms.schema_migrations
    WHERE version = '020_document_scanner_visibility'
  ) THEN
    RAISE EXCEPTION 'Migration 020_document_scanner_visibility was already applied';
  END IF;
END
$$;

DROP POLICY documents_select_policy ON tcms.documents;
CREATE POLICY documents_select_policy ON tcms.documents
FOR SELECT
USING (
  tcms.can_access_contract(contract_id)
  AND (
    (
      tcms.has_permission('document.read')
      AND malware_scan_status = 'CLEAN'
      AND archived_at IS NULL
    )
    OR (
      tcms.has_permission('document.upload')
      AND uploaded_by = current_setting('app.actor_id', true)
      AND malware_scan_status IN ('PENDING', 'ERROR')
    )
    OR tcms.has_permission('document.scan.update')
    OR tcms.has_permission('document.archive')
  )
);

INSERT INTO tcms.schema_migrations(version)
VALUES ('020_document_scanner_visibility');

COMMIT;
