const MINIMUM_AGE_DAYS = 7;
const MINIMUM_REMINDER_COUNT = 2;
const DAY_MS = 86_400_000;

type SeverityUpgradeCandidate = {
  severity?: string | null;
  reminderCount?: number | null;
  secondRemindedAt?: Date | string | null;
  status?: string | null;
  cancelledAt?: Date | string | null;
};

export function daysSinceSecondReminder(
  defect: Pick<SeverityUpgradeCandidate, "secondRemindedAt">,
  now = new Date()
) {
  if (!defect.secondRemindedAt) return 0;
  const startedAt = new Date(defect.secondRemindedAt);
  return Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / DAY_MS));
}

/** Phiếu Mức 3/4 sau tối thiểu 7 ngày kể từ lần nhắc thứ hai thì đề xuất nâng Mức 2. */
export function isSeverity2UpgradeCandidate(defect: SeverityUpgradeCandidate, now = new Date()) {
  return (
    (defect.severity === "3" || defect.severity === "4")
    && (defect.reminderCount ?? 0) >= MINIMUM_REMINDER_COUNT
    && daysSinceSecondReminder(defect, now) >= MINIMUM_AGE_DAYS
    && defect.status !== "CO_PCT"
    && defect.status !== "DA_XU_LY"
    && !defect.cancelledAt
  );
}

export const SEVERITY_2_UPGRADE_MINIMUM_AGE_DAYS = MINIMUM_AGE_DAYS;
export const SEVERITY_2_UPGRADE_MINIMUM_REMINDERS = MINIMUM_REMINDER_COUNT;
