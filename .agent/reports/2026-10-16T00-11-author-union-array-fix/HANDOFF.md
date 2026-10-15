# Author union scalar-array fix — source-only

Taipei 2026-10-16 00:11–00:14 (UTC 2026-10-15 16:11–16:14). Base `d8de9cf11e33f7e15013f9b53de4cf863c7d4412`; source `c38fb00986925b4b50719b3389a2a94a5ee3a4c0`, tree `83e48bc8863560e2f877ffdcac92250cd2fbd3cd`.

Only migration `20261015_research_author_durable_union_candidate_v3.sql` lines68/81/90/98/553/566/575/583 changed. Each `ANY((SELECT array_agg(name ...)))` is now explicit `ANY(ARRAY(SELECT name ... ORDER BY name))`; proname preserves DISTINCT. Same public names/roles predicates and ordered name set, with no match for empty sets. This is source reasoning, not a PostgreSQL execution result.

The four forms (each occurs twice) are:

```sql
c.relname=ANY(ARRAY(SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace ORDER BY relname))
p.proname=ANY(ARRAY(SELECT DISTINCT proname FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname))
r.rolname=ANY(ARRAY(SELECT rolname FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname))
t.typname=ANY(ARRAY(SELECT typname FROM pg_type WHERE typnamespace='public'::regnamespace ORDER BY typname))
```

Reverse exactly these eight replacements yields byte-for-byte original SQL. Line count619, four replacement definitions, all64hex literals including cb22/4afc and original/successor body hashes, locks/timeouts/metadata/default/ACL/guard/postconditions are unchanged. Of prior289 inputs,288 are byte-identical; only this authorized SQL differs. Native harness/callback/fixture remain exact0a0. New SQL SHA256 `9e38550d28849cbbcc178f5237f5a985d921b47560a5be3b164186d5e002ed9b`.

Actual check: Node22.14 existing `scripts/research-v3-author-union-sql.test.mjs`: **6PASS/0FAIL/0SKIP/0TODO**, no other suite. Source diff/hash-set verifier passed. Sampled RSS57147392bytes; minimum workspace8594276352 and tmp15286530048, both >=8589934592. No cache cleanup, PG, native, build, install, app/network/CI/PR/ref/deploy operation.

Historical RED is immutable: product79fd actual native0PASS2FAIL at source0a0, evidence d8de9cf1, receipt `f0350019b92b305bb41b4f6a99562716207f3429454b6859c4139e6a22c90e7a`. The previous seven additional source sites were not separately executed failures. This source repair does not convert that RED to PASS and is not independent approval.

Pending: Root exact-delta review and separately authorized fresh native installer; both issuer author lifecycle; original77/compatible-v2; rollback/drift/busy/rights/response-loss negatives; actual four callers/reviewer/Q-R/atomic publication/whole closure and semantic/formal publication of both articles. Prior unexecuted lifecycle harness remains unverified WIP. DD deployment is untouched.
