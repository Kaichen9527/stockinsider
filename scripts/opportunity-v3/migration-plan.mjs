import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = path.join(root, 'migrations/20260724_source_led_opportunity_engine_v3.sql');
const bytes = fs.readFileSync(migration);

process.stdout.write(JSON.stringify({
  protocol: 'source-led-opportunity-v3-migration-plan-v1',
  migration: path.relative(root, migration),
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  additiveOnly: !/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu.test(bytes.toString('utf8')),
  applyAuthorized: false,
  nextCommand: 'npm run db:v3:verify',
}) + '\n');
