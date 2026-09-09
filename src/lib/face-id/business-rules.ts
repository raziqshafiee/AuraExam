export interface PhotoChangeCheck {
  allowed: boolean;
  reason?: string;
}

export function canRequestPhotoChange(
  lastPhotoUpdate: Date | null,
  upcomingExamStarts: Date[],
  now: Date,
  cooldownDays: number,
  freezeHours: number,
): PhotoChangeCheck {
  const DAY_MS = 24 * 60 * 60 * 1000;

  if (lastPhotoUpdate) {
    const daysSince = (now.getTime() - lastPhotoUpdate.getTime()) / DAY_MS;
    if (daysSince < cooldownDays) {
      const daysLeft = Math.ceil(cooldownDays - daysSince);
      return {
        allowed: false,
        reason: `You can request a new photo in ${daysLeft} day(s).`,
      };
    }
  }

  const freezeMs = freezeHours * 60 * 60 * 1000;
  const withinFreeze = upcomingExamStarts.some(
    (start) => start.getTime() > now.getTime() && start.getTime() - now.getTime() <= freezeMs,
  );
  if (withinFreeze) {
    return {
      allowed: false,
      reason: `Photo changes are locked within ${freezeHours} hours of an upcoming exam.`,
    };
  }

  return { allowed: true };
}
