BEGIN;

-- PostgreSQL is a proposed technology. This migration must be reviewed by DBA/IT/ATTT.
-- pgcrypto/gen_random_uuid must be confirmed against the approved technology catalogue.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS tcms;

REVOKE ALL ON SCHEMA tcms FROM PUBLIC;

CREATE TABLE tcms.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE tcms.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE tcms.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_subject text NOT NULL UNIQUE,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  primary_department_id uuid REFERENCES tcms.departments(id),
  active boolean NOT NULL DEFAULT true,
  last_identity_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

COMMENT ON COLUMN tcms.app_users.identity_subject IS
  'Stable subject from the approved IdP. TCMS must not store user passwords.';

CREATE TABLE tcms.roles (
  code text PRIMARY KEY,
  name text NOT NULL,
  system_role boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE tcms.permissions (
  code text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE tcms.role_permissions (
  role_code text NOT NULL REFERENCES tcms.roles(code) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES tcms.permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_code, permission_code)
);

CREATE TABLE tcms.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  contract_number text NOT NULL UNIQUE,
  package_name text NOT NULL,
  lead_department_id uuid NOT NULL REFERENCES tcms.departments(id),
  contractor_name text NOT NULL,
  contractor_sensitive_ciphertext bytea,
  contractor_sensitive_key_version integer,
  handover_document text,
  handover_date date,
  contract_duration_days integer CHECK (contract_duration_days IS NULL OR contract_duration_days >= 0),
  service_duration_text text,
  contract_start_date date,
  site_handover_date date,
  goods_end_date date,
  service_end_date date,
  contract_end_date date,
  is_extended boolean NOT NULL DEFAULT false,
  extended_until date,
  implementation_invitation_date date,
  progress_percent smallint NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  progress_note text,
  commercial_sensitive_ciphertext bytea,
  commercial_sensitive_key_version integer,
  payment_settlement_status text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (
    status IN (
      'DRAFT',
      'ACTIVE',
      'IN_PROGRESS',
      'TECHNICAL_COMPLETION',
      'COMPLETED',
      'CLOSED',
      'SUSPENDED',
      'CANCELLED'
    )
  ),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  archived_at timestamptz,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (NOT is_extended OR extended_until IS NOT NULL),
  CHECK (
    contractor_sensitive_ciphertext IS NULL OR
    contractor_sensitive_key_version IS NOT NULL
  ),
  CHECK (
    commercial_sensitive_ciphertext IS NULL OR
    commercial_sensitive_key_version IS NOT NULL
  )
);

CREATE INDEX contracts_lead_department_idx
  ON tcms.contracts (lead_department_id, status);
CREATE INDEX contracts_end_date_idx
  ON tcms.contracts (contract_end_date)
  WHERE archived_at IS NULL;

CREATE TABLE tcms.contract_departments (
  contract_id uuid NOT NULL REFERENCES tcms.contracts(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES tcms.departments(id),
  participation_type text NOT NULL CHECK (
    participation_type IN ('LEAD', 'OPERATIONS', 'TECHNICAL', 'SAFETY', 'OTHER')
  ),
  can_update_business_data boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  assigned_by text NOT NULL,
  PRIMARY KEY (contract_id, department_id, participation_type)
);

CREATE INDEX contract_departments_department_idx
  ON tcms.contract_departments (department_id, contract_id);

CREATE TABLE tcms.contract_supervisors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES tcms.contracts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES tcms.app_users(id),
  full_name text NOT NULL,
  department_id uuid NOT NULL REFERENCES tcms.departments(id),
  supervisor_role text NOT NULL,
  active_from date,
  active_until date,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (active_until IS NULL OR active_from IS NULL OR active_until >= active_from)
);

CREATE INDEX contract_supervisors_contract_idx
  ON tcms.contract_supervisors (contract_id, department_id);

CREATE TABLE tcms.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES tcms.contracts(id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  media_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256_hex text NOT NULL CHECK (sha256_hex ~ '^[0-9a-f]{64}$'),
  storage_object_id text NOT NULL UNIQUE,
  encryption_key_version integer,
  malware_scan_status text NOT NULL CHECK (
    malware_scan_status IN ('PENDING', 'CLEAN', 'INFECTED', 'ERROR')
  ),
  malware_scanned_at timestamptz,
  archived_at timestamptz,
  uploaded_by text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    malware_scan_status = 'PENDING' OR malware_scanned_at IS NOT NULL
  )
);

