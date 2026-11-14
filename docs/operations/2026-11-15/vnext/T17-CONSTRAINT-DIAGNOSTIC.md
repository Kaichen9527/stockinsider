# T17 minimal post-restore constraint diagnostic — fail closed, no repair

Parent `5b65286c02bc2f3e64030b6ba6c15eb83315e3d4`. Coordinator reports a real
491423538-byte sealed backup run reached GCM/TOC/PG17/restore/compat migration/
portable/basic app verification and then `lineage_structure_rejected` after
346.254s. Production indicators were unchanged and staging resources cleaned.
Cloud did not receive or inspect the backup, key or restored snapshot. That
failed run remains failed; this commit does not retroactively accept it.

## What the new safe failure output adds

The SAME staging-only entry/FD handoff/sandbox remains in force. No new mode,
admission argument, executable, data path or validation permission is added.
Only after the owned restored database passes portable/basic app checks does
the engine issue a fixed read-only `pg_catalog` query constrained to public.
The existing condition still rejects if `invalidConstraints != 0 OR foreignKeys < 1`.

On exactly that rejection, after successful owned postmaster/socket/tree cleanup,
the existing exit2 JSON may add `constraintDiagnostics`:

- Fixed phase `post_restore_constraint_observation`.
- `invalidConstraints`: public constraints with `convalidated=false`, NOT row violations.
- `foreignKeys`: public `contype=f` count, not an assertion that every FK is valid.
- `byContype`: fixed PG17 keys c/f/p/u/t/x plus `other`; each has total/unvalidated counts.
- `knownLegacyPaidContentCheck`: matches/unvalidated counts for ONLY the public
  source-fixed table/name/type=c tuple supplied by the coordinator. No runtime
  identifier is returned. A match does NOT attest its predicate, data or history.
- Three strictly boolean successful owned-cleanup flags.

No constraint/table names, expressions, row values, SQL, logs, manifest IDs,
paths, articles or key bytes are emitted. Exact-key/exact-int/bounds and aggregate
consistency checks suppress malformed payloads, bool-as-count, unknown fields,
unknown phases and inconsistent known-profile counts. Unknown runtime contypes
are collapsed to the fixed other bucket. Missing/failed/unknown cleanup suppresses
the optional diagnostic instead of claiming success. The rest of the failure is
unchanged. This diagnostic never sets databaseRestored or grants further execution.

## Actual nonproduction tests and independent review

Two real PG17 generated archives each have the source-named NOT VALID CHECK:
one has0 pre-existing violations and the other1 public synthetic violation.
The helper independently counts those public fixture violations BEFORE dumping.
After real restore both retain NOT VALID and reject the same old gate; both
return catalog invalidConstraints1, FK2, c.unvalidated1, known tuple1/unvalidated1,
and successful cleanup. No VALIDATE, data update or predicate bypass occurs.
This proves the diagnostic alone cannot distinguish violating/nonviolating rows.

3 focused tests pass, including malicious extra names/SQL-like strings, bools,
invalid limits/totals/phase and cleanup suppression. The independent engineering
reviewer also ran3/3 and found zero openP0/P1 in this diagnostic-only delta.
FormalA1/real-snapshot acceptance are not claimed. Full regression results,
exact reviewed source hashes and sanitized fixture observations are in the JSON
receipt. Original HOLD, OS/FD/GCM/TOC/owner/RLS/lineage and cleanup gates remain.

## Source audit and what is still unknown

[Pinned migration audit](T17-CONSTRAINT-MIGRATION-AUDIT.md) scans all156 migration
blobs at5b65286 and confirms their equality with9bca. It finds deliberate NOT VALID
CHECK declarations, including the coordinator's9/06 paid-content candidate,
9/07 financial-status and valuation-method profiles, plus two ADD-then-VALIDATE
cases. It found no explicit NOT VALID FK addition in that corpus. None proves
the snapshot's actual type/state/count or migration application history.

The later10/22 candidate explicitly depends on an unvalidated financial-status
CHECK profile; it cannot be attributed to the reported9/19 backup merely from a
filename. It demonstrates why blanket VALIDATE is not a neutral schema action.
All seven LINEAGE_EDGES and both nullable exceptions match their original public
migration columns; the reported structural gate precedes those anti-join checks.
The current failure therefore does not prove a bad join or an orphan.

## Coordinator retry and next decision

Pin this new commit and use the SAME authorized staging-only launcher and real
source FD/key handoff. A structurally invalid snapshot still exits2 and cleans
up; the new sanitized JSON is safe to return to the coordinator/chat. Send only
that receipt, never SQL/errors/logs, names/definitions, article content or keys.

After counts are observed, a separate source-reviewed STAGING-only check must
first bind an exact known predicate/type/column profile before measuring actual
row violations. Source tuple matching is not predicate equality. Any read-only
aggregate must honor CHECK three-valued semantics (only FALSE violates), fixed
identifiers, bounded runtime and count-only output, leaving rows/catalog/original
artifact unchanged. No such actual-snapshot row check or remediation executes in
this patch, and it supplies no permission to ignore an invalid constraint.
Do not blanket-validate, drop/disable checks, rewrite data, or modify production
or original backup copies to make the generic gate pass. Unknown FK/other types
require their own reviewed explanation. DB-first retry may be coordinated with
later isolated Next acceptance, but those external steps do not change this gate.
