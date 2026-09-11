BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM tcms.schema_migrations WHERE version = '002_api_runtime') THEN
    RAISE EXCEPTION 'Migration 002_api_runtime was already applied';
  END IF;
END $$;

INSERT INTO tcms.departments (code, name) VALUES
  ('PXVH1', 'Phân xưởng Vận hành 1'), ('PXSCCN', 'Phân xưởng Sửa chữa Cơ nhiệt'),
  ('PXSCĐTĐ', 'Phân xưởng Sửa chữa Điện - Tự động'), ('P.KTAT', 'Phòng Kỹ thuật - An toàn'), ('PAT', 'Phòng An toàn')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, active = true;

CREATE OR REPLACE FUNCTION tcms.enforce_contract_column_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  IF (NEW.contract_number, NEW.package_name, NEW.lead_department_id, NEW.contractor_name,
      NEW.contractor_sensitive_ciphertext, NEW.handover_document, NEW.handover_date,
      NEW.contract_duration_days, NEW.service_duration_text, NEW.contract_start_date,
      NEW.site_handover_date, NEW.goods_end_date, NEW.service_end_date, NEW.contract_end_date,
      NEW.is_extended, NEW.extended_until, NEW.implementation_invitation_date)
     IS DISTINCT FROM
     (OLD.contract_number, OLD.package_name, OLD.lead_department_id, OLD.contractor_name,
      OLD.contractor_sensitive_ciphertext, OLD.handover_document, OLD.handover_date,
      OLD.contract_duration_days, OLD.service_duration_text, OLD.contract_start_date,
      OLD.site_handover_date, OLD.goods_end_date, OLD.service_end_date, OLD.contract_end_date,
      OLD.is_extended, OLD.extended_until, OLD.implementation_invitation_date)
     AND NOT tcms.has_permission('contract.identity.update') THEN
    RAISE EXCEPTION 'contract.identity.update permission is required';
  END IF;
  IF (NEW.progress_percent, NEW.progress_note) IS DISTINCT FROM (OLD.progress_percent, OLD.progress_note)
     AND NOT tcms.has_permission('contract.progress.update') THEN
    RAISE EXCEPTION 'contract.progress.update permission is required';
  END IF;
  IF (NEW.commercial_sensitive_ciphertext, NEW.payment_settlement_status)
     IS DISTINCT FROM (OLD.commercial_sensitive_ciphertext, OLD.payment_settlement_status)
     AND NOT (tcms.has_permission('contract.finance.update') OR tcms.has_permission('contract.progress.update')) THEN
    RAISE EXCEPTION 'progress or finance permission is required';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT tcms.has_permission('contract.status.transition') THEN
    RAISE EXCEPTION 'contract.status.transition permission is required';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER contracts_enforce_column_permissions BEFORE UPDATE ON tcms.contracts
FOR EACH ROW EXECUTE FUNCTION tcms.enforce_contract_column_permissions();

ALTER TABLE tcms.contracts FORCE ROW LEVEL SECURITY;
ALTER TABLE tcms.contract_supervisors FORCE ROW LEVEL SECURITY;
ALTER TABLE tcms.documents FORCE ROW LEVEL SECURITY;
ALTER TABLE tcms.audit_events FORCE ROW LEVEL SECURITY;

-- The integrated website uses its existing non-superuser database login.
-- FORCE RLS above keeps the table owner subject to the same business policies.

INSERT INTO tcms.schema_migrations (version) VALUES ('002_api_runtime');
COMMIT;
