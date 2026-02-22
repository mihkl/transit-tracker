/** Returns the last Sunday of the given month at the given UTC hour. */
function lastSundayOfMonth(year: number, month0: number, utcHour: number): Date {
  // month0 is 0-indexed (0 = Jan, 2 = Mar, 9 = Oct)
  const lastDay = new Date(Date.UTC(year, month0 + 1, 0));
  const dow = lastDay.getUTCDay(); // 0 = Sunday
  return new Date(Date.UTC(year, month0, lastDay.getUTCDate() - dow, utcHour));
}

/**
 * Returns the UTC offset for Europe/Tallinn (EET/EEST) in hours.
 * EU DST starts on the last Sunday of March at 01:00 UTC (clocks go +1h)
 * and ends on the last Sunday of October at 01:00 UTC (clocks go -1h).
 * Winter = UTC+2, Summer = UTC+3.
 */
function getTallinnOffsetHours(date: Date): number {
  const year = date.getUTCFullYear();
  const dstStart = lastSundayOfMonth(year, 2, 1); // last Sun of March  @ 01:00 UTC
  const dstEnd = lastSundayOfMonth(year, 9, 1); //   last Sun of October @ 01:00 UTC
  return date >= dstStart && date < dstEnd ? 3 : 2;
}

export function getSecondsOfDayInTallinn(date: Date): number {
  const offsetSeconds = getTallinnOffsetHours(date) * 3600;
  const utcSeconds =
    date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds();
  return (utcSeconds + offsetSeconds) % 86400;
}
