/** Compile supplied read-only transaction evidence; never connect to a database. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { projectCandidateAudit } from '../web/src/lib/candidate-audit-export.ts';
const [input, expected] = process.argv.slice(2);
if (!input || !/^[0-9a-f]{64}$/.test(expected ?? '')) throw new Error('explicit_input_and_hash_required');
const raw = readFileSync(input);
if (raw.length > 32 * 1024 * 1024 || createHash('sha256').update(raw).digest('hex') !== expected) throw new Error('audit_input_hash_or_size');
const value = JSON.parse(raw.toString('utf8'));
const db = value.database;
if (value.schema !== 'contabo-readonly-readiness-v1' || value.host !== '5.104.83.211'
    || value.production_written !== false || value.credentials_exported !== false
    || db?.schema !== 'candidate-repeatable-read-audit-v1' || db.transaction_read_only !== 'on'
    || db.transaction_isolation !== 'repeatable read' || typeof db.snapshot !== 'string') throw new Error('read_only_snapshot_evidence_required');
const projected = projectCandidateAudit(db.run, db.items, db.details, db.instruments, value.observed_at);
// The supplied rows were read in ONE repeatable-read transaction, not two HTTP
// reads. Hashes identify the captured operator evidence, not a new server signature.
projected.consistency_mode = 'captured_database_repeatable_read_read_only';
projected.transport_source_sha256 = expected;
projected.transport_snapshot = db.snapshot;
process.stdout.write(JSON.stringify(projected) + '\n');
