BEGIN;

CREATE TABLE tcms.contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  name text NOT NULL,
  tax_code text,
  sensitive_ciphertext bytea,
  sensitive_key_version integer,
  active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (sensitive_ciphertext IS NULL OR sensitive_key_version IS NOT NULL)
);

ALTER TABLE tcms.contracts ADD COLUMN contractor_id uuid REFERENCES tcms.contractors(id);

CREATE TABLE tcms.contract_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES tcms.contracts(id) ON DELETE CASCADE,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  item_code text,
  item_name text NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('GOODS','SERVICE','DELIVERABLE','OTHER')),
  description text,
  unit text,
  contract_quantity numeric(18,4) CHECK (contract_quantity IS NULL OR contract_quantity >= 0),
  completed_quantity numeric(18,4) CHECK (completed_quantity IS NULL OR completed_quantity >= 0),
  weight_percent numeric(7,4) CHECK (weight_percent IS NULL OR weight_percent BETWEEN 0 AND 100),
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  actual_end_date date,
  progress_percent numeric(7,4) NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED','IN_PROGRESS','ON_HOLD','COMPLETED','ACCEPTED','CANCELLED')),
  progress_note text,
  issue_note text,
  acceptance_status text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  archived_at timestamptz,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (contract_id, sequence_number),
  CHECK (planned_end_date IS NULL OR planned_start_date IS NULL OR planned_end_date >= planned_start_date),
  CHECK (actual_end_date IS NULL OR actual_start_date IS NULL OR actual_end_date >= actual_start_date),
  CHECK (completed_quantity IS NULL OR contract_quantity IS NULL OR completed_quantity <= contract_quantity)
);

CREATE INDEX contract_items_contract_idx ON tcms.contract_items (contract_id, archived_at, sequence_number);

CREATE OR REPLACE FUNCTION tcms.touch_contract_domain_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  IF TG_TABLE_NAME = 'contract_items' THEN NEW.version := OLD.version + 1; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER contractors_touch_updated_at BEFORE UPDATE ON tcms.contractors
FOR EACH ROW EXECUTE FUNCTION tcms.touch_contract_domain_updated_at();
CREATE TRIGGER contract_items_touch_updated_at BEFORE UPDATE ON tcms.contract_items
FOR EACH ROW EXECUTE FUNCTION tcms.touch_contract_domain_updated_at();
CREATE TRIGGER contractors_write_audit AFTER INSERT OR UPDATE OR DELETE ON tcms.contractors
FOR EACH ROW EXECUTE FUNCTION tcms.write_row_audit();
CREATE TRIGGER contract_items_write_audit AFTER INSERT OR UPDATE OR DELETE ON tcms.contract_items
FOR EACH ROW EXECUTE FUNCTION tcms.write_row_audit();

ALTER TABLE tcms.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcms.contractors FORCE ROW LEVEL SECURITY;
ALTER TABLE tcms.contract_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcms.contract_items FORCE ROW LEVEL SECURITY;

CREATE POLICY contractors_select_policy ON tcms.contractors FOR SELECT USING (tcms.has_permission('contract.read'));
CREATE POLICY contractors_write_policy ON tcms.contractors FOR ALL
  USING (tcms.has_permission('contract.identity.update'))
  WITH CHECK (tcms.has_permission('contract.identity.update'));
CREATE POLICY contract_items_select_policy ON tcms.contract_items FOR SELECT USING (
  tcms.has_permission('contract.read') AND tcms.can_access_contract(contract_id)
);
CREATE POLICY contract_items_insert_policy ON tcms.contract_items FOR INSERT WITH CHECK (
  tcms.has_permission('contract.identity.update') AND tcms.can_access_contract(contract_id)
);
CREATE POLICY contract_items_update_policy ON tcms.contract_items FOR UPDATE
  USING (tcms.can_access_contract(contract_id) AND (tcms.has_permission('contract.identity.update') OR tcms.has_permission('contract.progress.update') OR tcms.has_permission('contract.acceptance.update')))
  WITH CHECK (tcms.can_access_contract(contract_id));

INSERT INTO tcms.schema_migrations (version) VALUES ('003_contract_domain');
COMMIT;
