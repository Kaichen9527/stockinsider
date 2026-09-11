#!/usr/bin/env node

// The previous utility could delete live rows after writing unverified JSONL.
// Retention v1 intentionally retires that path. Use the archive preview/export
// command; this compatibility entry point can never delete data.
if (process.argv.some((argument) => ['--execute', '--yes', '--skip-archive'].includes(argument))) {
  console.error('Unsafe retention deletion is retired. No rows were changed. Use npm run retention:archive:preview.');
  process.exitCode = 2;
} else {
  console.log('Legacy retention cleanup is retired and performed no database operation.');
  console.log('Use: npm run retention:archive:preview -- --root-kind <kind> --root-id <uuid>');
}
