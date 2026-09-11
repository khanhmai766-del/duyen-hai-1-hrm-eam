BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM tcms.schema_migrations WHERE version = '009_department_management') THEN
    RAISE EXCEPTION 'Migration 009_department_management was already applied';
  END IF;
END $$;

ALTER TABLE tcms.departments
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);

CREATE OR REPLACE FUNCTION tcms.touch_department_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER departments_touch_updated_at ON tcms.departments;
CREATE TRIGGER departments_touch_updated_at
BEFORE UPDATE ON tcms.departments
FOR EACH ROW EXECUTE FUNCTION tcms.touch_department_updated_at();

CREATE OR REPLACE FUNCTION tcms.enforce_department_write_permission()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  IF NOT tcms.has_permission('system.configure') THEN
    RAISE EXCEPTION 'system.configure permission is required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER departments_enforce_write_permission
BEFORE INSERT OR UPDATE ON tcms.departments
FOR EACH ROW EXECUTE FUNCTION tcms.enforce_department_write_permission();

CREATE TRIGGER departments_write_audit
AFTER INSERT OR UPDATE ON tcms.departments
FOR EACH ROW EXECUTE FUNCTION tcms.write_row_audit();

ALTER TABLE tcms.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY departments_select_policy ON tcms.departments FOR SELECT USING (
  tcms.has_permission('contract.read')
  OR tcms.has_permission('system.configure')
  OR tcms.has_permission('user.manage')
);
CREATE POLICY departments_insert_policy ON tcms.departments FOR INSERT WITH CHECK (
  tcms.has_permission('system.configure')
);
CREATE POLICY departments_update_policy ON tcms.departments FOR UPDATE
  USING (tcms.has_permission('system.configure'))
  WITH CHECK (tcms.has_permission('system.configure'));

GRANT SELECT, INSERT, UPDATE ON tcms.departments TO tcms_app_runtime;

INSERT INTO tcms.schema_migrations (version) VALUES ('009_department_management');
COMMIT;
