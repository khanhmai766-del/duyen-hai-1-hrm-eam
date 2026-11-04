export const PPA_HEAT_RATE_UPSERT_SQL = `
  INSERT INTO ppa_heat_rate_daily (
    operating_date, source_data, source_files,
    gross_s1_kwh, net_s1_kwh, gross_s2_kwh, net_s2_kwh,
    ppa_plant, ppa_s1, ppa_s2,
    note_s1, note_s2, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(operating_date) DO UPDATE SET
    source_data = excluded.source_data,
    source_files = excluded.source_files,
    gross_s1_kwh = excluded.gross_s1_kwh,
    net_s1_kwh = excluded.net_s1_kwh,
    gross_s2_kwh = excluded.gross_s2_kwh,
    net_s2_kwh = excluded.net_s2_kwh,
    ppa_plant = excluded.ppa_plant,
    ppa_s1 = excluded.ppa_s1,
    ppa_s2 = excluded.ppa_s2,
    note_s1 = CASE WHEN excluded.note_s1 = '' THEN ppa_heat_rate_daily.note_s1 ELSE excluded.note_s1 END,
    note_s2 = CASE WHEN excluded.note_s2 = '' THEN ppa_heat_rate_daily.note_s2 ELSE excluded.note_s2 END,
    updated_at = CURRENT_TIMESTAMP
`;
