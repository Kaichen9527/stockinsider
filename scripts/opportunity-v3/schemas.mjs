#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const schemaUrl = new URL('../../docs/source-led-opportunity-v3.schemas.json', import.meta.url);
const schema = JSON.parse(readFileSync(fileURLToPath(schemaUrl), 'utf8'));
if (
  schema.$schema !== 'https://json-schema.org/draft/2020-12/schema' ||
  Object.keys(schema.$defs ?? {}).length !== 6 ||
  !Object.values(schema.$defs ?? {}).every((entry) => entry.additionalProperties === false)
) {
  process.stderr.write('v3:schemas: invalid exact schema bundle\n');
  process.exit(1);
}
process.stdout.write(`${JSON.stringify(schema, null, 2)}\n`);
