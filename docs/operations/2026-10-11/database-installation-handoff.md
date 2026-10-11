# Database installation and protected-review continuation

Status: implementation and isolated PostgreSQL validation; **not merged or
production deployed**. This extends PR #360; previous main remains `169aad1`.
The AUO article remains a demonstration of the research direction.

## Installation defects fixed

1. The attested planner/apply path omitted 18 insider/observed/publication and
   admission migrations. They now follow the previous six research migrations;
   the 48-file base SQL and its ordered digest are unchanged.
2. Protective SQL is accepted only for ten exact path + whole-file SHA256 pins.
   Unknown destructive tokens, renamed copies or changed bytes remain rejected.
3. Complete/partial publication installations reject before either a base-only
   or extended replay. All new tables, functions, roles, columns, triggers and
   isolation-successor bodies are checked while holding the shared install lock.
4. Three fixed catalog stages check the real prerequisite and final schema;
   these include raw/effective/column ACLs, composite inputs and role closure.
5. Executing the actual final installer verifier exposed a SQL syntax error and
   three stale wrapper/owner checks. They now check the final delegation chain
   and the actual owners required by the unchanged migrations.
6. The strategy manifest generator missed the exact V3.15 DO-block resolver
   replacement. It now derives that transformation from the pinned source file
   and includes the source in the release identity; the installed policy check
   remains mandatory. This changes the strategy code hash, not user approval.

## Explicit VPS operator path

The default Keychain/Supabase transport is retained. `--vps-peer` is a separate
fixed Linux/OS-postgres path to `/run/postgresql`, port 5432, DB `stockinsider`.
It requires the original source + direct-child review attestation and authority
checks. PG environment overrides reject. The live server must prove PostgreSQL
17, authenticated `system_user=peer:postgres`, the exact peer/reject-only HBA
file profile and no TCP. A bounded real connection as the runtime role must
receive the exact local HBA-reject error before any mutation; NOLOGIN, timeout or
password errors do not count. File hash and configuration identity are rechecked
after that probe. File timestamps alone are never treated as loaded-HBA proof.
Password challenges fail before pgpass lookup or credential transmission.

The current compatibility role is NOLOGIN/NOINHERIT/connection-limit -1. Existing
unchanged migrations require LOGIN/NOINHERIT/limit 6. The installer rejects this
mismatch; it never silently enables it. Once the final source has passed review,
the operator can explicitly run, in the exact clean reviewed checkout:

```sh
node scripts/opportunity-v3/apply-reviewed-migrations.mjs --apply \
  --research-agent-extension --vps-peer --bootstrap-vps-runtime-role \
  --source-commit <R> --attestation-commit <direct-child-evidence>
node scripts/opportunity-v3/apply-reviewed-migrations.mjs --apply \
  --research-agent-extension --vps-peer \
  --source-commit <R> --attestation-commit <direct-child-evidence>
```

Run as the existing `postgres` OS account; do not copy credentials or loosen HBA.
The first command only amends the exact known role, preserving its OID, null
password, membership and object authority; its receipt says no migrations were
applied. An unknown/already-amended predecessor rejects. Validate rejection of
connections as that role and the existing StockInsider peer/service-role path
before proceeding. The second command executes all migrations and postconditions
atomically. Production was not changed during preparation.

## Remaining protected release blockers

- The current protected run fails because the final exact-review evidence ref
  does not exist. Requirements/architecture refs exist. Freeze final `R`, finish
  genuine full `main..R` independent review and PCR evidence, then create the
  unique direct-child three-file evidence commit. A scoped code pass is not this
  full review and must not be represented as one.
- The trusted main runner points at a removed Codex path. Its current signed
  native binary has a new hash; the earlier recovery packet does not cover it.
  The current agent independently found no existing trusted recovery ingress or
  owner-published signer/registry capability. Installing candidate code, creating
  a signing key, rewriting a pin or ordinary admin GitHub access cannot create
  that trust authority. Preserve the actual observed failure; do not rerun an
  unchanged failing gate or bypass the ruleset.
- A trusted owner/release manager must provide the approved recovery publication
  mechanism/provenance, or approve and independently review that bootstrap
  mechanism as a separate infrastructure change. Existing human repair/merge
  authorization persists; the missing item is verifiable infrastructure, not
  another request to authorize normal work.

## Live measurements and outstanding product acceptance

2026-10-11 read-only VPS measurement: 154,894,188,544 bytes total,
25,346,764,800 bytes free. PostgreSQL 17.11, no TCP listener; the current service
release symlink points to `9fd86fe...`. The old disk-shortage conclusion is not
used. No stock history, research evidence, paper books or production files were
removed.

After protected review succeeds: merge using merge commits, run the explicit
operator prerequisite and atomic migration, deploy, check authenticated queue /
publication reads and public desktop/mobile pages, then perform the real AUO +
second-industry author/reviewer flow. Full candidate coverage, source platform
acceptance, strategy validation and five future trading days remain separate
unfinished acceptance. Formal research schedules remain paused. No profitability
claim or strategy adoption is authorized by these installer tests.