CREATE INDEX documents_contract_idx ON tcms.documents (contract_id, archived_at);

CREATE TABLE tcms.user_role_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES tcms.app_users(id) ON DELETE CASCADE,
  role_code text NOT NULL REFERENCES tcms.roles(code),
  department_id uuid REFERENCES tcms.departments(id),
  contract_id uuid REFERENCES tcms.contracts(id),
  global_scope boolean NOT NULL DEFAULT false,
  valid_from timestamptz NOT NULL DEFAULT clock_timestamp(),
  valid_until timestamptz,
  granted_by text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    global_scope OR department_id IS NOT NULL OR contract_id IS NOT NULL
  ),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE UNIQUE INDEX user_role_scopes_unique_idx
  ON tcms.user_role_scopes (
    user_id,
    role_code,
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(contract_id, '00000000-0000-0000-0000-000000000000'::uuid),
    global_scope
  );

CREATE TABLE tcms.audit_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at_utc timestamptz NOT NULL DEFAULT clock_timestamp(),
  environment text NOT NULL CHECK (environment IN ('development', 'test', 'production')),
  actor_id text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  result text NOT NULL CHECK (result IN ('SUCCESS', 'FAILURE', 'DENIED')),
  reason text,
  before_data jsonb,
  after_data jsonb,
  correlation_id text NOT NULL,
  source_ip inet,
  user_agent text,
  app_version text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_events_resource_idx
  ON tcms.audit_events (resource_type, resource_id, occurred_at_utc DESC);
CREATE INDEX audit_events_actor_idx
  ON tcms.audit_events (actor_id, occurred_at_utc DESC);
CREATE INDEX audit_events_time_idx
  ON tcms.audit_events (occurred_at_utc DESC);

REVOKE ALL ON tcms.audit_events FROM PUBLIC;

INSERT INTO tcms.roles (code, name) VALUES
  ('SYSTEM_ADMIN', 'Quản trị hệ thống'),
  ('SECURITY_AUDITOR', 'Kiểm toán ATTT'),
  ('CONTRACT_MANAGER', 'Quản lý hợp đồng'),
  ('CONTRACT_EDITOR', 'Cập nhật hợp đồng'),
  ('SUPERVISOR', 'Giám sát hợp đồng'),
  ('FINANCE_EDITOR', 'Cập nhật tài chính'),
  ('VIEWER', 'Tra cứu');

INSERT INTO tcms.permissions (code, description) VALUES
  ('contract.read', 'Xem hợp đồng trong phạm vi'),
  ('contract.create', 'Tạo hợp đồng'),
  ('contract.identity.update', 'Sửa thông tin nhận diện/phạm vi'),
  ('contract.progress.update', 'Cập nhật tiến độ và tồn tại'),
  ('contract.acceptance.update', 'Cập nhật nghiệm thu'),
  ('contract.finance.update', 'Cập nhật thanh toán/quyết toán'),
  ('contract.assignment.manage', 'Quản lý phân công'),
  ('contract.status.transition', 'Chuyển trạng thái hợp đồng'),
  ('document.read', 'Đọc tài liệu'),
  ('document.upload', 'Tải tài liệu lên'),
  ('document.archive', 'Lưu trữ/xóa logic tài liệu'),
  ('document.scan.update', 'Cập nhật kết quả quét malware bởi worker'),
  ('data.export', 'Xuất dữ liệu'),
  ('user.manage', 'Quản lý người dùng'),
  ('role.manage', 'Quản lý vai trò'),
  ('audit.read.business', 'Đọc audit nghiệp vụ'),
  ('audit.read.security', 'Đọc audit ATTT'),
  ('system.configure', 'Cấu hình hệ thống'),
  ('backup.restore', 'Thực hiện khôi phục backup'),
  ('audit.write', 'Ghi audit từ ứng dụng');

