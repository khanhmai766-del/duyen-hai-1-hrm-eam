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

-- The website database login owns this schema. Business tables use FORCE RLS,
-- while API transactions reject superuser and BYPASSRLS connections.

COMMENT ON COLUMN tcms.app_users.identity_subject IS 'Website account binding: vh1:<public.User.id>. No additional password is stored.';
INSERT INTO tcms.schema_migrations(version) VALUES ('021_website_integration');
COMMIT;
