BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM tcms.schema_migrations WHERE version = '011_personnel_and_role_management') THEN
    RAISE EXCEPTION 'Migration 011_personnel_and_role_management was already applied';
  END IF;
END $$;

ALTER TABLE tcms.app_users
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);

ALTER TABLE tcms.user_role_scopes
  ADD CONSTRAINT user_role_scopes_exactly_one_scope CHECK (
    num_nonnulls(department_id, contract_id) + CASE WHEN global_scope THEN 1 ELSE 0 END = 1
  );

CREATE OR REPLACE FUNCTION tcms.touch_app_user_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER app_users_touch_updated_at ON tcms.app_users;
CREATE TRIGGER app_users_touch_updated_at
BEFORE UPDATE ON tcms.app_users
FOR EACH ROW EXECUTE FUNCTION tcms.touch_app_user_updated_at();

CREATE OR REPLACE FUNCTION tcms.enforce_personnel_write_permission()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  IF NOT (tcms.has_permission('user.manage') AND tcms.has_permission('role.manage')) THEN
    RAISE EXCEPTION 'user.manage and role.manage permissions are required';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION tcms.protect_last_global_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE active_admin_count integer;
BEGIN
  IF TG_TABLE_NAME = 'user_role_scopes' AND TG_OP = 'DELETE'
     AND OLD.role_code = 'SYSTEM_ADMIN' AND OLD.global_scope THEN
    PERFORM pg_advisory_xact_lock(hashtext('tcms:last-global-system-admin'));
    SELECT count(*) INTO active_admin_count
    FROM tcms.user_role_scopes s JOIN tcms.app_users u ON u.id=s.user_id
    WHERE s.role_code='SYSTEM_ADMIN' AND s.global_scope AND u.active;
    IF active_admin_count <= 1 THEN RAISE EXCEPTION 'LAST_GLOBAL_SYSTEM_ADMIN_REQUIRED'; END IF;
  END IF;
  IF TG_TABLE_NAME = 'app_users' AND TG_OP = 'UPDATE' AND OLD.active AND NOT NEW.active
     AND EXISTS (SELECT 1 FROM tcms.user_role_scopes s WHERE s.user_id=OLD.id AND s.role_code='SYSTEM_ADMIN' AND s.global_scope) THEN
    PERFORM pg_advisory_xact_lock(hashtext('tcms:last-global-system-admin'));
    SELECT count(*) INTO active_admin_count
    FROM tcms.user_role_scopes s JOIN tcms.app_users u ON u.id=s.user_id
    WHERE s.role_code='SYSTEM_ADMIN' AND s.global_scope AND u.active;
    IF active_admin_count <= 1 THEN RAISE EXCEPTION 'LAST_GLOBAL_SYSTEM_ADMIN_REQUIRED'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION tcms.write_identity_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=tcms,pg_temp AS $$
DECLARE before_value jsonb; after_value jsonb; resource_value text;
BEGIN
  IF NULLIF(current_setting('app.actor_id',true),'') IS NULL
     OR NULLIF(current_setting('app.correlation_id',true),'') IS NULL
     OR NULLIF(current_setting('app.app_version',true),'') IS NULL THEN
    RAISE EXCEPTION 'audit context must be set before personnel mutations';
  END IF;
  before_value := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN
    to_jsonb(OLD) - ARRAY['identity_subject','username','display_name'] ELSE NULL END;
  after_value := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN
    to_jsonb(NEW) - ARRAY['identity_subject','username','display_name'] ELSE NULL END;
  resource_value := CASE WHEN TG_OP='DELETE' THEN OLD.id::text ELSE NEW.id::text END;
  INSERT INTO tcms.audit_events(environment,actor_id,action,resource_type,resource_id,result,before_data,after_data,correlation_id,app_version)
  VALUES (
    NULLIF(current_setting('app.environment',true),''),NULLIF(current_setting('app.actor_id',true),''),
    CASE WHEN TG_TABLE_NAME='app_users' THEN 'PERSONNEL_'||TG_OP ELSE 'ROLE_SCOPE_'||TG_OP END,
    TG_TABLE_NAME,resource_value,'SUCCESS',before_value,after_value,
    NULLIF(current_setting('app.correlation_id',true),''),NULLIF(current_setting('app.app_version',true),'')
  );
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION tcms.write_identity_audit() FROM PUBLIC;

CREATE TRIGGER app_users_enforce_write_permission BEFORE INSERT OR UPDATE ON tcms.app_users
FOR EACH ROW EXECUTE FUNCTION tcms.enforce_personnel_write_permission();
CREATE TRIGGER user_role_scopes_enforce_write_permission BEFORE INSERT OR UPDATE OR DELETE ON tcms.user_role_scopes
FOR EACH ROW EXECUTE FUNCTION tcms.enforce_personnel_write_permission();
CREATE TRIGGER app_users_protect_last_admin BEFORE UPDATE ON tcms.app_users
FOR EACH ROW EXECUTE FUNCTION tcms.protect_last_global_admin();
CREATE TRIGGER user_role_scopes_protect_last_admin BEFORE DELETE ON tcms.user_role_scopes
FOR EACH ROW EXECUTE FUNCTION tcms.protect_last_global_admin();
CREATE TRIGGER app_users_write_audit AFTER INSERT OR UPDATE ON tcms.app_users
FOR EACH ROW EXECUTE FUNCTION tcms.write_identity_audit();
CREATE TRIGGER user_role_scopes_write_audit AFTER INSERT OR UPDATE OR DELETE ON tcms.user_role_scopes
FOR EACH ROW EXECUTE FUNCTION tcms.write_identity_audit();

INSERT INTO tcms.schema_migrations(version) VALUES ('011_personnel_and_role_management');
COMMIT;
