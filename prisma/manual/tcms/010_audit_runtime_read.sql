BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM tcms.schema_migrations WHERE version = '010_audit_runtime_read') THEN
    RAISE EXCEPTION 'Migration 010_audit_runtime_read was already applied';
  END IF;
END $$;

-- RLS remains the authorization boundary: only audit.read.business or
-- audit.read.security in the transaction context can see rows.

INSERT INTO tcms.schema_migrations (version) VALUES ('010_audit_runtime_read');
COMMIT;
