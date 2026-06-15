// Shared constants for the committed CalendarEvent JSON Schema artifact (no side effects).
export const SCHEMA_PATH = 'docs/schema/calendar-event.schema.json';
export const serialize = (schema) => JSON.stringify(schema, null, 2) + '\n';
