BEGIN;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM tcms.schema_migrations WHERE version='017_inspections_and_technical_issues') THEN RAISE EXCEPTION 'Migration 017_inspections_and_technical_issues was already applied'; END IF; END $$;

CREATE TABLE tcms.inspections(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),contract_id uuid NOT NULL REFERENCES tcms.contracts(id) ON DELETE RESTRICT,work_scope_id uuid,contract_item_id uuid,
  inspector_user_id uuid REFERENCES tcms.app_users(id) ON DELETE RESTRICT,code text NOT NULL CHECK(btrim(code)<>''),title text NOT NULL CHECK(btrim(title)<>''),inspection_date date NOT NULL,
  inspection_type text NOT NULL CHECK(inspection_type IN ('ROUTINE','HOLD_POINT','WITNESS','TECHNICAL','SAFETY')),location text,
  result text NOT NULL DEFAULT 'PENDING' CHECK(result IN ('PENDING','CONFORMING','CONFORMING_WITH_FINDINGS','NONCONFORMING','CANCELLED')),
  summary text,recommendations text,next_inspection_date date,version integer NOT NULL DEFAULT 1 CHECK(version>0),created_by text NOT NULL,updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(id,contract_id),
  FOREIGN KEY(work_scope_id,contract_id) REFERENCES tcms.work_scopes(id,contract_id) ON DELETE RESTRICT,
  FOREIGN KEY(contract_item_id,contract_id) REFERENCES tcms.contract_items(id,contract_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX inspections_contract_code_unique ON tcms.inspections(contract_id,code);
CREATE INDEX inspections_contract_date_idx ON tcms.inspections(contract_id,inspection_date DESC);

CREATE TABLE tcms.technical_issues(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),contract_id uuid NOT NULL REFERENCES tcms.contracts(id) ON DELETE RESTRICT,inspection_id uuid,work_scope_id uuid,contract_item_id uuid,
  assignee_user_id uuid REFERENCES tcms.app_users(id) ON DELETE RESTRICT,code text NOT NULL CHECK(btrim(code)<>''),title text NOT NULL CHECK(btrim(title)<>''),description text NOT NULL CHECK(btrim(description)<>''),
  category text NOT NULL CHECK(category IN ('TECHNICAL','QUALITY','SAFETY','ENVIRONMENT','SCHEDULE','OTHER')),severity text NOT NULL CHECK(severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','PENDING_VERIFICATION','RESOLVED','CLOSED','CANCELLED')),discovered_date date NOT NULL,due_date date,resolved_date date,resolution text,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),created_by text NOT NULL,updated_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(inspection_id,contract_id) REFERENCES tcms.inspections(id,contract_id) ON DELETE RESTRICT,
  FOREIGN KEY(work_scope_id,contract_id) REFERENCES tcms.work_scopes(id,contract_id) ON DELETE RESTRICT,
  FOREIGN KEY(contract_item_id,contract_id) REFERENCES tcms.contract_items(id,contract_id) ON DELETE RESTRICT,
  CHECK((status IN ('RESOLVED','CLOSED') AND resolved_date IS NOT NULL AND COALESCE(btrim(resolution),'')<>'') OR (status NOT IN ('RESOLVED','CLOSED') AND resolved_date IS NULL AND resolution IS NULL))
);
CREATE UNIQUE INDEX technical_issues_contract_code_unique ON tcms.technical_issues(contract_id,code);
CREATE INDEX technical_issues_contract_status_idx ON tcms.technical_issues(contract_id,status,due_date);
CREATE INDEX technical_issues_assignee_idx ON tcms.technical_issues(assignee_user_id,status) WHERE assignee_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION tcms.touch_inspection_domain() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at:=clock_timestamp();NEW.version:=OLD.version+1;RETURN NEW;END; $$;
CREATE OR REPLACE FUNCTION tcms.enforce_inspection_write_permission() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$ BEGIN IF NOT tcms.has_permission('contract.acceptance.update') OR NOT tcms.can_access_contract(NEW.contract_id) THEN RAISE EXCEPTION 'contract.acceptance.update permission and contract scope are required';END IF;RETURN NEW;END; $$;
CREATE OR REPLACE FUNCTION tcms.enforce_issue_write_permission() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$ BEGIN IF NOT tcms.has_permission('contract.progress.update') OR NOT tcms.can_access_contract(NEW.contract_id) THEN RAISE EXCEPTION 'contract.progress.update permission and contract scope are required';END IF;RETURN NEW;END; $$;

CREATE TRIGGER inspections_touch BEFORE UPDATE ON tcms.inspections FOR EACH ROW EXECUTE FUNCTION tcms.touch_inspection_domain();
CREATE TRIGGER inspections_enforce BEFORE INSERT OR UPDATE ON tcms.inspections FOR EACH ROW EXECUTE FUNCTION tcms.enforce_inspection_write_permission();
CREATE TRIGGER inspections_audit AFTER INSERT OR UPDATE ON tcms.inspections FOR EACH ROW EXECUTE FUNCTION tcms.write_row_audit();
CREATE TRIGGER technical_issues_touch BEFORE UPDATE ON tcms.technical_issues FOR EACH ROW EXECUTE FUNCTION tcms.touch_inspection_domain();
CREATE TRIGGER technical_issues_enforce BEFORE INSERT OR UPDATE ON tcms.technical_issues FOR EACH ROW EXECUTE FUNCTION tcms.enforce_issue_write_permission();
CREATE TRIGGER technical_issues_audit AFTER INSERT OR UPDATE ON tcms.technical_issues FOR EACH ROW EXECUTE FUNCTION tcms.write_row_audit();

ALTER TABLE tcms.inspections ENABLE ROW LEVEL SECURITY;ALTER TABLE tcms.inspections FORCE ROW LEVEL SECURITY;
ALTER TABLE tcms.technical_issues ENABLE ROW LEVEL SECURITY;ALTER TABLE tcms.technical_issues FORCE ROW LEVEL SECURITY;
CREATE POLICY inspections_select ON tcms.inspections FOR SELECT USING(tcms.has_permission('contract.read') AND tcms.can_access_contract(contract_id));
CREATE POLICY inspections_insert ON tcms.inspections FOR INSERT WITH CHECK(tcms.has_permission('contract.acceptance.update') AND tcms.can_access_contract(contract_id));
CREATE POLICY inspections_update ON tcms.inspections FOR UPDATE USING(tcms.has_permission('contract.acceptance.update') AND tcms.can_access_contract(contract_id)) WITH CHECK(tcms.has_permission('contract.acceptance.update') AND tcms.can_access_contract(contract_id));
CREATE POLICY technical_issues_select ON tcms.technical_issues FOR SELECT USING(tcms.has_permission('contract.read') AND tcms.can_access_contract(contract_id));
CREATE POLICY technical_issues_insert ON tcms.technical_issues FOR INSERT WITH CHECK(tcms.has_permission('contract.progress.update') AND tcms.can_access_contract(contract_id));
CREATE POLICY technical_issues_update ON tcms.technical_issues FOR UPDATE USING(tcms.has_permission('contract.progress.update') AND tcms.can_access_contract(contract_id)) WITH CHECK(tcms.has_permission('contract.progress.update') AND tcms.can_access_contract(contract_id));

GRANT SELECT,INSERT,UPDATE ON tcms.inspections,tcms.technical_issues TO tcms_app_runtime;
INSERT INTO tcms.schema_migrations(version) VALUES('017_inspections_and_technical_issues');
COMMIT;
