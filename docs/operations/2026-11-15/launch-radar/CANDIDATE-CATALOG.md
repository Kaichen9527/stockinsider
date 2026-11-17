# Source-first candidate catalog checkpoint

Public source `32bd9df832475111ffcf6e77574d028c31b43a5a` has the exact whole tree
`73ff9ba6423dc82fa2ea4e448a68b454fc67bfc3` tested locally at
`b806546e25a51f84111159db54e54e3c477e0466`; commit metadata differs.
[Checks and retained failures](launch-candidate-catalog-checks.json) bind each source file and log.

The canonical `/candidates` page and no-store API have a source-first catalog contract.
Synthetic projection tests cover 21 clues, 20 recorded admissions, source/industry snapshots,
immutable cutoff/catalog cursor identity, concurrent additions, historical events and rights
withdrawal. Missing admission events mean **history unknown**, never proof of never-admitted.
Private-only clues do not enter the public catalog hash. A withdrawal redacts identity and
makes filtered reads unavailable to avoid a presence oracle. Existing explicit ranking and
old cursor links keep their original reader. GET does no research or mutation.

The actual public metadata producer and mutation hooks are **missing**. The production
reader is deliberately hard-disabled, without a fixture switch, credential or metadata grant.
A positive 21-clue fixture is not an actual complete catalog. Real Next.js desktop/mobile
checks verify only the unavailable page, API503, malformed-query400, no-store and zero RPC
read delta. There is no real never-admitted positive or database history acceptance here.

Verification: 38 related unit/HTTP-VM/actual-page React SSR cases, types, lint and production
build PASS; two actual Next.js browser profiles PASS after the repair below. These are
separate from the earlier 649-unit/49-browser foundation checkpoint, not a new total rerun.

The first build passed but its browser failed. A diagnostic-only build reproduced API400
where503 was required. After two failures, local browser retry stopped. Read-only inspection
found emitted GET code assigning lexical locals before declaration during inlining; the old
complete artifact hash was not captured, and only the contemporaneous excerpt is retained.
The material repair uses two fixed imported `Reflect.apply` targets without changing policy,
query validation, response expectations or compiler settings. Independent engineering review
checked the repaired source and exact emitted artifact before the local browser resumed.
Both original failures remain in the receipt. This local repair never releases native HOLD.

Independent engineering review reports zero open P0/P1 in this bounded source scope. It is
not formal A1, source-rights approval, historical completeness or release acceptance. Original
PR head, production flags/timers, SQL and services remain untouched. 283 original work files
remain unchanged/missing0; no recoverable archive was established or data reclaimed.
