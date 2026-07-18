export const HC_PERIODS = ["FULL_DAY", "MORNING", "AFTERNOON", "MORNING_OFF"] as const;

export type HcPeriod = (typeof HC_PERIODS)[number];

export const HC_PERIOD_LABEL: Record<HcPeriod, string> = {
  FULL_DAY: "Cả ngày",
  MORNING: "Buổi sáng",
  AFTERNOON: "Buổi chiều",
  MORNING_OFF: "Ra ca sáng",
};

export const HC_PERIOD_HOURS: Record<HcPeriod, number> = {
  FULL_DAY: 8,
  MORNING: 4,
  AFTERNOON: 4,
  MORNING_OFF: 3,
};

export const HC_REGISTRATION_CONTENT_PREFIX = "Hành chính - ";

export function hcRegistrationContent(period: HcPeriod) {
  return `${HC_REGISTRATION_CONTENT_PREFIX}${HC_PERIOD_LABEL[period]}`;
}

export const HC_REGISTRATION_CONTENTS = HC_PERIODS.map(hcRegistrationContent);

export function normalizeHcPeriod(value?: string | null): HcPeriod {
  return HC_PERIODS.includes(value as HcPeriod) ? (value as HcPeriod) : "FULL_DAY";
}

export function hcPeriodBucket(value?: string | null) {
  const period = normalizeHcPeriod(value);
  if (period === "AFTERNOON") return "AFTERNOON";
  if (period === "FULL_DAY") return "FULL_DAY";
  return "MORNING";
}

export function aggregateHcHoursByPeriod<T extends { hours: number; period?: string | null }>(
  entries: T[],
  options: { hasMorningShift?: boolean } = {}
) {
  let fullDay = 0;
  let morning = 0;
  let afternoon = 0;

  for (const entry of entries) {
    const hours = Math.max(0, Number(entry.hours) || 0);
    const bucket = hcPeriodBucket(entry.period);
    if (bucket === "FULL_DAY") fullDay = Math.max(fullDay, hours);
    if (bucket === "MORNING") morning = Math.max(morning, hours);
    if (bucket === "AFTERNOON") afternoon = Math.max(afternoon, hours);
  }

  if (options.hasMorningShift) afternoon = Math.min(afternoon, 3);

  return Math.min(8, Math.max(fullDay, morning + afternoon));
}
