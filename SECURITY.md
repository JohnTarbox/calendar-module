# Security Policy

## Threat model

This is a **read-only** calendar that renders **untrusted third-party event data** on a host
page. The calibrated risks (ES §7), in order:

1. **XSS** via event titles / descriptions / links — the #1 risk.
2. ReDoS (recurrence/parse regexes).
3. Prototype pollution (config/JSON merges — can defeat sanitizers).
4. DoS-by-pathological-data (unbounded recurrence, huge overlaps).
5. Supply chain.

## Hard requirements

- React escapes text by default; never `dangerouslySetInnerHTML` untrusted content. If HTML
  must render, sanitize with DOMPurify and guard config merges against prototype pollution.
- Link protocols are **allowlisted in the Zod validator** (`javascript:`/`data:` blocked) — the
  single home of the URL/`mapUrl` protocol gate.
- `.ics` output is escaping-hardened against injection (newline/`;`/`,`/`\` breakout).
- Recurrence expansion enforces a hard occurrence cap (DoS guard).

## Reporting a vulnerability

Please report suspected vulnerabilities privately via the repository's security advisory
form rather than a public issue. We aim to acknowledge within a few business days.
