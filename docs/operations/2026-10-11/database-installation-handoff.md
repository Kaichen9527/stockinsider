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

- Final reviewed source is `2e078dfdd74272d3d50dffdd4cc6c14df3152c78`;
  genuine unique three-file direct-child evidence is
  `e802254bc34432cdb32c5b553b8fd5b30009b66c`, published at its immutable
  exact-review ref. Protected run38130037645 has actual PASS requirements,
  architecture and exact-review envelopes. Product runtime also PASS:272/272, zero failures/skips/todos.
  Model runner failed before tests; aggregate correctly rejects. Do not infer full
  release approval from the three successful envelopes.
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

## Downloadable deployment package (2026-10-11T10:12Z)

Separate draft PR367 head67901f prepares only the fixed source2e package with
read-only GitHub permissions and no production authority. Actual Linux run
38130717511 succeeded; artifact11698887764 was downloaded and audited against
all2819 manifest files (82,956,004 payload bytes). Tar SHA256 is
`5051e5c9cf510917399ca5aa19973a96d6b80a176246743db444c5a73695f2e9`.
The binary is retained in GitHub Actions for14days, not Git history. VM-local
packages have separate build identities and are not relabeled. Initial8d80
workflow failed destination realpath; the one-line mkdir fix and independent
review are recorded with both actual failed and successful runs.

Latest read-only VPS snapshot at10:01:23Z: total154,894,188,544B, free
19,449,171,968B; six relevant services active, PG17.11 and database2,732,373,683B.
Expansion is confirmed; the generic heavy-work20.40GB minimum is still above
this snapshot. This package avoids a heavy VPS build, but capacity must be
remeasured and admitted under the actual operation lock before migration or
deployment. No capacity threshold was weakened, no production data was removed.

Current receipt: `.agent/reports/2026-10-11T10-12-protected-release-artifact.json`.

## Final protected outcome (2026-10-11T10:16Z)

Run38130037645 completed: requirements, architecture, exact-review and full
product-runtime PASS. The genuine product envelope reports272/272,0fail,0skip,
0todo and result digest
`df4f0bb243a61d50dbaa7d3e537b363c021a5a60e47b5b93f5759d898410e5a0`.
Model-runner still fails the unchanged trusted old executable path ENOENT;
the aggregate correctly fails. This is four of five required checks, not full
release approval. CandidatePR364 remains2e; no main merge or production writes.
Exact final receipt: `.agent/reports/2026-10-11T10-16-protected-final.json`.
