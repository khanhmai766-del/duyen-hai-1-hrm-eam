BEGIN;

CREATE TABLE tcms.contract_goods_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES tcms.contracts(id) ON DELETE CASCADE,
  work_scope_id uuid,
  sequence integer NOT NULL CHECK (sequence > 0),
  item_code text,
  description text NOT NULL CHECK (btrim(description) <> ''),
  technical_specification text,
  manufacturer text,
  model text,
  origin text,
  quantity numeric(18,4) CHECK (quantity IS NULL OR quantity >= 0),
  unit text,
  document_requirement_text text,
  raw_clause text,
  source_page integer CHECK (source_page IS NULL OR source_page > 0),
  evidence text,
  confidence numeric(5,4) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE NULLS NOT DISTINCT (contract_id, work_scope_id, sequence),
  FOREIGN KEY (work_scope_id, contract_id)
    REFERENCES tcms.work_scopes(id, contract_id) ON DELETE RESTRICT
);

CREATE INDEX contract_goods_items_item_code_idx
  ON tcms.contract_goods_items (item_code) WHERE item_code IS NOT NULL;

CREATE TRIGGER contract_goods_items_touch_updated_at
BEFORE UPDATE ON tcms.contract_goods_items
FOR EACH ROW EXECUTE FUNCTION tcms.touch_contract_structure_updated_at();
CREATE TRIGGER contract_goods_items_write_audit
AFTER INSERT OR UPDATE OR DELETE ON tcms.contract_goods_items
FOR EACH ROW EXECUTE FUNCTION tcms.write_row_audit();

ALTER TABLE tcms.contract_goods_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcms.contract_goods_items FORCE ROW LEVEL SECURITY;
CREATE POLICY contract_goods_items_select_policy ON tcms.contract_goods_items FOR SELECT USING (
  tcms.has_permission('contract.read') AND tcms.can_access_contract(contract_id)
);
CREATE POLICY contract_goods_items_insert_policy ON tcms.contract_goods_items FOR INSERT WITH CHECK (
  tcms.has_permission('contract.identity.update') AND tcms.can_access_contract(contract_id)
);
CREATE POLICY contract_goods_items_update_policy ON tcms.contract_goods_items FOR UPDATE
  USING (tcms.has_permission('contract.identity.update') AND tcms.can_access_contract(contract_id))
  WITH CHECK (tcms.has_permission('contract.identity.update') AND tcms.can_access_contract(contract_id));
CREATE POLICY contract_goods_items_delete_policy ON tcms.contract_goods_items FOR DELETE USING (
  tcms.has_permission('contract.identity.update') AND tcms.can_access_contract(contract_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON tcms.contract_goods_items TO tcms_app_runtime;

INSERT INTO tcms.schema_migrations (version) VALUES ('008_contract_goods_items');
COMMIT;
