# Fresh-source deferral and private diagnostic checkpoint

Source `0c45a34163c7835f6307437289ff0f7f6985398b` exactly matches locally validated
`a4641da891234b7c5bb67b9108205d48beaaa7ef` whole tree
`a7d76dd16c0d30ff6227b1412a0e5d86e464bcd3`; public metadata differs.
[Source hashes, commands, log hashes and scope](launch-source-deferral-checks.json).

The actual Taiwan queue-drain route distinguishes a closed SQL v2 plan: planned,
no active pool, or deferred awaiting the current completed session. SQL evaluates its
Taipei clock after the existing policy, exact owned backend lease and pool bound. Deferral
returns zero new jobs and no replacement date before any fresh enqueue. It asserts neither
holiday status nor complete coverage. Only fresh planning/pre-drain defers; normal queue
claims still require classification, and bound jobs retain their exact owned dispatch.
Unbound jobs use their unchanged authority. Busy, rights or DB errors still stop the request.
Old v1/malformed plans fail closed; v2 SQL must be installed through the existing reviewed
migration gate before this route is deployed. No production migration or flag was applied.

21 related unit cases PASS (11 private-link diagnostic,10 source-store including actual
transpiled route regression); four STATIC source checks PASS. Types, lint and production build
PASS. Controlled route cases assert HTTP200 for deferred ordinary/bound work, HTTP503 for
busy/DB failure and401 for unauthorized calls. Synthetic ports establish no actual calendar,
PostgREST, current source acquisition or historical publication. Actual cold-start/day-to-day
throughput, four-job prepass limits,21:30 readiness and cross-day reuse remain unverified.

The private original-source inspector reads bounded metadata through three trusted dependency
ports and always returns blocked/authority:none. It can report observed links, clocks and
withdrawals, but no database adapter or mechanical extraction-to-revision/use-purpose bridge
exists. Even a plausible fresh graph cannot supply original-source or publication permission.
No original text, private URL, credential, provider or public route was added.

A local setup fast-forward was refused because equal-tree commits had different ancestry;
the subsequent local two-file commit was preserved, then cherry-picked onto a new branch from
the public parent before tests. This is a retained preparation correction, not a test retry,
recovery proof or force push. Original283 work files remain unchanged/missing0, no archive or
reclamation. Engineering review has zero open P0/P1 for this bounded source; formal A1, native
HOLD, actual source/venue/action/market gates, original PR head and production remain unchanged.