INSERT INTO tcms.role_permissions (role_code, permission_code) VALUES
  ('SYSTEM_ADMIN', 'contract.read'),
  ('SYSTEM_ADMIN', 'document.read'),
  ('SYSTEM_ADMIN', 'user.manage'),
  ('SYSTEM_ADMIN', 'role.manage'),
  ('SYSTEM_ADMIN', 'audit.read.business'),
  ('SYSTEM_ADMIN', 'audit.read.security'),
  ('SYSTEM_ADMIN', 'system.configure'),
  ('SYSTEM_ADMIN', 'backup.restore'),
  ('SECURITY_AUDITOR', 'contract.read'),
  ('SECURITY_AUDITOR', 'document.read'),
  ('SECURITY_AUDITOR', 'data.export'),
  ('SECURITY_AUDITOR', 'audit.read.business'),
  ('SECURITY_AUDITOR', 'audit.read.security'),
  ('CONTRACT_MANAGER', 'contract.read'),
  ('CONTRACT_MANAGER', 'contract.create'),
  ('CONTRACT_MANAGER', 'contract.identity.update'),
  ('CONTRACT_MANAGER', 'contract.progress.update'),
  ('CONTRACT_MANAGER', 'contract.acceptance.update'),
  ('CONTRACT_MANAGER', 'contract.finance.update'),
  ('CONTRACT_MANAGER', 'contract.assignment.manage'),
  ('CONTRACT_MANAGER', 'contract.status.transition'),
  ('CONTRACT_MANAGER', 'document.read'),
  ('CONTRACT_MANAGER', 'document.upload'),
  ('CONTRACT_MANAGER', 'document.archive'),
  ('CONTRACT_MANAGER', 'data.export'),
  ('CONTRACT_MANAGER', 'audit.read.business'),
  ('CONTRACT_EDITOR', 'contract.read'),
  ('CONTRACT_EDITOR', 'contract.identity.update'),
  ('CONTRACT_EDITOR', 'contract.progress.update'),
  ('CONTRACT_EDITOR', 'contract.acceptance.update'),
  ('CONTRACT_EDITOR', 'document.read'),
  ('CONTRACT_EDITOR', 'document.upload'),
  ('SUPERVISOR', 'contract.read'),
  ('SUPERVISOR', 'contract.progress.update'),
  ('SUPERVISOR', 'contract.acceptance.update'),
  ('SUPERVISOR', 'document.read'),
  ('SUPERVISOR', 'document.upload'),
  ('FINANCE_EDITOR', 'contract.read'),
  ('FINANCE_EDITOR', 'contract.finance.update'),
  ('FINANCE_EDITOR', 'document.read'),
  ('FINANCE_EDITOR', 'document.upload'),
  ('FINANCE_EDITOR', 'data.export'),
  ('VIEWER', 'contract.read'),
  ('VIEWER', 'document.read');

