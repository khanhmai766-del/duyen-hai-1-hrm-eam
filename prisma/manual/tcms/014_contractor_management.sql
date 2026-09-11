BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM tcms.schema_migrations WHERE version='014_contractor_management') THEN
    RAISE EXCEPTION 'Migration 014_contractor_management was already applied';
  END IF;
END $$;

SELECT set_config('app.actor_id','migration-014',true);
SELECT set_config('app.permissions','["contract.identity.update","audit.write"]',true);
SELECT set_config('app.department_ids','[]',true);
SELECT set_config('app.assigned_contract_ids','[]',true);
SELECT set_config('app.global_contract_scope','true',true);
SELECT set_config('app.environment',CASE WHEN current_database() LIKE '%\_dev' THEN 'development' WHEN current_database() LIKE '%\_test' THEN 'test' ELSE 'production' END,true);
SELECT set_config('app.correlation_id','migration-014-contractor-backfill',true);
SELECT set_config('app.app_version','migration-014',true);

CREATE OR REPLACE FUNCTION tcms.write_contractor_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=tcms,pg_temp AS $$
DECLARE before_value jsonb; after_value jsonb; resource_value text;
BEGIN
  IF NULLIF(current_setting('app.actor_id',true),'') IS NULL
     OR NULLIF(current_setting('app.correlation_id',true),'') IS NULL
     OR NULLIF(current_setting('app.app_version',true),'') IS NULL THEN
    RAISE EXCEPTION 'audit context must be set before contractor mutations';
  END IF;
  before_value:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)-'sensitive_ciphertext' ELSE NULL END;
  after_value:=to_jsonb(NEW)-'sensitive_ciphertext';
  resource_value:=NEW.id::text;
  INSERT INTO tcms.audit_events(environment,actor_id,action,resource_type,resource_id,result,before_data,after_data,correlation_id,app_version)
  VALUES(NULLIF(current_setting('app.environment',true),''),NULLIF(current_setting('app.actor_id',true),''),
    'CONTRACTOR_'||TG_OP,'contractors',resource_value,'SUCCESS',before_value,after_value,
    NULLIF(current_setting('app.correlation_id',true),''),NULLIF(current_setting('app.app_version',true),''));
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION tcms.write_contractor_audit() FROM PUBLIC;
DROP TRIGGER contractors_write_audit ON tcms.contractors;
CREATE TRIGGER contractors_write_audit AFTER INSERT OR UPDATE ON tcms.contractors
FOR EACH ROW EXECUTE FUNCTION tcms.write_contractor_audit();

UPDATE tcms.contractors
SET code='LEGACY-'||upper(substr(encode(digest(id::text,'sha256'),'hex'),1,16))
WHERE code IS NULL OR btrim(code)='';

ALTER TABLE tcms.contractors
  ALTER COLUMN code SET NOT NULL,
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);

CREATE UNIQUE INDEX contractors_tax_code_unique_idx ON tcms.contractors(tax_code) WHERE tax_code IS NOT NULL;

INSERT INTO tcms.contractors(code,name,active,created_by,updated_by)
SELECT 'LEGACY-'||upper(substr(encode(digest(lower(btrim(c.contractor_name)),'sha256'),'hex'),1,16)),
  min(btrim(c.contractor_name)),true,'migration-014','migration-014'
FROM tcms.contracts c
WHERE c.contractor_id IS NULL AND btrim(c.contractor_name)<>''
  AND NOT EXISTS(SELECT 1 FROM tcms.contractors n WHERE lower(btrim(n.name))=lower(btrim(c.contractor_name)))
GROUP BY lower(btrim(c.contractor_name))
ON CONFLICT(code) DO NOTHING;

UPDATE tcms.contracts c SET contractor_id=(
  SELECT n.id FROM tcms.contractors n
  WHERE lower(btrim(n.name))=lower(btrim(c.contractor_name)) ORDER BY n.created_at,n.id LIMIT 1
)
WHERE c.contractor_id IS NULL AND EXISTS(
  SELECT 1 FROM tcms.contractors n WHERE lower(btrim(n.name))=lower(btrim(c.contractor_name))
);

CREATE OR REPLACE FUNCTION tcms.touch_contractor_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at:=clock_timestamp(); NEW.version:=OLD.version+1; RETURN NEW;
END;
$$;

DROP TRIGGER contractors_touch_updated_at ON tcms.contractors;
CREATE TRIGGER contractors_touch_updated_at BEFORE UPDATE ON tcms.contractors
FOR EACH ROW EXECUTE FUNCTION tcms.touch_contractor_updated_at();

CREATE OR REPLACE FUNCTION tcms.enforce_contractor_write_permission()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  IF NOT tcms.has_permission('contract.identity.update') THEN
    RAISE EXCEPTION 'contract.identity.update permission is required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER contractors_enforce_write_permission BEFORE INSERT OR UPDATE ON tcms.contractors
FOR EACH ROW EXECUTE FUNCTION tcms.enforce_contractor_write_permission();

DROP POLICY contractors_write_policy ON tcms.contractors;
CREATE POLICY contractors_insert_policy ON tcms.contractors FOR INSERT
WITH CHECK(tcms.has_permission('contract.identity.update'));
CREATE POLICY contractors_update_policy ON tcms.contractors FOR UPDATE
USING(tcms.has_permission('contract.identity.update'))
WITH CHECK(tcms.has_permission('contract.identity.update'));

INSERT INTO tcms.schema_migrations(version) VALUES('014_contractor_management');
COMMIT;
