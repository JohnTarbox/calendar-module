#!/usr/bin/env node
/**
 * Regenerate the committed CalendarEvent JSON Schema from the built contract package, so the
 * published artifact (docs/schema/calendar-event.schema.json) can never drift from the code.
 * Requires a prior build (packages/contract/dist). Run: `pnpm gen:schema`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { calendarEventJsonSchema } from '../packages/contract/dist/index.js';
import { SCHEMA_PATH, serialize } from './schema-artifact.mjs';

mkdirSync(dirname(SCHEMA_PATH), { recursive: true });
writeFileSync(SCHEMA_PATH, serialize(calendarEventJsonSchema));
console.log(`wrote ${SCHEMA_PATH}`);
