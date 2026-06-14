/**
 * RFC 5545 text escaping — the injection guard for `.ics` export (ES §6/§9c).
 *
 * An unescaped newline in a user-controlled field (title, location, note) would let an attacker
 * inject entire `BEGIN:VEVENT` blocks. We escape `\`, `;`, `,` and fold newlines to the literal
 * `\n` sequence, and strip raw control characters. Output is therefore always a single, valid,
 * non-injectable property value.
 */
export function escapeIcsText(input: string): string {
  return String(input)
    // Order matters: escape backslash first so we don't double-escape the others.
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
    // Strip any remaining C0 control chars that survived (defense in depth).
    // eslint-disable-next-line no-control-regex
    .replace(new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]', 'g'), '');
}

/**
 * Fold a content line to ≤75 octets per RFC 5545 (CRLF + single space continuation). Folding
 * by code unit is a safe approximation for the ASCII-dominant content here.
 */
export function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join('\r\n');
}

/** Join already-built content lines into a CRLF-terminated block with folding. */
export function serializeLines(lines: string[]): string {
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