CREATE OR REPLACE FUNCTION tcms.current_permissions()
RETURNS text[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw_value text;
BEGIN
  raw_value := current_setting('app.permissions', true);
  IF raw_value IS NULL OR raw_value = '' THEN
    RETURN ARRAY[]::text[];
  END IF;

  RETURN ARRAY(SELECT jsonb_array_elements_text(raw_value::jsonb));
EXCEPTION WHEN OTHERS THEN
  RETURN ARRAY[]::text[];
END;
$$;

CREATE OR REPLACE FUNCTION tcms.current_department_ids()
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw_value text;
BEGIN
  raw_value := current_setting('app.department_ids', true);
  IF raw_value IS NULL OR raw_value = '' THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  RETURN ARRAY(
    SELECT jsonb_array_elements_text(raw_value::jsonb)::uuid
  );
EXCEPTION WHEN OTHERS THEN
  RETURN ARRAY[]::uuid[];
END;
$$;

CREATE OR REPLACE FUNCTION tcms.current_assigned_contract_ids()
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw_value text;
BEGIN
  raw_value := current_setting('app.assigned_contract_ids', true);
  IF raw_value IS NULL OR raw_value = '' THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  RETURN ARRAY(
    SELECT jsonb_array_elements_text(raw_value::jsonb)::uuid
  );
EXCEPTION WHEN OTHERS THEN
  RETURN ARRAY[]::uuid[];
END;
$$;

CREATE OR REPLACE FUNCTION tcms.has_permission(required_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT required_permission = ANY(tcms.current_permissions());
$$;

CREATE OR REPLACE FUNCTION tcms.has_global_contract_scope()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.global_contract_scope', true), '')::boolean,
    false
  );
$$;

CREATE OR REPLACE FUNCTION tcms.can_access_contract(target_contract_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    tcms.has_global_contract_scope()
    OR target_contract_id = ANY(tcms.current_assigned_contract_ids())
    OR EXISTS (
      SELECT 1
      FROM tcms.contract_departments cd
      WHERE cd.contract_id = target_contract_id
        AND cd.department_id = ANY(tcms.current_department_ids())
    );
$$;

CREATE OR REPLACE FUNCTION tcms.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  IF TG_TABLE_NAME = 'contracts' THEN
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER departments_touch_updated_at
BEFORE UPDATE ON tcms.departments
FOR EACH ROW EXECUTE FUNCTION tcms.touch_updated_at();

CREATE TRIGGER app_users_touch_updated_at
BEFORE UPDATE ON tcms.app_users
FOR EACH ROW EXECUTE FUNCTION tcms.touch_updated_at();

CREATE TRIGGER contracts_touch_updated_at
BEFORE UPDATE ON tcms.contracts
FOR EACH ROW EXECUTE FUNCTION tcms.touch_updated_at();

CREATE TRIGGER supervisors_touch_updated_at
BEFORE UPDATE ON tcms.contract_supervisors
FOR EACH ROW EXECUTE FUNCTION tcms.touch_updated_at();

CREATE OR REPLACE FUNCTION tcms.prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;

CREATE TRIGGER audit_events_no_update
BEFORE UPDATE OR DELETE ON tcms.audit_events
FOR EACH ROW EXECUTE FUNCTION tcms.prevent_audit_mutation();

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

CREATE TRIGGER documents_validate_transition
BEFORE UPDATE ON tcms.documents
FOR EACH ROW EXECUTE FUNCTION tcms.validate_document_transition();

CREATE OR REPLACE FUNCTION tcms.write_row_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tcms, pg_temp
AS $$
DECLARE
  before_value jsonb;
  after_value jsonb;
  resource_value text;
  actor_value text;
  environment_value text;
  correlation_value text;
  app_version_value text;
  action_value text;
BEGIN
  before_value := CASE
    WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD)
    ELSE NULL
  END;
  after_value := CASE
    WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW)
    ELSE NULL
  END;

  -- Never copy ciphertext, storage identifiers or other secret-adjacent values into audit.
  IF before_value IS NOT NULL THEN
    before_value := before_value - ARRAY[
      'contractor_sensitive_ciphertext',
      'commercial_sensitive_ciphertext',
      'display_name',
      'storage_object_id'
    ];
  END IF;
  IF after_value IS NOT NULL THEN
    after_value := after_value - ARRAY[
      'contractor_sensitive_ciphertext',
      'commercial_sensitive_ciphertext',
      'display_name',
      'storage_object_id'
    ];
  END IF;

  resource_value := COALESCE(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END,
    'unknown'
  );
  actor_value := NULLIF(current_setting('app.actor_id', true), '');
  environment_value := NULLIF(current_setting('app.environment', true), '');
  correlation_value := NULLIF(current_setting('app.correlation_id', true), '');
  app_version_value := NULLIF(current_setting('app.app_version', true), '');

  IF actor_value IS NULL THEN
    RAISE EXCEPTION 'app.actor_id must be set before audited mutations';
  END IF;
  IF environment_value IS NULL OR environment_value NOT IN ('development', 'test', 'production') THEN
    RAISE EXCEPTION 'app.environment must be development, test or production';
  END IF;
  IF correlation_value IS NULL THEN
    RAISE EXCEPTION 'app.correlation_id must be set before audited mutations';
  END IF;
  IF app_version_value IS NULL THEN
    RAISE EXCEPTION 'app.app_version must be set before audited mutations';
  END IF;

  action_value := CASE
    WHEN TG_TABLE_NAME = 'contracts' AND TG_OP = 'INSERT' THEN 'CONTRACT_CREATED'
    WHEN TG_TABLE_NAME = 'contracts' AND TG_OP = 'UPDATE' THEN 'CONTRACT_UPDATED'
    WHEN TG_TABLE_NAME = 'contracts' AND TG_OP = 'DELETE' THEN 'CONTRACT_DELETED'
    WHEN TG_TABLE_NAME = 'contract_supervisors' AND TG_OP = 'INSERT' THEN 'SUPERVISOR_ASSIGNED'
    WHEN TG_TABLE_NAME = 'contract_supervisors' AND TG_OP = 'UPDATE' THEN 'SUPERVISOR_UPDATED'
    WHEN TG_TABLE_NAME = 'contract_supervisors' AND TG_OP = 'DELETE' THEN 'SUPERVISOR_REMOVED'
    WHEN TG_TABLE_NAME = 'documents' AND TG_OP = 'INSERT' THEN 'DOCUMENT_UPLOADED'
    WHEN TG_TABLE_NAME = 'documents' AND TG_OP = 'UPDATE' THEN 'DOCUMENT_UPDATED'
    WHEN TG_TABLE_NAME = 'documents' AND TG_OP = 'DELETE' THEN 'DOCUMENT_ARCHIVED'
    ELSE TG_TABLE_NAME || '_' || TG_OP
  END;

  INSERT INTO tcms.audit_events (
    environment,
    actor_id,
    action,
    resource_type,
    resource_id,
    result,
    before_data,
    after_data,
    correlation_id,
    app_version
  ) VALUES (
    environment_value,
    actor_value,
    action_value,
    TG_TABLE_NAME,
    resource_value,
    'SUCCESS',
    before_value,
    after_value,
    correlation_value,
    app_version_value
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION tcms.write_row_audit() FROM PUBLIC;

CREATE TRIGGER contracts_write_audit
AFTER INSERT OR UPDATE OR DELETE ON tcms.contracts
FOR EACH ROW EXECUTE FUNCTION tcms.write_row_audit();

CREATE TRIGGER supervisors_write_audit
AFTER INSERT OR UPDATE OR DELETE ON tcms.contract_supervisors
FOR EACH ROW EXECUTE FUNCTION tcms.write_row_audit();

CREATE TRIGGER documents_write_audit
AFTER INSERT OR UPDATE OR DELETE ON tcms.documents
FOR EACH ROW EXECUTE FUNCTION tcms.write_row_audit();

ALTER TABLE tcms.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcms.contract_supervisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcms.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcms.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY contracts_select_policy ON tcms.contracts
FOR SELECT
USING (
  tcms.has_permission('contract.read')
  AND tcms.can_access_contract(id)
);

CREATE POLICY contracts_insert_policy ON tcms.contracts
FOR INSERT
WITH CHECK (
  tcms.has_permission('contract.create')
  AND (
    tcms.has_global_contract_scope()
    OR lead_department_id = ANY(tcms.current_department_ids())
  )
);

CREATE POLICY contracts_update_policy ON tcms.contracts
FOR UPDATE
USING (
  tcms.can_access_contract(id)
  AND (
    tcms.has_permission('contract.identity.update')
    OR tcms.has_permission('contract.progress.update')
    OR tcms.has_permission('contract.acceptance.update')
    OR tcms.has_permission('contract.finance.update')
    OR tcms.has_permission('contract.assignment.manage')
    OR tcms.has_permission('contract.status.transition')
  )
)
WITH CHECK (tcms.can_access_contract(id));

CREATE POLICY supervisors_select_policy ON tcms.contract_supervisors
FOR SELECT
USING (
  tcms.has_permission('contract.read')
  AND tcms.can_access_contract(contract_id)
);

CREATE POLICY supervisors_write_policy ON tcms.contract_supervisors
FOR ALL
USING (
  tcms.has_permission('contract.assignment.manage')
  AND tcms.can_access_contract(contract_id)
)
WITH CHECK (
  tcms.has_permission('contract.assignment.manage')
  AND tcms.can_access_contract(contract_id)
);

CREATE POLICY documents_select_policy ON tcms.documents
FOR SELECT
USING (
  tcms.has_permission('document.read')
  AND tcms.can_access_contract(contract_id)
  AND malware_scan_status = 'CLEAN'
);

CREATE POLICY documents_insert_policy ON tcms.documents
FOR INSERT
WITH CHECK (
  tcms.has_permission('document.upload')
  AND tcms.can_access_contract(contract_id)
  AND malware_scan_status = 'PENDING'
);

CREATE POLICY documents_update_policy ON tcms.documents
FOR UPDATE
USING (
  (
    tcms.has_permission('document.archive')
    OR tcms.has_permission('document.scan.update')
  )
  AND tcms.can_access_contract(contract_id)
)
WITH CHECK (tcms.can_access_contract(contract_id));

CREATE POLICY audit_events_insert_policy ON tcms.audit_events
FOR INSERT
WITH CHECK (tcms.has_permission('audit.write'));

CREATE POLICY audit_events_select_policy ON tcms.audit_events
FOR SELECT
USING (
  tcms.has_permission('audit.read.business')
  OR tcms.has_permission('audit.read.security')
);

INSERT INTO tcms.schema_migrations (version)
VALUES ('001_security_foundation');

COMMIT;
