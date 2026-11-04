-- Chỉ thêm bảng KTKT có tiền tố ctktkt_; không sửa dữ liệu/bảng hiện hữu.
-- Áp dụng riêng file này; không chạy db:push toàn bộ schema.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ctktkt_measurements (
	id SERIAL PRIMARY KEY,
	metric_code text NOT NULL,
	metric_name text NOT NULL,
	period text NOT NULL,
	actual text NOT NULL,
	limit_value text NOT NULL,
	note text DEFAULT '' NOT NULL,
	created_at text DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ctktkt_daily_inputs (
	id SERIAL PRIMARY KEY,
	operating_date text NOT NULL,
	field_code text NOT NULL,
	value text NOT NULL,
	note text DEFAULT '' NOT NULL,
	updated_at text DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ctktkt_ppa_heat_rate_daily (
	id SERIAL PRIMARY KEY,
	operating_date text NOT NULL,
	source_data text NOT NULL,
	source_files text DEFAULT '[]' NOT NULL,
	gross_s1_kwh text NOT NULL,
	net_s1_kwh text NOT NULL,
	gross_s2_kwh text NOT NULL,
	net_s2_kwh text NOT NULL,
	ppa_plant text NOT NULL,
	ppa_s1 text NOT NULL,
	ppa_s2 text NOT NULL,
	note_s1 text DEFAULT '' NOT NULL,
	note_s2 text DEFAULT '' NOT NULL,
	updated_at text DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ctktkt_operating_events (
	id SERIAL PRIMARY KEY,
	operating_date text NOT NULL,
	unit text NOT NULL,
	start_at text NOT NULL,
	end_at text DEFAULT '' NOT NULL,
	event_type integer NOT NULL,
	description text DEFAULT '' NOT NULL,
	updated_at text DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ctktkt_shift_readings (
	id SERIAL PRIMARY KEY,
	operating_date text NOT NULL,
	unit text NOT NULL,
	time_slot text NOT NULL,
	metric text NOT NULL,
	value text NOT NULL,
	updated_at text DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ctktkt_operational_read_versions (
  cache_key TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.ctktkt_water_shift_leaders (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')) NOT NULL
      )
    ;

CREATE TABLE IF NOT EXISTS public.ctktkt_water_shift_logs (
        id SERIAL PRIMARY KEY,
        log_date TEXT NOT NULL,
        shift_time TEXT NOT NULL,
        shift_team TEXT NOT NULL DEFAULT '',
        shift_leader TEXT NOT NULL DEFAULT '',
        elec_rec_s1 DOUBLE PRECISION DEFAULT 0,
        elec_rec_s2 DOUBLE PRECISION DEFAULT 0,
        elec_gen_s1 DOUBLE PRECISION DEFAULT 0,
        elec_gen_s2 DOUBLE PRECISION DEFAULT 0,
        water_rec_s1 DOUBLE PRECISION DEFAULT 0,
        water_rec_s2 DOUBLE PRECISION DEFAULT 0,
        water_used_s1 DOUBLE PRECISION DEFAULT 0,
        water_used_s2 DOUBLE PRECISION DEFAULT 0,
        water_ratio_s1 DOUBLE PRECISION DEFAULT 0,
        water_ratio_s2 DOUBLE PRECISION DEFAULT 0,
        condenser_rec_s1 DOUBLE PRECISION DEFAULT 0,
        condenser_rec_s2 DOUBLE PRECISION DEFAULT 0,
        condenser_used_s1 DOUBLE PRECISION DEFAULT 0,
        condenser_used_s2 DOUBLE PRECISION DEFAULT 0,
        resin_water_s1_24h DOUBLE PRECISION DEFAULT 0,
        resin_water_s2_24h DOUBLE PRECISION DEFAULT 0,
        note TEXT DEFAULT '',
        updated_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')) NOT NULL
      , water_adjustment_s1 DOUBLE PRECISION, water_adjustment_s2 DOUBLE PRECISION, condenser_adjustment_s1 DOUBLE PRECISION, condenser_adjustment_s2 DOUBLE PRECISION)
    ;

CREATE TABLE IF NOT EXISTS public.ctktkt_chemical_usage_logs (
      id SERIAL PRIMARY KEY,
      usage_date TEXT NOT NULL,
      chemical_code TEXT NOT NULL,
      material_code TEXT NOT NULL,
      chemical_name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'Tấn',
      quantity DOUBLE PRECISION NOT NULL,
      purpose TEXT NOT NULL DEFAULT '',
      plant_unit TEXT NOT NULL DEFAULT 'Chung',
      reference TEXT NOT NULL DEFAULT '',
      entered_by_user_id TEXT NOT NULL,
      entered_by_name TEXT NOT NULL,
      entered_by_position TEXT NOT NULL,
      updated_by_user_id TEXT,
      updated_by_name TEXT NOT NULL DEFAULT '',
      updated_by_position TEXT NOT NULL DEFAULT '',
      deleted_at TEXT,
      deleted_by_user_id TEXT,
      deleted_by_name TEXT NOT NULL DEFAULT '',
      deleted_by_position TEXT NOT NULL DEFAULT '',
      source_key TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
      updated_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
    )
  ;

CREATE TABLE IF NOT EXISTS public.ctktkt_daily_input_audit (
      id SERIAL PRIMARY KEY,
      changed_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
      actor_id TEXT NOT NULL, actor_username TEXT NOT NULL, actor_name TEXT NOT NULL,
      source TEXT NOT NULL, operating_date TEXT NOT NULL, field_code TEXT NOT NULL,
      action TEXT NOT NULL, old_value TEXT, new_value TEXT, old_note TEXT, new_note TEXT
    );

CREATE TABLE IF NOT EXISTS public.ctktkt_coal_meter_photos (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, report_date TEXT NOT NULL, slot TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL, reading TEXT NOT NULL, expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS public.ctktkt_coal_photo_usage (owner_id TEXT NOT NULL,bucket INTEGER NOT NULL,requests INTEGER NOT NULL,PRIMARY KEY(owner_id,bucket));

CREATE TABLE IF NOT EXISTS public.ctktkt_coal_gemini_settings (name TEXT PRIMARY KEY, cipher TEXT, model TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT, updated_by TEXT, operation TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS public.ctktkt_coal_gemini_settings_events (id TEXT PRIMARY KEY, version INTEGER NOT NULL, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS public.ctktkt_google_mirror_credentials (id INTEGER PRIMARY KEY CHECK(id=1), token_hash TEXT NOT NULL, token_enc TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS public.ctktkt_data_restore_audit (id SERIAL PRIMARY KEY, actor_id TEXT NOT NULL, checksum TEXT NOT NULL, mode TEXT NOT NULL, row_count INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')));

CREATE TABLE IF NOT EXISTS public.ctktkt_google_mirror_status (file_key TEXT PRIMARY KEY, period TEXT NOT NULL, synced_at TEXT NOT NULL, content_hash TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS ctktkt_idx_measurements_metric_period ON public.ctktkt_measurements (metric_code,period);
CREATE UNIQUE INDEX IF NOT EXISTS ctktkt_uidx_daily_inputs_date_field ON public.ctktkt_daily_inputs (operating_date,field_code);
CREATE INDEX IF NOT EXISTS ctktkt_idx_daily_inputs_date ON public.ctktkt_daily_inputs (operating_date);
CREATE INDEX IF NOT EXISTS ctktkt_idx_daily_inputs_field_date ON public.ctktkt_daily_inputs (field_code,operating_date);
CREATE UNIQUE INDEX IF NOT EXISTS ctktkt_uidx_ppa_heat_rate_daily_date ON public.ctktkt_ppa_heat_rate_daily (operating_date);
CREATE INDEX IF NOT EXISTS ctktkt_idx_ppa_heat_rate_daily_date ON public.ctktkt_ppa_heat_rate_daily (operating_date);
CREATE INDEX IF NOT EXISTS ctktkt_idx_operating_events_date ON public.ctktkt_operating_events (operating_date,unit);
CREATE UNIQUE INDEX IF NOT EXISTS ctktkt_uidx_shift_readings ON public.ctktkt_shift_readings (operating_date,unit,time_slot,metric);
CREATE INDEX IF NOT EXISTS ctktkt_idx_shift_readings_date ON public.ctktkt_shift_readings (operating_date);
CREATE UNIQUE INDEX IF NOT EXISTS ctktkt_uidx_water_shift_leaders_name ON public.ctktkt_water_shift_leaders (name)
    ;
CREATE UNIQUE INDEX IF NOT EXISTS ctktkt_uidx_water_shift_date_time ON public.ctktkt_water_shift_logs (log_date, shift_time)
    ;
CREATE INDEX IF NOT EXISTS ctktkt_idx_water_shift_date ON public.ctktkt_water_shift_logs (log_date)
    ;
CREATE INDEX IF NOT EXISTS ctktkt_idx_chemical_usage_date ON public.ctktkt_chemical_usage_logs (usage_date);
CREATE INDEX IF NOT EXISTS ctktkt_idx_chemical_usage_code_date ON public.ctktkt_chemical_usage_logs (chemical_code, usage_date);
CREATE UNIQUE INDEX IF NOT EXISTS ctktkt_uidx_chemical_usage_source_key ON public.ctktkt_chemical_usage_logs (source_key) WHERE source_key <> '';
CREATE INDEX IF NOT EXISTS ctktkt_idx_daily_input_audit_date ON public.ctktkt_daily_input_audit(operating_date, id);
CREATE INDEX IF NOT EXISTS ctktkt_coal_photo_expiry ON public.ctktkt_coal_meter_photos(expires_at);
COMMIT;
