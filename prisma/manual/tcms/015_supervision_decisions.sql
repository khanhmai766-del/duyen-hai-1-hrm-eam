BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM tcms.schema_migrations WHERE version='015_supervision_decisions') THEN
    RAISE EXCEPTION 'Migration 015_supervision_decisions was already applied';
  END IF;
END $$;

CREATE TABLE tcms.supervision_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES tcms.contracts(id) ON DELETE RESTRICT,
  decision_number text NOT NULL CHECK(btrim(decision_number)<>''),
  decision_date date NOT NULL,
  title text NOT NULL CHECK(btrim(title)<>''),
  effective_from date NOT NULL,
  effective_until date,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ISSUED','SUPERSEDED','REVOKED')),
  notes text,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,contract_id),
  UNIQUE(contract_id,decision_number),
  CHECK(effective_until IS NULL OR effective_until>=effective_from)
);

CREATE TABLE tcms.supervision_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES tcms.app_users(id) ON DELETE RESTRICT,
  work_scope_id uuid,
  supervisor_role text NOT NULL CHECK(btrim(supervisor_role)<>''),
  responsibility text,
  active_from date,
  active_until date,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(decision_id,contract_id) REFERENCES tcms.supervision_decisions(id,contract_id) ON DELETE CASCADE,
  FOREIGN KEY(work_scope_id,contract_id) REFERENCES tcms.work_scopes(id,contract_id) ON DELETE RESTRICT,
  UNIQUE NULLS NOT DISTINCT(decision_id,user_id,work_scope_id,supervisor_role),
  CHECK(active_until IS NULL OR active_from IS NULL OR active_until>=active_from)
);

CREATE INDEX supervision_decisions_contract_idx ON tcms.supervision_decisions(contract_id,status,effective_from);
CREATE INDEX supervision_assignments_user_idx ON tcms.supervision_assignments(user_id,contract_id);
CREATE INDEX supervision_assignments_scope_idx ON tcms.supervision_assignments(work_scope_id) WHERE work_scope_id IS NOT NULL;

CREATE OR REPLACE FUNCTION tcms.touch_supervision_decision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at:=clock_timestamp(); NEW.version:=OLD.version+1; RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION tcms.touch_supervision_assignment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at:=clock_timestamp(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION tcms.enforce_supervision_write_permission()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE target_contract_id uuid;
BEGIN
  target_contract_id:=CASE WHEN TG_OP='DELETE' THEN OLD.contract_id ELSE NEW.contract_id END;
  IF NOT tcms.has_permission('contract.assignment.manage') OR NOT tcms.can_access_contract(target_contract_id) THEN
    RAISE EXCEPTION 'contract.assignment.manage permission and contract scope are required';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER supervision_decisions_touch BEFORE UPDATE ON tcms.supervision_decisions
FOR EACH ROW EXECUTE FUNCTION tcms.touch_supervision_decision();
CREATE TRIGGER supervision_assignments_touch BEFORE UPDATE ON tcms.supervision_assignments
FOR EACH ROW EXECUTE FUNCTION tcms.touch_supervision_assignment();
CREATE TRIGGER supervision_decisions_enforce BEFORE INSERT OR UPDATE ON tcms.supervision_decisions
FOR EACH ROW EXECUTE FUNCTION tcms.enforce_supervision_write_permission();
CREATE TRIGGER supervision_assignments_enforce BEFORE INSERT OR UPDATE OR DELETE ON tcms.supervision_assignments
FOR EACH ROW EXECUTE FUNCTION tcms.enforce_supervision_write_permission();
CREATE TRIGGER supervision_decisions_audit AFTER INSERT OR UPDATE ON tcms.supervision_decisions
FOR EACH ROW EXECUTE FUNCTION tcms.write_row_audit();
CREATE TRIGGER supervision_assignments_audit AFTER INSERT OR UPDATE OR DELETE ON tcms.supervision_assignments
FOR EACH ROW EXECUTE FUNCTION tcms.write_row_audit();

ALTER TABLE tcms.supervision_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcms.supervision_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE tcms.supervision_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcms.supervision_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY supervision_decisions_select ON tcms.supervision_decisions FOR SELECT USING(
  tcms.has_permission('contract.read') AND tcms.can_access_contract(contract_id));
CREATE POLICY supervision_decisions_insert ON tcms.supervision_decisions FOR INSERT WITH CHECK(
  tcms.has_permission('contract.assignment.manage') AND tcms.can_access_contract(contract_id));
CREATE POLICY supervision_decisions_update ON tcms.supervision_decisions FOR UPDATE USING(
  tcms.has_permission('contract.assignment.manage') AND tcms.can_access_contract(contract_id)) WITH CHECK(
  tcms.has_permission('contract.assignment.manage') AND tcms.can_access_contract(contract_id));
CREATE POLICY supervision_assignments_select ON tcms.supervision_assignments FOR SELECT USING(
  tcms.has_permission('contract.read') AND tcms.can_access_contract(contract_id));
CREATE POLICY supervision_assignments_insert ON tcms.supervision_assignments FOR INSERT WITH CHECK(
  tcms.has_permission('contract.assignment.manage') AND tcms.can_access_contract(contract_id));
CREATE POLICY supervision_assignments_update ON tcms.supervision_assignments FOR UPDATE USING(
  tcms.has_permission('contract.assignment.manage') AND tcms.can_access_contract(contract_id)) WITH CHECK(
  tcms.has_permission('contract.assignment.manage') AND tcms.can_access_contract(contract_id));
CREATE POLICY supervision_assignments_delete ON tcms.supervision_assignments FOR DELETE USING(
  tcms.has_permission('contract.assignment.manage') AND tcms.can_access_contract(contract_id));

GRANT SELECT,INSERT,UPDATE ON tcms.supervision_decisions TO tcms_app_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON tcms.supervision_assignments TO tcms_app_runtime;

INSERT INTO tcms.schema_migrations(version) VALUES('015_supervision_decisions');
COMMIT;
