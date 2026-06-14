/**
 * IANA timezone validity check using the built-in `Intl` database — no Luxon dependency,
 * keeping the contract package lean and portable (ES §5).
 *
 * `Intl.DateTimeFormat` throws a `RangeError` for an unknown `timeZone`, so a successful
 * construction is our validity signal. This is the gate behind the hard rule that an invalid
 * `displayTimeZone` must never silently fall back to UTC (ES §8, S2-9).
 */
export function isValidTimeZone(tz: string): boolean {
  if (typeof tz !== 'string' || tz.length === 0) return false;
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
