import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { BUSINESS_TIMEZONE } from "./config";

/** Format a UTC Date in the business timezone. */
export function formatBiz(date: Date, fmt: string): string {
  return formatInTimeZone(date, BUSINESS_TIMEZONE, fmt);
}

/** Convert a wall-clock time in the business timezone to a UTC Date. */
export function bizWallClockToUTC(
  yyyyMMdd: string,
  minutesFromMidnight: number
): Date {
  const hours = Math.floor(minutesFromMidnight / 60);
  const mins = minutesFromMidnight % 60;
  const local = `${yyyyMMdd}T${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00`;
  return fromZonedTime(local, BUSINESS_TIMEZONE);
}

/** Get the day-of-week (0=Sun..6=Sat) for a date in the business timezone. */
export function bizDayOfWeek(date: Date): number {
  const zoned = toZonedTime(date, BUSINESS_TIMEZONE);
  return zoned.getDay();
}

/** Format a date as YYYY-MM-DD in business timezone. */
export function bizDateKey(date: Date): string {
  return formatInTimeZone(date, BUSINESS_TIMEZONE, "yyyy-MM-dd");
}
