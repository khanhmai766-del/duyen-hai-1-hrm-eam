/** Bound day reads; retain the previous day for meter differences/carryover. */
export function reportReadRange(period: string, date: string | null, includePreviousDay = false) {
  if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(period)) return null;
  if (date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(`${period}-`))) return null;
  const start = new Date(`${date ?? `${period}-01`}T12:00:00Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== (date ?? `${period}-01`)) return null;
  const end = new Date(start);
  if (date !== null) end.setUTCDate(end.getUTCDate() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  if (includePreviousDay) start.setUTCDate(start.getUTCDate() - 1);
  return { from: start.toISOString().slice(0, 10), next: end.toISOString().slice(0, 10) };
}

/** Optional inclusive bounds inside a month; never silently broaden invalid requests. */
export function reportQueryRange(params: URLSearchParams, includePreviousDay = false) {
  const period=params.get("period")||"",date=params.get("date");
  const from=params.get("from"),to=params.get("to");
  if(from===null&&to===null)return reportReadRange(period,date,includePreviousDay);
  if(date!==null||from===null||to===null||from>to)return null;
  const start=reportReadRange(period,from,includePreviousDay),end=reportReadRange(period,to);
  return start&&end?{from:start.from,next:end.next}:null;
}
