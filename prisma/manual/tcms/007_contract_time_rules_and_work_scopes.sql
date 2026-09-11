BEGIN;

CREATE TABLE tcms.work_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES tcms.contracts(id) ON DELETE CASCADE,
  parent_scope_id uuid,
  scope_type text NOT NULL CHECK (scope_type IN ('LOT','PACKAGE','SYSTEM','SUBSYSTEM','EQUIPMENT','LOCATION','WORK_GROUP','OTHER')),
  code text,
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text,
  sequence integer NOT NULL CHECK (sequence > 0),
  source_page integer CHECK (source_page IS NULL OR source_page > 0),
  evidence text,
  confidence numeric(5,4) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, contract_id),
  UNIQUE NULLS NOT DISTINCT (contract_id, parent_scope_id, sequence),
  FOREIGN KEY (parent_scope_id, contract_id)
    REFERENCES tcms.work_scopes(id, contract_id) ON DELETE RESTRICT
);

CREATE TABLE tcms.contract_time_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES tcms.contracts(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('CONTRACT','WORK_SCOPE','SERVICE','GOODS','ITEM','UNIT','OTHER')),
  work_scope_id uuid,
  rule_type text,
  duration_value numeric(18,4) CHECK (duration_value IS NULL OR duration_value >= 0),
  duration_unit text CHECK (duration_unit IS NULL OR duration_unit IN ('DAY','HOUR','MONTH','OTHER')),
  is_continuous boolean,
  start_trigger_type text,
  start_trigger_description text,
  end_trigger_type text,
  end_trigger_description text,
  raw_clause text,
  source_page integer CHECK (source_page IS NULL OR source_page > 0),
  evidence text,
  confidence numeric(5,4) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  sequence integer NOT NULL CHECK (sequence > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (contract_id, sequence),
  CHECK ((duration_value IS NULL AND duration_unit IS NULL)
      OR (duration_value IS NOT NULL AND duration_unit IS NOT NULL)),
  CHECK ((scope_type = 'WORK_SCOPE' AND work_scope_id IS NOT NULL)
      OR (scope_type <> 'WORK_SCOPE' AND work_scope_id IS NULL)),
  FOREIGN KEY (work_scope_id, contract_id)
    REFERENCES tcms.work_scopes(id, contract_id) ON DELETE RESTRICT
);

ALTER TABLE tcms.contract_items
  ADD COLUMN work_scope_id uuid;

ALTER TABLE tcms.contract_items
  ADD CONSTRAINT contract_items_work_scope_fk
  FOREIGN KEY (work_scope_id, contract_id)
  REFERENCES tcms.work_scopes(id, contract_id) ON DELETE RESTRICT;

CREATE INDEX work_scopes_contract_parent_idx
  ON tcms.work_scopes (contract_id, parent_scope_id, sequence);
CREATE INDEX contract_time_rules_contract_work_scope_idx
  ON tcms.contract_time_rules (contract_id, work_scope_id, sequence);
CREATE INDEX contract_items_work_scope_idx
  ON tcms.contract_items (work_scope_id) WHERE work_scope_id IS NOT NULL;

CREATE OR REPLACE FUNCTION tcms.touch_contract_structure_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER work_scopes_touch_updated_at
BEFORE UPDATE ON tcms.work_scopes
FOR EACH ROW EXECUTE FUNCTION tcms.touch_contract_structure_updated_at();
CREATE TRIGGER contract_time_rules_touch_updated_at
BEFORE UPDATE ON tcms.contract_time_rules
FOR EACH ROW EXECUTE FUNCTION tcms.touch_contract_structure_updated_at();

CREATE TRIGGER work_scopes_write_audit
AFTER INSERT OR UPDATE OR DELETE ON tcms.work_scopes
FOR EACH ROW EXECUTE FUNCTION tcms.write_row_audit();
CREATE TRIGGER contract_time_rules_write_audit
AFTER INSERT OR UPDATE OR DELETE ON tcms.contract_time_rules
FOR EACH ROW EXECUTE FUNCTION tcms.write_row_audit();

ALTER TABLE tcms.work_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcms.work_scopes FORCE ROW LEVEL SECURITY;
ALTER TABLE tcms.contract_time_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcms.contract_time_rules FORCE ROW LEVEL SECURITY;

CREATE POLICY work_scopes_select_policy ON tcms.work_scopes FOR SELECT USING (
  tcms.has_permission('contract.read') AND tcms.can_access_contract(contract_id)
);
CREATE POLICY work_scopes_insert_policy ON tcms.work_scopes FOR INSERT WITH CHECK (
  tcms.has_permission('contract.identity.update') AND tcms.can_access_contract(contract_id)
);
CREATE POLICY work_scopes_update_policy ON tcms.work_scopes FOR UPDATE
  USING (tcms.has_permission('contract.identity.update') AND tcms.can_access_contract(contract_id))
  WITH CHECK (tcms.has_permission('contract.identity.update') AND tcms.can_access_contract(contract_id));
CREATE POLICY work_scopes_delete_policy ON tcms.work_scopes FOR DELETE USING (
  tcms.has_permission('contract.identity.update') AND tcms.can_access_contract(contract_id)
);

CREATE POLICY contract_time_rules_select_policy ON tcms.contract_time_rules FOR SELECT USING (
  tcms.has_permission('contract.read') AND tcms.can_access_contract(contract_id)
);
CREATE POLICY contract_time_rules_insert_policy ON tcms.contract_time_rules FOR INSERT WITH CHECK (
  tcms.has_permission('contract.identity.update') AND tcms.can_access_contract(contract_id)
);
CREATE POLICY contract_time_rules_update_policy ON tcms.contract_time_rules FOR UPDATE
  USING (tcms.has_permission('contract.identity.update') AND tcms.can_access_contract(contract_id))
  WITH CHECK (tcms.has_permission('contract.identity.update') AND tcms.can_access_contract(contract_id));
CREATE POLICY contract_time_rules_delete_policy ON tcms.contract_time_rules FOR DELETE USING (
  tcms.has_permission('contract.identity.update') AND tcms.can_access_contract(contract_id)
);

INSERT INTO tcms.schema_migrations (version)
VALUES ('007_contract_time_rules_and_work_scopes');

COMMIT;
