BEGIN;

ALTER TABLE tcms.contracts
  ADD COLUMN signed_date date,
  ADD COLUMN service_provision_duration_days integer
    CHECK (service_provision_duration_days IS NULL OR service_provision_duration_days >= 0),
  ADD COLUMN unit_execution_duration_days integer
    CHECK (unit_execution_duration_days IS NULL OR unit_execution_duration_days > 0),
  ADD COLUMN unit_execution_continuous boolean,
  ADD COLUMN unit_execution_trigger_text text,
  ADD COLUMN effective_condition_text text;

CREATE OR REPLACE FUNCTION tcms.enforce_contract_column_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  IF (NEW.contract_number, NEW.package_name, NEW.lead_department_id, NEW.contractor_name,
      NEW.contractor_sensitive_ciphertext, NEW.handover_document, NEW.handover_date,
      NEW.signed_date, NEW.contract_duration_days, NEW.service_provision_duration_days,
      NEW.service_duration_text, NEW.unit_execution_duration_days, NEW.unit_execution_continuous,
      NEW.unit_execution_trigger_text, NEW.effective_condition_text, NEW.contract_start_date,
      NEW.site_handover_date, NEW.goods_end_date, NEW.service_end_date, NEW.contract_end_date,
      NEW.is_extended, NEW.extended_until, NEW.implementation_invitation_date)
     IS DISTINCT FROM
     (OLD.contract_number, OLD.package_name, OLD.lead_department_id, OLD.contractor_name,
      OLD.contractor_sensitive_ciphertext, OLD.handover_document, OLD.handover_date,
      OLD.signed_date, OLD.contract_duration_days, OLD.service_provision_duration_days,
      OLD.service_duration_text, OLD.unit_execution_duration_days, OLD.unit_execution_continuous,
      OLD.unit_execution_trigger_text, OLD.effective_condition_text, OLD.contract_start_date,
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

INSERT INTO tcms.schema_migrations (version)
VALUES ('006_contract_source_time_fields');

COMMIT;
