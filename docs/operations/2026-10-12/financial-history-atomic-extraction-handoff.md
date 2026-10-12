# Financial history atomic extraction — slice 2

Base: frozen slice1 `baf2bbeafd84837f6a08475460fd2f84cf6e091b`.
Original source: PR364 `2e078dfdd74272d3d50dffdd4cc6c14df3152c78`.
Only the atomic helper/test, minimal native import/original rollback case with
supplementary invariants, this handoff and unique receipts are owned.
No planner/apply, 48-base SQL, authority/catalog, package/locks, other research
migrations or production selection/profile was copied or changed.

## Actual original RED and minimum scanner repairs

The original helper/pure-test bytes were saved before changes. On unchanged main
apply, its full original pure suite is 1 PASS / 1 FAIL: the second test also
requires an actual atomic installer caller, which is absent. New adversarial
cases then produce 3 PASS / 3 FAIL: that dependency plus two actual lexer faults.
Dollar-quote detection treated `$tag$` embedded in an unquoted SQL identifier as
a literal delimiter, allowing a real COMMIT/ROLLBACK between identifiers to be
hidden. A bare CR ended a PostgreSQL line comment but the scanner searched only
LF, silently dropping the following real control. Both have minimal boundary/
line-ending fixes; quoted bodies, nested comments, ordinary/E-string escapes and
all 48 unchanged reviewed base bodies still normalize.

A separate original-predicate RED shows missing nontransactional classification
(first actual failure: DROP DATABASE). Rejection now also covers database/
tablespace create/drop, option-form concurrent REINDEX, DISCARD ALL and database
SET TABLESPACE. This is conservative fail-closed classification, not a general
PostgreSQL grammar/permission proof; unknown source still needs reviewed SQL pins.

The original installer expectations remain in the pure file, with explicit
BEGIN/COMMIT presence checks added so an index=-1 cannot make an absent BEGIN
appear ordered before the migration loop. **Full pure suite remains 7 PASS /
1 FAIL**, specifically `actual atomic installer BEGIN is missing`. It is not
skipped or rewritten to PASS. A clearly labeled scanner-only selection is 7/7;
that excludes the still-unfulfilled installer assertion and is not full-suite
acceptance. Root's next installer slice must make the preserved assertion true.

## Real native rollback

The saved original financial atomic case is now executable through the real
helper; original marker/forced-error/rollback assertions remain. It actually
installs the financial successor, executes genuine predecessor replacements
within BEGIN, proves the old period-bound body was restored inside that failing
transaction, deliberately raises `forced_extension_failure`, and compares the
successor afterward.

Supplementary synthetic setup adds one valid fact and one immutable observation
through the actual append RPC before that failure. Full fact/observation rows,
function definitions/owners/ACL/config, table ACL/RLS/owner, trigger definitions/
enabled status and public schema ACL are compared byte-for-byte in returned
JSON before/after rollback. The existing private PG additionally accepts
unquoted dollar-containing temporary table identifiers, confirming that the
new lexical counterexample is not an invented quote grammar. This is isolated
synthetic engineering data, not an official filing, real investment result or
production catalog/role acceptance.

The original baseline lifetime128 rejection and 160-month amendment assertions
are unchanged. They and the rollback case run on the existing main predecessor
fixture and real native PG17.11; it is not the complete existing-VPS installation
schema profile. Separate selected commands are preserved; overlapping passes are
not added. No libfaketime/clock/source-time edits or new prerequisite stub is used.

## Remaining before production

This slice does not change the default installer and does not install anything
in production or fix 343 usable=0. Next still requires a narrow financial
49-file selection/profile (or separately reviewed precise existing-schema tail),
installed-successor guard before base replay, exact SQL postconditions and
owner/ACL/catalog verification, one atomic reviewed plan/apply path, existing
schema rehearsal/rollback/concurrent-install/disconnect acceptance, protected
exact approval, capacity admission and real post-apply coverage accounting.
The full-publication 76-file plan/profile cannot be relabeled as this profile.
No merge/deploy, genuine model author/reviewer, strategy admission or signed
independent review was performed. Root owns independent review and later scope.
