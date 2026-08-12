// The pilot deployment is India-only (see README), but the server may run
// in UTC (e.g. Vercel). Computing "today" from local server time would be
// off by a day for part of the night. Shift to IST (UTC+5:30) explicitly
// before reading the calendar date.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function todayIST(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// 1 = Monday ... 6 = Saturday. Callers should not pass a Sunday date for
// timetable purposes — there is nothing to match against (day_of_week
// check constraint on timetable_slots is 1-6).
export function dayOfWeekIST(dateStr: string): number {
  const jsDay = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  return jsDay === 0 ? 7 : jsDay;
}
