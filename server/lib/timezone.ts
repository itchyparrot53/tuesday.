export function zonedParts(
  d: Date,
  tz: string,
): { date: string; hour: number; weekday: number; dayOfMonth: number } {
  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
        weekday: 'short',
      })
        .formatToParts(d)
        .map((x) => [x.type, x.value]),
    );
  } catch {
    return zonedParts(d, 'UTC');
  }
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday ?? '');
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    weekday,
    dayOfMonth: Number(parts.day),
  };
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isValidTimezone(tz: string): boolean {
  if (tz === 'UTC') return true;
  try {
    const zones = Intl.supportedValuesOf('timeZone');
    return zones.includes(tz);
  } catch {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }
}
