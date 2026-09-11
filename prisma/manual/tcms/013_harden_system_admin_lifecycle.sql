BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM tcms.schema_migrations WHERE version = '013_harden_system_admin_lifecycle') THEN
    RAISE EXCEPTION 'Migration 013_harden_system_admin_lifecycle was already applied';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION tcms.enforce_system_admin_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  IF NEW.role_code='SYSTEM_ADMIN' AND (
    NOT NEW.global_scope OR NEW.department_id IS NOT NULL OR NEW.contract_id IS NOT NULL
    OR NEW.valid_until IS NOT NULL OR NEW.valid_from > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'SYSTEM_ADMIN_MUST_BE_CURRENT_GLOBAL_AND_NON_EXPIRING';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION tcms.protect_last_global_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE active_admin_count integer; removes_effective_admin boolean := false;
BEGIN
  IF TG_TABLE_NAME='user_role_scopes' THEN
    IF OLD.role_code='SYSTEM_ADMIN' AND OLD.global_scope
       AND OLD.valid_from<=clock_timestamp() AND (OLD.valid_until IS NULL OR OLD.valid_until>clock_timestamp()) THEN
      removes_effective_admin := TG_OP='DELETE' OR NOT (
        NEW.role_code='SYSTEM_ADMIN' AND NEW.global_scope
        AND NEW.valid_from<=clock_timestamp() AND (NEW.valid_until IS NULL OR NEW.valid_until>clock_timestamp())
      );
    END IF;
    IF removes_effective_admin THEN
      PERFORM pg_advisory_xact_lock(hashtext('tcms:last-global-system-admin'));
      SELECT count(*) INTO active_admin_count
      FROM tcms.user_role_scopes s JOIN tcms.app_users u ON u.id=s.user_id
      WHERE s.role_code='SYSTEM_ADMIN' AND s.global_scope AND u.active
        AND s.valid_from<=clock_timestamp() AND (s.valid_until IS NULL OR s.valid_until>clock_timestamp());
      IF active_admin_count<=1 THEN RAISE EXCEPTION 'LAST_GLOBAL_SYSTEM_ADMIN_REQUIRED'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='app_users' THEN
    IF TG_OP='UPDATE' AND OLD.active AND NOT NEW.active AND EXISTS (
      SELECT 1 FROM tcms.user_role_scopes s WHERE s.user_id=OLD.id
        AND s.role_code='SYSTEM_ADMIN' AND s.global_scope
        AND s.valid_from<=clock_timestamp() AND (s.valid_until IS NULL OR s.valid_until>clock_timestamp())
    ) THEN
      PERFORM pg_advisory_xact_lock(hashtext('tcms:last-global-system-admin'));
      SELECT count(*) INTO active_admin_count
      FROM tcms.user_role_scopes s JOIN tcms.app_users u ON u.id=s.user_id
      WHERE s.role_code='SYSTEM_ADMIN' AND s.global_scope AND u.active
        AND s.valid_from<=clock_timestamp() AND (s.valid_until IS NULL OR s.valid_until>clock_timestamp());
      IF active_admin_count<=1 THEN RAISE EXCEPTION 'LAST_GLOBAL_SYSTEM_ADMIN_REQUIRED'; END IF;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_role_scopes_validate_admin_lifecycle
BEFORE INSERT OR UPDATE ON tcms.user_role_scopes
FOR EACH ROW EXECUTE FUNCTION tcms.enforce_system_admin_lifecycle();

DROP TRIGGER user_role_scopes_protect_last_admin ON tcms.user_role_scopes;
CREATE TRIGGER user_role_scopes_protect_last_admin
BEFORE UPDATE OR DELETE ON tcms.user_role_scopes
FOR EACH ROW EXECUTE FUNCTION tcms.protect_last_global_admin();

INSERT INTO tcms.schema_migrations(version) VALUES ('013_harden_system_admin_lifecycle');
COMMIT;
