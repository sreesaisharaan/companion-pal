import * as Localization from 'expo-localization';

/**
 * Pure, dependency-light timezone helpers. Everything here is a plain function
 * (no React), so lib/api code and components can both use it. The source of
 * truth for the *chosen* time zone is hooks/use-timezone.
 */

/** The device's IANA time zone from expo-localization; falls back to the
 * engine's own zone, then UTC. The zone lives on the *Calendar* (not Locale)
 * type in expo-localization SDK 57+. */
export function getDeviceTimeZone(): string {
  return (
    Localization.getCalendars()[0]?.timeZone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    'UTC'
  );
}

/** True if the JS engine honours Intl's `timeZone` option. Modern Hermes
 * (RN ≥ 0.70, Expo SDK 49+) and every browser do; very old engines silently
 * ignore it and format in the device zone. */
export function timeZoneOptionSupported(): boolean {
  try {
    const a = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
    }).format(new Date(0));
    const b = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Pacific/Pago_Pago',
      hour: 'numeric',
    }).format(new Date(0));
    return a !== b;
  } catch {
    return false;
  }
}

/** True if the engine can resolve `tz` as an IANA time zone id. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/** The calendar day (y/m/d) of an instant as seen in a time zone. */
export function zonedDay(
  date: Date,
  timeZone: string,
): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { y: value('year'), m: value('month'), d: value('day') };
}

/** Whole-day difference (a − b) in calendar days, measured in a time zone. */
export function dayDiffInZone(a: Date, b: Date, timeZone: string): number {
  const da = zonedDay(a, timeZone);
  const db = zonedDay(b, timeZone);
  return Math.round(
    (Date.UTC(da.y, da.m - 1, da.d) - Date.UTC(db.y, db.m - 1, db.d)) /
      86_400_000,
  );
}

/** Offset (minutes) of a time zone at an instant, sampled from its wall clock. */
function tzOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === 'minute')?.value ?? 0,
  );
  let diff = (hour - date.getUTCHours()) * 60 + (minute - date.getUTCMinutes());
  if (diff > 720) diff -= 1440;
  if (diff <= -720) diff += 1440;
  return diff;
}

/** The instant at local midnight of a calendar date (y, m, d) in a time zone.
 * Exact for every real zone, including UTC+13/+14 where a naive noon-UTC
 * sample would guess the wrong sign of the offset. */
export function zonedMidnight(
  y: number,
  m: number,
  d: number,
  timeZone: string,
): Date {
  const sample = new Date(Date.UTC(y, m - 1, d, 12));
  const rough = tzOffsetMinutes(sample, timeZone);
  const target = { y, m, d };
  for (const offset of [rough, rough - 1440, rough + 1440]) {
    const instant = new Date(Date.UTC(y, m - 1, d) - offset * 60_000);
    const day = zonedDay(instant, timeZone);
    if (day.y === target.y && day.m === target.m && day.d === target.d) {
      return instant;
    }
  }
  // Unreachable for real zones — fall back to the rough guess.
  return new Date(Date.UTC(y, m - 1, d) - rough * 60_000);
}

/** "9:00 AM" — time of an instant in a time zone. */
export function formatTimeInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/** "Wed, Aug 12" — date of an instant in a time zone. */
export function formatDateInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/** Anything else — a date/time in a time zone with full Intl control. */
export function formatInTimeZone(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone }).format(
    date,
  );
}

/** Short zone name ("IST", "PDT") for a zone id, or '' when unavailable. */
export function timeZoneAbbreviation(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(new Date());
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}
