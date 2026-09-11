BEGIN;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM tcms.schema_migrations WHERE version='016_milestones') THEN RAISE EXCEPTION 'Migration 016_milestones was already applied'; END IF;
END $$;

ALTER TABLE tcms.contract_items ADD CONSTRAINT contract_items_id_contract_unique UNIQUE(id,contract_id);

CREATE TABLE tcms.milestones(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES tcms.contracts(id) ON DELETE CASCADE,
  work_scope_id uuid,
  contract_item_id uuid,
  owner_user_id uuid REFERENCES tcms.app_users(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK(btrim(code)<>''),
  name text NOT NULL CHECK(btrim(name)<>''),
  description text,
  planned_date date NOT NULL,
  forecast_date date,
  actual_date date,
  progress_percent smallint NOT NULL DEFAULT 0 CHECK(progress_percent BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED','IN_PROGRESS','AT_RISK','DELAYED','COMPLETED','CANCELLED')),
  critical boolean NOT NULL DEFAULT false,
  notes text,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  archived_at timestamptz,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(work_scope_id,contract_id) REFERENCES tcms.work_scopes(id,contract_id) ON DELETE RESTRICT,
  FOREIGN KEY(contract_item_id,contract_id) REFERENCES tcms.contract_items(id,contract_id) ON DELETE RESTRICT,
  CHECK((status='COMPLETED' AND progress_percent=100 AND actual_date IS NOT NULL) OR (status<>'COMPLETED' AND actual_date IS NULL))
);

CREATE UNIQUE INDEX milestones_contract_code_unique ON tcms.milestones(contract_id,code) WHERE archived_at IS NULL;
CREATE INDEX milestones_contract_date_idx ON tcms.milestones(contract_id,planned_date) WHERE archived_at IS NULL;
CREATE INDEX milestones_owner_idx ON tcms.milestones(owner_user_id,planned_date) WHERE owner_user_id IS NOT NULL AND archived_at IS NULL;

CREATE OR REPLACE FUNCTION tcms.touch_milestone()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at:=clock_timestamp();NEW.version:=OLD.version+1;RETURN NEW;END; $$;
CREATE OR REPLACE FUNCTION tcms.enforce_milestone_write_permission()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  IF NOT tcms.has_permission('contract.progress.update') OR NOT tcms.can_access_contract(NEW.contract_id) THEN RAISE EXCEPTION 'contract.progress.update permission and contract scope are required'; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER milestones_touch BEFORE UPDATE ON tcms.milestones FOR EACH ROW EXECUTE FUNCTION tcms.touch_milestone();
CREATE TRIGGER milestones_enforce BEFORE INSERT OR UPDATE ON tcms.milestones FOR EACH ROW EXECUTE FUNCTION tcms.enforce_milestone_write_permission();
CREATE TRIGGER milestones_audit AFTER INSERT OR UPDATE ON tcms.milestones FOR EACH ROW EXECUTE FUNCTION tcms.write_row_audit();

ALTER TABLE tcms.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcms.milestones FORCE ROW LEVEL SECURITY;
CREATE POLICY milestones_select ON tcms.milestones FOR SELECT USING(tcms.has_permission('contract.read') AND tcms.can_access_contract(contract_id));
CREATE POLICY milestones_insert ON tcms.milestones FOR INSERT WITH CHECK(tcms.has_permission('contract.progress.update') AND tcms.can_access_contract(contract_id));
CREATE POLICY milestones_update ON tcms.milestones FOR UPDATE USING(tcms.has_permission('contract.progress.update') AND tcms.can_access_contract(contract_id)) WITH CHECK(tcms.has_permission('contract.progress.update') AND tcms.can_access_contract(contract_id));

INSERT INTO tcms.schema_migrations(version) VALUES('016_milestones');
COMMIT;
