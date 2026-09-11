BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM tcms.schema_migrations WHERE version='019_document_metadata_google_drive') THEN RAISE EXCEPTION 'Migration 019_document_metadata_google_drive was already applied';END IF;END $$;
ALTER TABLE tcms.documents
  ADD COLUMN document_type text NOT NULL DEFAULT 'OTHER'
    CHECK(document_type IN ('CONTRACT','LEGAL','TECHNICAL','DRAWING','INSPECTION','ACCEPTANCE','PAYMENT','OTHER')),
  ADD COLUMN reference_number text,
  ADD COLUMN document_date date,
  ADD COLUMN description text,
  ADD COLUMN drive_parent_folder_id text,
  ADD COLUMN drive_web_url text;
CREATE INDEX documents_type_date_idx ON tcms.documents(contract_id,document_type,document_date DESC) WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION tcms.validate_document_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    NEW.contract_id IS DISTINCT FROM OLD.contract_id
    OR NEW.display_name IS DISTINCT FROM OLD.display_name
    OR NEW.media_type IS DISTINCT FROM OLD.media_type
    OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
    OR NEW.sha256_hex IS DISTINCT FROM OLD.sha256_hex
    OR NEW.storage_object_id IS DISTINCT FROM OLD.storage_object_id
    OR NEW.encryption_key_version IS DISTINCT FROM OLD.encryption_key_version
    OR NEW.document_type IS DISTINCT FROM OLD.document_type
    OR NEW.reference_number IS DISTINCT FROM OLD.reference_number
    OR NEW.document_date IS DISTINCT FROM OLD.document_date
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.drive_parent_folder_id IS DISTINCT FROM OLD.drive_parent_folder_id
    OR NEW.drive_web_url IS DISTINCT FROM OLD.drive_web_url
    OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
    OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at
  ) THEN
    RAISE EXCEPTION 'immutable document metadata cannot be changed';
  END IF;

  IF (
    NEW.malware_scan_status IS DISTINCT FROM OLD.malware_scan_status
    OR NEW.malware_scanned_at IS DISTINCT FROM OLD.malware_scanned_at
  ) AND NOT tcms.has_permission('document.scan.update') THEN
    RAISE EXCEPTION 'document.scan.update permission is required';
  END IF;

  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at
     AND NOT tcms.has_permission('document.archive') THEN
    RAISE EXCEPTION 'document.archive permission is required';
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY documents_select_policy ON tcms.documents;
CREATE POLICY documents_select_policy ON tcms.documents FOR SELECT USING(tcms.can_access_contract(contract_id) AND ((tcms.has_permission('document.read') AND malware_scan_status='CLEAN' AND archived_at IS NULL) OR (tcms.has_permission('document.upload') AND uploaded_by=current_setting('app.actor_id',true) AND malware_scan_status IN ('PENDING','ERROR')) OR tcms.has_permission('document.archive')));
INSERT INTO tcms.schema_migrations(version) VALUES('019_document_metadata_google_drive');COMMIT;
