/** All tables read by the snapshot and shared workbook builders. Keep global
 * revisions for historical carryovers/year-to-date values, but unrelated user
 * and app updates must not force all nine reports to be regenerated. */
export function mirrorSourceVersions(versions: Record<string, number>) {
  return ['daily_inputs', 'shift_readings', 'water_shift_logs', 'ppa_heat_rate_daily', 'chemical_usage_logs', 'operating_events']
    .map(key => [key, versions[key] || 0] as const);
}
