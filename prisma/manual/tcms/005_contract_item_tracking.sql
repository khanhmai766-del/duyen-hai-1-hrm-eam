BEGIN;

CREATE TABLE tcms.contract_item_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_item_id uuid NOT NULL REFERENCES tcms.contract_items(id) ON DELETE CASCADE,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  description text NOT NULL CHECK (btrim(description) <> ''),
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (contract_item_id, sequence_number),
  CHECK (
    (is_completed AND completed_at IS NOT NULL AND completed_by IS NOT NULL)
    OR (NOT is_completed AND completed_at IS NULL AND completed_by IS NULL)
  )
);

CREATE TABLE tcms.contract_item_daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_item_id uuid NOT NULL REFERENCES tcms.contract_items(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  note text NOT NULL CHECK (btrim(note) <> ''),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX contract_item_checklist_item_idx
  ON tcms.contract_item_checklist_items (contract_item_id, sequence_number);
CREATE INDEX contract_item_daily_log_idx
  ON tcms.contract_item_daily_logs (contract_item_id, log_date DESC, created_at DESC);

CREATE OR REPLACE FUNCTION tcms.touch_contract_item_checklist_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER contract_item_checklist_touch_updated_at
BEFORE UPDATE ON tcms.contract_item_checklist_items
FOR EACH ROW EXECUTE FUNCTION tcms.touch_contract_item_checklist_updated_at();

CREATE OR REPLACE FUNCTION tcms.prevent_contract_item_daily_log_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'contract_item_daily_logs is append-only';
END;
$$;

CREATE TRIGGER contract_item_daily_logs_no_mutation
BEFORE UPDATE OR DELETE ON tcms.contract_item_daily_logs
FOR EACH ROW EXECUTE FUNCTION tcms.prevent_contract_item_daily_log_mutation();

CREATE TRIGGER contract_item_checklist_write_audit
AFTER INSERT OR UPDATE OR DELETE ON tcms.contract_item_checklist_items
FOR EACH ROW EXECUTE FUNCTION tcms.write_row_audit();
CREATE TRIGGER contract_item_daily_logs_write_audit
AFTER INSERT ON tcms.contract_item_daily_logs
FOR EACH ROW EXECUTE FUNCTION tcms.write_row_audit();

ALTER TABLE tcms.contract_item_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcms.contract_item_checklist_items FORCE ROW LEVEL SECURITY;
ALTER TABLE tcms.contract_item_daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcms.contract_item_daily_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY contract_item_checklist_select_policy
ON tcms.contract_item_checklist_items FOR SELECT USING (
  tcms.has_permission('contract.read') AND EXISTS (
    SELECT 1 FROM tcms.contract_items ci
    WHERE ci.id = contract_item_id AND ci.archived_at IS NULL
      AND tcms.can_access_contract(ci.contract_id)
  )
);
CREATE POLICY contract_item_checklist_insert_policy
ON tcms.contract_item_checklist_items FOR INSERT WITH CHECK (
  (tcms.has_permission('contract.identity.update') OR tcms.has_permission('contract.progress.update'))
  AND EXISTS (
    SELECT 1 FROM tcms.contract_items ci
    WHERE ci.id = contract_item_id AND ci.archived_at IS NULL
      AND tcms.can_access_contract(ci.contract_id)
  )
);
CREATE POLICY contract_item_checklist_update_policy
ON tcms.contract_item_checklist_items FOR UPDATE
USING (
  tcms.has_permission('contract.progress.update') AND EXISTS (
    SELECT 1 FROM tcms.contract_items ci
    WHERE ci.id = contract_item_id AND ci.archived_at IS NULL
      AND tcms.can_access_contract(ci.contract_id)
  )
)
WITH CHECK (
  tcms.has_permission('contract.progress.update') AND EXISTS (
    SELECT 1 FROM tcms.contract_items ci
    WHERE ci.id = contract_item_id AND ci.archived_at IS NULL
      AND tcms.can_access_contract(ci.contract_id)
  )
);

CREATE POLICY contract_item_daily_logs_select_policy
ON tcms.contract_item_daily_logs FOR SELECT USING (
  tcms.has_permission('contract.read') AND EXISTS (
    SELECT 1 FROM tcms.contract_items ci
    WHERE ci.id = contract_item_id AND ci.archived_at IS NULL
      AND tcms.can_access_contract(ci.contract_id)
  )
);
CREATE POLICY contract_item_daily_logs_insert_policy
ON tcms.contract_item_daily_logs FOR INSERT WITH CHECK (
  tcms.has_permission('contract.progress.update') AND EXISTS (
    SELECT 1 FROM tcms.contract_items ci
    WHERE ci.id = contract_item_id AND ci.archived_at IS NULL
      AND tcms.can_access_contract(ci.contract_id)
  )
);

INSERT INTO tcms.schema_migrations (version)
VALUES ('005_contract_item_tracking');

COMMIT;
