/**
 * URL protocol allowlist — the single home of the render-safety URL gate (ES §5/§7).
 *
 * The #1 threat for a calendar that renders untrusted third-party data is XSS via links
 * (`javascript:`, `data:`). Both `CalendarEvent.url` ("view event page") and
 * `Occurrence.mapUrl` ("get directions") pass through here. Keeping the allowlist in the
 * contract's validator means the contract and the render-safety rule are enforced in one
 * place — a skin never has to re-derive it.
 */

/** Schemes explicitly permitted in event/occurrence links. Everything else is rejected. */
export const ALLOWED_URL_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:', 'geo:'] as const;

const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;
// Built from a string so no literal control bytes live in source. Strips leading whitespace
// and C0 control chars — a "javascript:" prefix is a real href-sanitizer bypass.
// eslint-disable-next-line no-control-regex -- intentional: strip C0 control prefixes (bypass guard)
const LEADING_JUNK_RE = new RegExp('^[\\u0000-\\u0020]+');

/**
 * True iff `value` is safe to place in an `href`. Relative (`/events/1`) and
 * protocol-relative (`//host/x`) URLs carry no dangerous scheme and are allowed; any value
 * that declares an explicit scheme must declare an allowlisted one. Leading control/space
 * characters are stripped before inspection.
 */
export function isAllowedUrl(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.replace(LEADING_JUNK_RE, '');
  if (trimmed.length === 0) return false;

  const match = SCHEME_RE.exec(trimmed);
  if (!match) return true; // relative or protocol-relative — no scheme to abuse
  const protocol = `${match[1]!.toLowerCase()}:`;
  return (ALLOWED_URL_PROTOCOLS as readonly string[]).includes(protocol);
}
