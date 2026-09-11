BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM tcms.schema_migrations WHERE version = '012_fix_last_admin_guard') THEN
    RAISE EXCEPTION 'Migration 012_fix_last_admin_guard was already applied';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION tcms.protect_last_global_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE active_admin_count integer;
BEGIN
  -- Keep table-specific record fields inside separate branches. PostgreSQL may
  -- resolve OLD/NEW fields before boolean short-circuiting in one expression.
  IF TG_TABLE_NAME = 'user_role_scopes' THEN
    IF TG_OP = 'DELETE' AND OLD.role_code = 'SYSTEM_ADMIN' AND OLD.global_scope THEN
      PERFORM pg_advisory_xact_lock(hashtext('tcms:last-global-system-admin'));
      SELECT count(*) INTO active_admin_count
      FROM tcms.user_role_scopes s JOIN tcms.app_users u ON u.id=s.user_id
      WHERE s.role_code='SYSTEM_ADMIN' AND s.global_scope AND u.active;
      IF active_admin_count <= 1 THEN RAISE EXCEPTION 'LAST_GLOBAL_SYSTEM_ADMIN_REQUIRED'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'app_users' THEN
    IF TG_OP = 'UPDATE' AND OLD.active AND NOT NEW.active THEN
      IF EXISTS (SELECT 1 FROM tcms.user_role_scopes s WHERE s.user_id=OLD.id AND s.role_code='SYSTEM_ADMIN' AND s.global_scope) THEN
        PERFORM pg_advisory_xact_lock(hashtext('tcms:last-global-system-admin'));
        SELECT count(*) INTO active_admin_count
        FROM tcms.user_role_scopes s JOIN tcms.app_users u ON u.id=s.user_id
        WHERE s.role_code='SYSTEM_ADMIN' AND s.global_scope AND u.active;
        IF active_admin_count <= 1 THEN RAISE EXCEPTION 'LAST_GLOBAL_SYSTEM_ADMIN_REQUIRED'; END IF;
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

INSERT INTO tcms.schema_migrations(version) VALUES ('012_fix_last_admin_guard');
COMMIT;
