BEGIN;

-- Integration only: read existing website accounts, never modify public."User".
SELECT set_config('app.actor_id', 'website-contract-integration', true);
SELECT set_config('app.permissions', '["user.manage","role.manage","audit.write"]', true);
SELECT set_config('app.environment', 'production', true);
SELECT set_config('app.correlation_id', 'website-contract-integration', true);
SELECT set_config('app.app_version', 'website-contract-integration-1', true);

INSERT INTO tcms.app_users(identity_subject, username, display_name, primary_department_id, active)
SELECT 'vh1:' || u.id, u.email, u.name, d.id, true
FROM public."User" u
JOIN tcms.departments d ON d.code='PXVH1'
WHERE u.role::text='ADMIN' AND u."isActive" AND COALESCE(u."accessMode",'NORMAL') <> 'DEFECT_READ_ONLY'
ON CONFLICT (identity_subject) DO NOTHING;

INSERT INTO tcms.user_role_scopes(user_id, role_code, global_scope, granted_by)
SELECT p.id, r.code, true, 'website-contract-integration' FROM tcms.app_users p
JOIN public."User" u ON p.identity_subject='vh1:' || u.id
CROSS JOIN (VALUES ('SYSTEM_ADMIN'), ('CONTRACT_MANAGER')) r(code)
WHERE u.role::text='ADMIN' AND u."isActive" AND COALESCE(u."accessMode",'NORMAL') <> 'DEFECT_READ_ONLY'
ON CONFLICT DO NOTHING;

-- Runtime must always enter this non-owner, non-bypass role before business SQL.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='tcms_app_runtime' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'tcms_app_runtime must not bypass RLS';
  END IF;
  EXECUTE format('GRANT tcms_app_runtime TO %I', current_user);
END $$;

-- Needed for replacement of the old free-text supervisor list in a contract edit.
GRANT DELETE ON tcms.contract_supervisors TO tcms_app_runtime;

COMMENT ON COLUMN tcms.app_users.identity_subject IS 'Website account binding: vh1:<public.User.id>. No additional password is stored.';
INSERT INTO tcms.schema_migrations(version) VALUES ('021_website_integration');
COMMIT;
