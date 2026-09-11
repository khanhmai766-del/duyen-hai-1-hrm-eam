BEGIN;

ALTER TABLE tcms.contracts
  ALTER COLUMN progress_percent TYPE numeric(7,4) USING progress_percent::numeric;

ALTER TABLE tcms.contract_items
  ADD COLUMN group_code text,
  ADD COLUMN group_name text,
  ADD COLUMN service_location text,
  ADD COLUMN completion_duration_days integer CHECK (completion_duration_days IS NULL OR completion_duration_days > 0);

CREATE OR REPLACE FUNCTION tcms.validate_contract_item_weight_total()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  total_weight numeric;
BEGIN
  PERFORM 1 FROM tcms.contracts WHERE id = NEW.contract_id FOR UPDATE;
  SELECT COALESCE(SUM(weight_percent), 0) INTO total_weight
  FROM tcms.contract_items
  WHERE contract_id = NEW.contract_id AND archived_at IS NULL AND id <> NEW.id;
  total_weight := total_weight + COALESCE(NEW.weight_percent, 0);
  IF total_weight > 100 THEN
    RAISE EXCEPTION 'CONTRACT_ITEM_WEIGHT_TOTAL_EXCEEDED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER contract_items_validate_weight_total
BEFORE INSERT OR UPDATE OF contract_id, weight_percent, archived_at ON tcms.contract_items
FOR EACH ROW EXECUTE FUNCTION tcms.validate_contract_item_weight_total();

CREATE OR REPLACE FUNCTION tcms.sync_contract_weighted_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  target_contract_id uuid := COALESCE(NEW.contract_id, OLD.contract_id);
  total_weight numeric;
  weighted_progress numeric;
BEGIN
  SELECT COALESCE(SUM(weight_percent), 0), COALESCE(SUM(progress_percent * weight_percent), 0) / 100
  INTO total_weight, weighted_progress
  FROM tcms.contract_items WHERE contract_id = target_contract_id AND archived_at IS NULL;
  IF total_weight = 100 THEN
    UPDATE tcms.contracts SET progress_percent = weighted_progress,
      progress_note = 'Tự động tổng hợp từ hạng mục hợp đồng', updated_by = current_setting('app.actor_id')
    WHERE id = target_contract_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER contract_items_sync_contract_progress
AFTER INSERT OR UPDATE OF weight_percent, progress_percent, archived_at OR DELETE ON tcms.contract_items
FOR EACH ROW EXECUTE FUNCTION tcms.sync_contract_weighted_progress();

INSERT INTO tcms.schema_migrations (version) VALUES ('004_contract_item_business_fields');
COMMIT;
