function fiscalQuarterOrdinal(periodEnd: string) {
  const match = periodEnd.match(/^(\d{4})-(03|06|09|12)-\d{2}$/u);
  return match ? Number(match[1]) * 4 + ['03', '06', '09', '12'].indexOf(match[2]) : null;
}

export function hasConsecutiveFiscalQuarters(points: Array<{ periodEnd: string }>, count: number) {
  if (points.length !== count) return false;
  const ordinals = points.map((point) => fiscalQuarterOrdinal(point.periodEnd));
  return !ordinals.some((ordinal) => ordinal == null)
    && ordinals.every((ordinal, index) => index === 0 || ordinal === ordinals[index - 1]! + 1);
}

export function normalizedCycleYearsObserved(points: Array<{ periodEnd: string }>) {
  const window = points.slice(-20);
  if (!hasConsecutiveFiscalQuarters(window, 20)) return 0;
  // Twenty consecutive reported quarters are the five fiscal-year observation
  // window. Calendar distance from the first quarter-end to the last is only
  // 4.75 years, so measuring timestamps makes the policy unattainable.
  return window.length / 4;
}
