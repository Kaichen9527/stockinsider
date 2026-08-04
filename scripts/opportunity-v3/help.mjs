#!/usr/bin/env node

const help = `Source-led Opportunity V3 commands

Read-only local checks
  npm run v3:doctor
  npm run v3:status
  npm run db:v3:plan
  npm run db:v3:verify
  npm run v3:shadow:fixture

Verification tracks
  npm run verify:source-led-opportunity-v3:product-runtime
  npm run verify:source-led-opportunity-v3:evaluation-governance
  npm run verify:source-led-opportunity-v3:model-runner

Schemas and signed human-authority requests
  npm run v3:schemas
  npm run v3:sign-request -- --help

Authority boundary
  These commands do not apply the V3 production migration, enable cron/shadow
  runtime, merge a PR, or manufacture elapsed evaluation cohorts. Production
  mutation and activation require separate explicit authority.

Documentation
  docs/source-led-opportunity-v3.md`;

if (process.argv.length > 2 && !process.argv.slice(2).every((arg) => arg === '--help')) {
  process.stderr.write('v3:help accepts no arguments other than --help\n');
  process.exit(1);
}
process.stdout.write(`${help}\n`);
