# Runtime Installation Contract: source-led-opportunity-engine-v3

Version: `stockinsider-runtime-installation-v1.12`

This contract is the sole authority for packaging, installing, rolling back and
diagnosing the production-capable local data producer. It does not authorize an
installation. A later explicit production-runtime checkpoint is still required.

## Reviewed source authority

The installable source is one detached clean Git commit, not the operator's worktree.
The installer takes exactly two required arguments:
`--source-commit <40-lowercase-hex>` and
`--attestation-commit <40-lowercase-hex>`. It reads the attestation only from
`.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-review-attestation.json`
and the human review evidence only from
`.loop-engineering/state/changes/source-led-opportunity-engine-v3/exact-commit-review-final.md`
at `--attestation-commit`; no working-tree file or alternate path is accepted. The
source commit must exist, have no replace object, resolve to one tree, and be checked
out into a new installer-owned detached temporary worktree. `git status
--porcelain=v1 --untracked-files=all` in that worktree must be empty before and after
dependency preparation. Submodules, symlinks for either authoritative file, Git LFS
pointer bytes and ignored `.agent` producer bytes fail.

The attestation commit must be a direct child of `headSha`, must have exactly
one parent equal to `headSha`, and its tree diff must add exactly the three regular files
named above plus `pcr-fulfillment-record-v1.json`, with no delete, rename, mode change,
symlink, submodule or other path. The PCR record is required by
`acceptance-evidence-contract.md` and is validated by the exact-review Code Gate; the
runtime loader permits it but never treats it as runtime-review authority. Its
committer/author identity is not authority. The runtime attestation file is canonical RFC 8785 JSON
with this exhaustive shape and no unknown members:

```ts
type ExactReviewAttestationV1 = {
  schema: 'stockinsider-exact-review-attestation-v1';
  baseSha: string;              // 40 lowercase Git hex
  headSha: string;              // equals --source-commit
  treeSha: string;              // equals git rev-parse headSha^{tree}
  range: string;                // exactly `${baseSha}..${headSha}`
  verdict: 'PASS';
  p0: 0;
  p1: 0;
  evidenceSha256: string;       // SHA-256 of immutable exact-review evidence bytes
  reviewedAt: string;           // UTC RFC3339 whole seconds with literal Z
};
```

`evidenceSha256` must equal the SHA-256 of the exact
`exact-commit-review-final.md` bytes from that same attestation commit. `headSha` must
equal `--source-commit`; `treeSha`, `range`, verdict and counts are independently
recomputed. The attestation canonical-byte SHA-256 is stored in the installation
manifest. This direct-child/two-file rule deliberately avoids a self-referential
review commit: installed code is `headSha`, while the later evidence-only commit
supplies machine-readable proof without changing worker/config bytes. A PR label,
branch name, remote status text, unsigned standalone Markdown claim or working-tree
file is not review authority.

Validation precedence is exact: `invalid_arguments`, `attestation_commit_unavailable`,
`attestation_commit_not_direct_child`, `attestation_commit_has_extra_diff`,
`attestation_not_regular`,
`attestation_noncanonical`, `attestation_schema_mismatch`, `review_not_pass`,
`review_identity_mismatch`, `review_evidence_unbound`, `source_commit_unavailable`,
`source_tree_dirty`, `authoritative_path_invalid`, `dependency_lock_mismatch`,
`scheduler_capture_invalid`, `scheduler_snapshot_changed`,
`scheduler_package_hash_mismatch`, `proposed_plist_invalid`,
`staged_hash_mismatch`, `active_runtime_conflict`, `atomic_publish_failed`,
`scheduler_activation_failed`, `scheduler_rollback_failed`. The first match
terminates before any later launchd or active-runtime mutation; the final two run the
phase-owned inverse before returning.

Golden attestation canonical bytes are:

```json
{"baseSha":"1111111111111111111111111111111111111111","evidenceSha256":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","headSha":"2222222222222222222222222222222222222222","p0":0,"p1":0,"range":"1111111111111111111111111111111111111111..2222222222222222222222222222222222222222","reviewedAt":"2026-07-29T04:00:00Z","schema":"stockinsider-exact-review-attestation-v1","treeSha":"3333333333333333333333333333333333333333","verdict":"PASS"}
```

Its UTF-8 SHA-256 is
`e45db19671fb75882d9e590f17b1ceb58346bbb481f3973597b135fd272d8fa1`.

## Authoritative paths and manifest

The executable entrypoint and configuration authority are these two regular Git
paths:

- `scripts/runtime/auth-source-worker-cli.js`
- `config/runtime/auth-source-dag.json`

The worker digest is not the entrypoint file digest. It is SHA-256 over the canonical
`stockinsider-tracked-runtime-bundle-v1` manifest emitted by
`scripts/runtime/tracked-runtime-bundle.js`. That manifest binds the sorted path,
byte length and exact file SHA-256 for the closed 29-member transitive worker source
set; the bundle-manifest implementation is itself a member. A missing, additional or
changed member changes the reviewed worker identity, the runtime lease identity and
the installation manifest. Ignored `.agent` content is never a member or authority.

The exhaustive ASCII-sorted member set is:

```text
scripts/runtime/action-decision.js
scripts/runtime/analysis-material-change.js
scripts/runtime/analysis-revision.js
scripts/runtime/auth-source-worker-cli.js
scripts/runtime/auth-source-worker.js
scripts/runtime/bias-action-cap.js
scripts/runtime/bias-technical-history.js
scripts/runtime/bias-universe-manifest.js
scripts/runtime/candidate-funnel.js
scripts/runtime/candidate-valuation.js
scripts/runtime/codec.js
scripts/runtime/compact-radar-projection.js
scripts/runtime/credential-resolver.js
scripts/runtime/discovery-disposition.js
scripts/runtime/factor-score.js
scripts/runtime/factor-snapshot.js
scripts/runtime/fundamental-quality.js
scripts/runtime/postgres-legacy-producer-adapter.js
scripts/runtime/public-projection.js
scripts/runtime/reported-pe-authority.js
scripts/runtime/source-run-config.js
scripts/runtime/technical-entry-geometry.js
scripts/runtime/technical-plane.js
scripts/runtime/technical-state.js
scripts/runtime/tracked-runtime-bundle.js
scripts/runtime/valuation-comparables.js
scripts/runtime/valuation-evidence.js
scripts/runtime/valuation-method.js
scripts/runtime/valuation-operating-bridge.js
```

The resolved runtime root is
`os.homedir()/Library/Application Support/StockInsiderRuntime`. Releases live at
`releases/<commitSha>`, the atomic active pointer is `current`, and the canonical
manifest is `current/installation-manifest.json`. The manifest is canonical RFC 8785
UTF-8 JSON with no BOM, whitespace suffix or unknown member:

```ts
type RuntimeInstallationManifestV11 = {
  schema: 'stockinsider-runtime-installation-v1.1';
  commitSha: string;            // reviewed head SHA
  reviewedTreeSha: string;      // reviewed tree SHA
  reviewAttestationSha256: string;
  worker: {
    repositoryPath: 'scripts/runtime/auth-source-worker-cli.js';
    sha256: string;             // canonical tracked-runtime bundle SHA-256
  };
  config: {
    repositoryPath: 'config/runtime/auth-source-dag.json';
    sha256: string;
  };
  installedAt: string;          // installer clock, UTC whole-second RFC3339 Z
  schedulerRollback: {
    releasePath: 'scheduler-rollback-package.json';
    sha256: string;
    capturedAt: string;
    priorOwnerCount: 3;
  };
  rollback: null | {
    commitSha: string;
    manifestSha256: string;
    releaseDirectoryName: string; // exactly the prior 40-hex commit SHA
  };
};
```

All digests are lowercase SHA-256 over exact regular-file bytes. `rollback` is null
only for a first install; otherwise all three members are required and must identify
the currently active, already verified release. `schedulerRollback` is mandatory on
every install, including the first; it binds the recoverable scheduler package below
and is never replaced by `rollback`.

The golden first-install manifest is:

```json
{"commitSha":"2222222222222222222222222222222222222222","config":{"repositoryPath":"config/runtime/auth-source-dag.json","sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"installedAt":"2026-07-29T04:30:00Z","reviewAttestationSha256":"e45db19671fb75882d9e590f17b1ceb58346bbb481f3973597b135fd272d8fa1","reviewedTreeSha":"3333333333333333333333333333333333333333","rollback":null,"schedulerRollback":{"capturedAt":"2026-07-29T04:20:00Z","priorOwnerCount":3,"releasePath":"scheduler-rollback-package.json","sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},"schema":"stockinsider-runtime-installation-v1.1","worker":{"repositoryPath":"scripts/runtime/auth-source-worker-cli.js","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}
```

The golden is exactly 805 UTF-8 bytes with SHA-256
`a141a2b895463f989b96f5796d0f3f28fe76a9a2029e8aa75ae70744bc7b5172`;
a stale V1.0 golden digest is rejected.

Activation additionally requires one canonical mode-0600 authority file with exact
schema `stockinsider-runtime-activation-authority-v2` and members
`approvedAt,approvedBy,attestationCommit,commitSha,expiresAt,mutation,nonce,schema,signature`.
`approvedBy` is `repository-owner`, mutation is `tracked_runtime_activation`, both
Git identities equal the CLI arguments, the 32-lower-hex nonce has not appeared in
the owner-only fsynced nonce-marker ledger, and the approval window contains the current time
and is at most 15 minutes. `signature` is lowercase HMAC-SHA256 over canonical JSON
of the other eight members using only the fixed Keychain reference
`keychain:stockinsider-runtime:activation-authority-hmac`. A caller-authored boolean,
The marker is created with `O_CREAT|O_EXCL|O_NOFOLLOW` before any recovery or activation,
so two processes cannot consume one authority. Independently, activation acquires one
owner-only runtime-root `activation.lock` through `/usr/bin/shlock` before consuming
the nonce, recovery, scheduler capture, preparation or active filesystem mutation.
The lock is held through success or rollback terminal state and released from `finally`;
different valid nonces therefore cannot enter concurrent activation transactions.
An extant live lock fails `active_runtime_conflict`, while `shlock` atomically replaces
only a lock whose recorded PID is no longer live. Unsigned JSON, replayed nonce or value supplied in a plist/environment variable is
not activation authority.

## Scheduler rollback package and exact plist

Before staging any active-pointer or launchd change, the installer captures one
canonical mode-0600 `scheduler-rollback-package.json` in the staged release:

```ts
type SchedulerRollbackPackageV1 = {
  schema:'stockinsider-scheduler-rollback-v1';
  capturedAt:string;
  priorOwners:[
    SchedulerSnapshot<'com.stockinsider.data-collect'>,
    SchedulerSnapshot<'com.stockinsider.night-shift'>,
    SchedulerSnapshot<'com.stockinsider.research-daemon'>
  ];
  newOwnerPriorState:SchedulerSnapshot<'com.stockinsider.auth-source-worker'>;
  proposedOwnerPlist:{sha256:string;base64:string};
};
type SchedulerSnapshot<L extends string> = {
  label:L;
  installed:boolean;
  enabled:boolean;
  plistSha256:string|null;
  plistBase64:string|null;
  executablePath:string|null;
  executableSha256:string|null;
};
```

The three `priorOwners` are always present in that order, even when absent. Null
members occur exactly when `installed=false`; an installed row has a byte-exact
base64 plist whose decoded bytes reproduce `plistSha256`, and its absolute lexical
executable path/file hash are captured without following a different executable
afterward. `newOwnerPriorState` records whether the new label already existed.
Capture and hash verification precede staging; a changed plist/file between capture
and disable is `scheduler_snapshot_changed` and performs zero scheduler mutation.

The proposed plist is exact UTF-8 XML plist bytes under
`stockinsider-launchd-plist-xml-v1`: XML declaration and Apple plist DOCTYPE are
fixed ASCII lines; indentation is two ASCII spaces; dictionary keys appear in the
order specified here; booleans use `<true/>|<false/>`; there is exactly one final LF
and no BOM/CR/trailing spaces. It represents this fixed semantic object:
label `com.stockinsider.auth-source-worker`; `ProgramArguments` exactly
`[/usr/bin/env,"-i",HOME=<owner-home>,PATH=/usr/bin:/bin,NODE_ENV=production,
TZ=Asia/Taipei,STOCKINSIDER_REVIEWED_COMMIT_SHA=<sha>,<two fixed credential refs>,
pinnedNode22Path,current/scripts/runtime/auth-source-worker-cli.js,"--config",
current/config/runtime/auth-source-dag.json]`; `StartCalendarInterval` exactly the
five weekday 18:20 entries; `RunAtLoad=false`; `KeepAlive=false`;
`ProcessType=Background`; `ThrottleInterval=60`; working directory is the active
release; stdout/stderr are fixed files under the runtime root. The plist has no
`EnvironmentVariables` dictionary: `/usr/bin/env -i` creates the exact seven-key
environment containing `HOME`, `PATH`, `NODE_ENV`, `TZ`, the exact reviewed commit SHA,
and the two fixed references
`keychain:stockinsider-runtime:database-url` and
`keychain:stockinsider-runtime:internal-api-key`. The reviewed worker resolves only
those names through `/usr/bin/security` before constructing the database/API clients;
secret values never enter the plist,
manifest or package. Unknown plist keys, shell command strings, relative executable
paths, inherited ambient variables (including `NODE_OPTIONS`, `DYLD_*`, proxy, Git and
npm variables) or a hash mismatch fail before Keychain access and activation.

## Atomic install and rollback

The installer creates `releases/.staging-<128-bit-random-hex>` mode 0700 on the same
filesystem, copies only tracked allowlisted runtime files, runs the repository-pinned
package-manager install with the committed lockfile, captures/writes/fsyncs the
scheduler rollback package, writes and fsyncs the manifest,
rehashes every staged authority file, fsyncs the staging directory, then renames it to
`releases/<commitSha>`. It creates `current.next` as a relative symlink to that release,
fsyncs the root and atomically renames `current.next` over `current`. Launchd plist
publication/reload may occur only after this active-pointer commit. Interruption before
the pointer rename leaves the prior runtime and plists unchanged; interruption after
it is recoverable from the manifest's code rollback object and mandatory scheduler
rollback package.

An existing release name must have byte-identical
manifest/worker/config/scheduler-package hashes or the
install fails `active_runtime_conflict`; it is never overwritten. Rollback verifies
the prior manifest and every file hash, atomically switches only `current`, then reloads
the same scheduler label. It never copies from a working tree, deletes evidence or
changes a database/runtime mode.

Activation uses an fsynced canonical `stockinsider-runtime-activation-journal-v3`
with the only phases
`captured|release_published|old_owners_disabled|new_owner_loaded|doctor_passed|complete|rolled_back|recovered`.
Every nonterminal row embeds the exact prior pointer, its prior-manifest digest and the
closed four-label scheduler snapshot and binds the rollback-package digest. Startup
processes a nonterminal journal before `priorRelease`, scheduler capture or a new
manifest is constructed; identity/hash mismatch fails closed, otherwise it restores
scheduler then the fully rehashed prior release pointer, quarantines incomplete release
state and records `recovered`.
Each phase is written before its next side effect and replay is idempotent. The old
three owners are disabled only after the new release, proposed plist and rollback
package all rehash. The new owner is loaded only after all three exact prior states
are recorded and observed disabled. Doctor must pass before `complete`.

Failure or restart at any phase before `complete` runs the exact inverse: unload the
new label when it was not installed previously (otherwise restore its captured prior
bytes/state), atomically restore `current` when a prior release exists, restore each
prior plist's captured bytes and enabled/disabled state in reverse mutation order,
then rehash every restored plist/executable. Plist capture uses owner-controlled,
non-group/world-writable no-follow descriptors, accepting existing launchd mode 0644
files while preserving their exact bytes; publication/restoration uses same-directory fsynced atomic rename and
post-read hashing. A handled failure also quarantines its staged/published inactive
release before writing terminal `rolled_back`, so the same reviewed commit is retryable.
On a first tracked install,
`rollback=null` changes only the code-pointer branch; scheduler restoration still
uses the mandatory package, so disabling old owners can never leave zero recoverable
producer. Stale `current.next`, staging directories and journals are quarantined
only after their target/package hashes are read; no recursive deletion is used.
Any inverse mismatch returns `scheduler_rollback_failed`, keeps the new owner
unloaded and reports fail-closed doctor evidence.

## Sole scheduler and durable mapping

The only full producer owner is launchd label
`com.stockinsider.auth-source-worker`. Its executable is the active tracked worker
above and its sole config is the active hash-bound JSON. The closed trigger catalog is:

| Trigger | Production disposition |
|---|---|
| `com.stockinsider.auth-source-worker` calendar/start trigger | sole owner |
| `com.stockinsider.data-collect` | disabled before owner activation |
| `com.stockinsider.night-shift` | disabled before owner activation |
| `com.stockinsider.research-daemon` | disabled before owner activation |
| Vercel cron, package ad-hoc force commands and manual worker loops | forbidden as production scheduler |

The worker acquires one database advisory owner lock keyed by
`SHA256("stockinsider-producer-owner-v1")` before creating a run. A second owner exits
successfully with terminal disposition `owner_already_leased` and writes no analysis
or projection. The lease row binds `ownerLabel`, `commitSha`, `workerSha256`,
`schedulerConfigSha256`, random owner token, acquired/heartbeat/expiry timestamps and
attempt. Only the token holder may heartbeat or terminalize; expiry is reaped before
another owner starts.

The producer execution plane is the separate `legacy_correctness` graph below. It does
not call a V3 control route, create an `opportunity_runs` row, mutate a V3 relation or
use any of the existing 33 V3 RPCs. Its sole read exception is the run-bound authority
bridge inside `acquire_legacy_producer_lease_v3_11`, owned by the separate legacy
correctness RPC owner and closed below. That bridge may read only cutoff-valid
instrument/source authority rows and registries required to build the exact frozen
roster/source roots; it cannot begin/advance a V3 run or read V3 results/projections.
`SOURCE_LED_OPPORTUNITY_V3=disabled` therefore continues to mean zero V3
internal/public/detail route operation and zero V3 write. The graph reuses only
design invariants—one leased unit, immutable result and database-derived successor—
and never aliases a V3 run, job or result.

The tracked `config/runtime/auth-source-dag.json` is RFC 8785 canonical JSON plus LF
with exactly this schema:

```ts
type AuthSourceDagConfigV1 = {
  schema:'stockinsider-auth-source-dag-v1';
  runtimeMode:'legacy_correctness';
  ownerLabel:'com.stockinsider.auth-source-worker';
  trigger:{
    kind:'launchd_calendar';
    timezone:'Asia/Taipei';
    weekdays:[1,2,3,4,5];
    hour:18;
    minute:20;
    runAtLoad:false;
  };
  leaseSeconds:120;
  legacyRadarBaseUrl:'https://stockinsider-three.vercel.app';
  legacySeedSymbols:[
    '2301','2303','2308','2330','2337','2344','2345','2356','2379','2382',
    '2408','2421','2449','2454','3008','3017','3034','3037','3189','3231',
    '3324','3533','3711','4958','5347','5388','6230','6285','6415','6669'
  ];
  stages:[
    {ordinal:0;name:'source_sync';dependsOn:null;timeoutSeconds:900;maxAttempts:5},
    {ordinal:1;name:'mention_claim_extraction';dependsOn:'source_sync';timeoutSeconds:900;maxAttempts:5},
    {ordinal:2;name:'candidate_funnel';dependsOn:'mention_claim_extraction';timeoutSeconds:600;maxAttempts:5},
    {ordinal:3;name:'facts_refresh';dependsOn:'candidate_funnel';timeoutSeconds:1200;maxAttempts:5},
    {ordinal:4;name:'analysis_revision';dependsOn:'facts_refresh';timeoutSeconds:1200;maxAttempts:5},
    {ordinal:5;name:'compact_radar_projection';dependsOn:'analysis_revision';timeoutSeconds:300;maxAttempts:5}
  ];
};
```

No unknown member, alternate consumer origin, omitted/additional/reordered/duplicate/malformed seed symbol,
reordered stage,
alternate dependency, extra trigger or arbitrary command is valid. The installer hashes
these exact bytes; the worker parses and
byte-compares the complete value against the compiled schema before acquiring a run.
The RFC 8785 canonical config without its file LF is exactly 1,225 bytes with
SHA-256 `9fb3b93a065212683a8a73b4daa021aaded6148b6b9b9c5a35d4c7e7c637081b`;
the tracked file is those bytes plus exactly one LF, 1,226 bytes total, with SHA-256
`1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2`.
Its seed preimage is the exact 247-byte RFC 8785 value from
`discovery-correctness-contract.md`, with `legacySeedSetHash`
`e6d9c09b8b552f5d9eaf389b76d2d90daa2d89578433d2a1ad63286888b3b743`.
Changing a member requires a versioned contract/config/migration change; it is not a
runtime-selected set. Seed membership is diagnostic only and cannot admit or rank a
stock.
Launchd owns cadence only. Database time, scheduled occurrence, lease and predecessor
state own execution.

At acquire, the legacy owner invokes the private V3-owner, database-clock-only helper
`resolve_legacy_scheduled_occurrence_v3_11(owner_label,
scheduler_config_sha256)`. Acquire supplies the exact tracked 1,226 config bytes plus
their digest; the legacy owner verifies the embedded canonical config and seed
authority before invoking the resolver. It normalizes its statement timestamp to a whole second
and derives the greatest config-owned Asia/Taipei weekday 18:20 occurrence not after
that time plus the cutoff-visible composite session. It does not accept a caller
clock, cutoff, trading date or session hash. The derived tuple is exactly:

```text
scheduledOccurrenceId = SHA256(RFC8785([
  "legacy-producer-scheduled-occurrence-v1",
  ownerLabel,localCalendarDate,"18:20:00","Asia/Taipei",
  schedulerConfigSha256
]))
sourceCutoff = that occurrence instant as UTC whole-second RFC3339 Z
tradingDate = localCalendarDate only when the cutoff-visible TWSE/TPEX composite
              session is completed and byte-agreeing, otherwise null
tradingSessionAuthorityHash = that composite hash, otherwise null
```

Before the next occurrence becomes due, every late launch, crash restart, lease reap
and retry resolves the same tuple. After a new occurrence is due, acquire first
returns/retries any nonterminal prior tuple; otherwise it selects the new tuple.
Terminal success is byte-identically retained. A terminal failed/cancelled occurrence
increments only its own attempt through five; it never shifts cutoff. A holiday has
null trading authority and terminalizes as succeeded
`non_trading_occurrence` after source accounting with zero analysis revision,
projection or public-write change. A cutoff-late correction is ineligible by ordinary
point-in-time rules; it cannot rewrite the occurrence.

The resolver is security-definer with empty search path, owned by
`opportunity_v3_rpc_owner`, and grants EXECUTE only to
`legacy_correctness_rpc_owner`. It reads only the canonical scheduler config identity
and cutoff-valid `tw_trading_sessions_v3` rows needed for the composite resolver and
returns one fixed tuple; it writes nothing, accepts no date/time and exposes no open
calendar query. No login role can invoke or enumerate it.

Acquire locks
`logicalRunKey=SHA256(RFC8785(["legacy-producer-run-v3",
scheduledOccurrenceId,sourceCutoff,tradingDate,tradingSessionAuthorityHash,
commitSha,workerSha256,schedulerConfigSha256,legacySeedSetHash]))`. A retained success or active run is
returned byte-identically; after terminal failure/cancellation the next attempt is
prior attempt plus one. `runId` is a UUID formed from the first 128 SHA-256 bits of UTF-8
`"legacy-run:" + logicalRunKey + ":" + decimalAttempt`. The UUID is an opaque
deterministic database key; the full logical hash remains the authority.

For a new attempt, one acquire transaction performs this exact order:

1. validate config/seed authority, resolve occurrence and lock `logicalRunKey`;
2. derive `runId` and insert the running run with its immutable occurrence, cutoff,
   trading authority, commit, worker, config and seed members;
3. invoke
   `read_legacy_discovery_authority_v3_11(run_id,commit_sha,
   scheduler_config_sha256)`;
4. validate and store every bounded authority page and frozen selected-revision row;
5. derive/store the compact root bytes, equal JSON and SHA-256 on that run;
6. derive the exact `source_sync` payload containing that frozen hash, then its
   `payloadHash`, `inputHash` and `jobId`; and
7. insert the immutable payload and queued execution-ordinal-zero stage-barrier job.

An exception, missing/overflow/conflicting authority row or any insert/hash failure
rolls back all seven steps, including the new run. No durable preparing placeholder or
authority-free job exists. A retained run already has the byte-identical frozen
authority pages/root, payload and job and never invokes the helper again. Later-recorded
authority cannot enter a same-occurrence retry.

For every stage barrier or per-revision shard, the payload contains the seed hash,
exact predecessor result hash, stage/kind and nullable shard/revision identity. The run
row separately binds commit, worker and config. PostgreSQL defines:

```text
inputHash = payloadHash
jobId = UUID(first128bits(SHA256(UTF8("legacy-job:" + runId + ":" + executionOrdinal))))
```

The deterministic UUID is an opaque database key, not the hash authority. No caller
supplies these identities or the attempt number.

`legacy_producer_runs_v3_11`, the paged frozen-authority relations,
`legacy_producer_jobs_v3_11`, `legacy_producer_job_payloads_v3_11`,
`legacy_producer_job_results_v3_11` and the three per-revision outcome relations are
the sole durable graph. Acquire atomically creates one running run, every bounded
authority page/frozen selected-revision row, its compact authority root and the
ordinal-zero queued job in the order above. Claim selects only the least
`execution_ordinal` queued/retryable job whose exact predecessor succeeded, leases it
with a random token and returns its immutable payload plus predecessor result. For
`source_sync` only, claim also verifies that the payload's `authorityBundleHash`
byte-equals the run's frozen `authority_hash` and returns that already-persisted
compact authority root:

```text
["legacy-discovery-authority-v1",scheduledOccurrenceId,sourceCutoff,
 rosterManifestHash,aliasManifestHash,taxonomyAssignmentManifestHash,
 sourceDatasetManifestHash,rosterPageRoot,aliasPageRoot,taxonomyPageRoot,
 selectedRevisionPageRoot,rosterCount,aliasCount,taxonomyCount,
 selectedRevisionCount,connectorConservationHash]
```

Roster pages use the exact 500-row/sentinel/cursor contract; source pages use the
exact 200-row/sentinel/cursor contract and per-connector 1,000 cap. The bundle is
canonical bytes plus equal JSON/hash, at most 64 KiB, stored immutably on the run.
Page rows are not embedded in that root: acquire stores each at-most-500 roster row
page and at-most-200 selected-revision row page in immutable run-owned page/row
relations before the root and source-sync payload hash are derived. A frozen selected
revision row is exactly its source-dataset selected tuple plus
`selectionOrdinal`, `revisionId`, `rawFieldPayloadAlgorithmVersion`,
`ingestionContentRevisionSha256`, `canonicalContentAlgorithmVersion` and
`canonicalContentSha256OrNull`; it never contains `rawFieldPayload`. The complete
page/root conservation is built only by that helper from
`stock_instruments_v3`, `stock_aliases_v3`,
`stock_sector_assignments_v3`, `source_revision_family_registry_v3`,
`source_document_revisions_v3` and `source_identity_authorities_v3` under
their cutoff/index/bound contracts. The authority helper is owned by
`opportunity_v3_rpc_owner`, has empty search path, grants EXECUTE only to the NOLOGIN
`legacy_correctness_rpc_owner`, and grants no table/view access to that role or
`service_role`. It receives read-only SELECT only on the exact legacy run row needed
to validate the database-derived occurrence, cutoff, producer commit/config and
running state; it
cannot write either plane. Wrong job/token/stage/commit/hash, unfiltered enumeration,
root mismatch, row 501/201 misuse or overflow returns zero authority page and zero
write. The helper is invoked only by the fixed new-run acquire branch after run insert
and before frozen-page/root/payload/job insert; no claim, stage or other function can
invoke it.

`source_sync` completion creates either the first deterministic
`mention_claim_extraction/revision_shard` job in selected-revision ordinal order or,
when the selected count is zero, the bounded
`mention_claim_extraction/stage_barrier`. Each revision shard payload binds exactly one
frozen row and its expected hashes. A shard claim uses one SQL transaction with one
nested exception block. Inside that block the claim locks the queued/retryable job,
derives a fresh random token, stages the incremented attempt and lease/token fields,
and invokes the private
`read_legacy_frozen_revision_v3_11(run_id,job_id,owner_token_hash,revision_id,
selected_revision_row_hash)` helper. The helper validates the running run, exact
leased shard, token hash, producer/config identity, selection ordinal and frozen row;
then returns only that append-only `source_document_revisions_v3` row with byte-equal
raw/canonical hashes. It cannot select a current family head, a different revision or
an ordinal range, and it returns no row on any mismatch. Claim requires exactly one
row, validates its identity, algorithms, raw/canonical hashes and the complete
canonical-plus-JSON size, and constructs the one-revision claim return before the
outer transaction may commit.

Zero rows, more than one row, identity/algorithm/hash/shape disagreement, helper
exception or size overflow raises the sole internal typed result
`data_integrity_failure` inside the nested block. That block rolls back the staged
attempt, token, lease and timestamps. The outer claim then atomically marks the
previously queued/retryable job and its run terminal `failed` with
`failure_code=data_integrity_failure`, with attempt unchanged and every owner/lease
field null, returns zero claim rows and commits no raw bytes. No such failure is
retryable or consumes one of the five attempts. On the successful branch only, the
lease mutation, token/hash/helper validation and one-revision return commit together.
The raw payload therefore crosses the boundary only one revision at a time and is
restart-safe without being embedded in the run root.

Each successful revision-shard completion atomically persists the exact one-document,
at-most-200-claim and at-most-1,000-mention typed rows, stores the bounded shard result,
succeeds the job and creates only the next selected ordinal. The final shard creates
the stage barrier. The barrier claim receives a database-computed, at-most-64-KiB
connector/count/conservation object over the immutable outcome rows; its completion
stores only the outcome root/counts and creates `candidate_funnel`. Candidate-funnel
claim receives a database-computed at-most-60-candidate input projection, never the
unbounded normalized row population. Every shard and barrier has a deterministic
identity, one predecessor, at most five attempts and byte-identical retry semantics.

Each other successful stage-barrier completion atomically stores one immutable result.
The facts and analysis barriers each contain at most 60 uniquely keyed ordered
candidate objects and 3 MiB; retries reuse the same hash-bound read bundle, so a stock
is evaluated at most once per successful occurrence without an unbounded monolithic
plane. Completion succeeds the job and creates exactly the next tabled barrier; stage ordinal five also
terminalizes the run as success. A failed attempt becomes `retryable` when attempt is
below `maxAttempts`, otherwise atomically fails the job and run. Reaping uses database
time and the same rule. No worker-supplied stage, stage/shard/execution ordinal,
revision identity, predecessor, next payload, job ID, input hash or terminal status is
accepted.

The stage payload/result schemas are exhaustive:

| Job | Payload | Required result |
|---|---|---|
| `source_sync/stage_barrier` | `[legacySeedSetHash,runId,scheduledOccurrenceId,sourceCutoff,tradingDateOrNull,tradingSessionAuthorityHashOrNull,authorityBundleHash]` | `{schema,authorityHash,sourceCutoff,legacyPayloads:{daily,hot,weekly,home},legacyPayloadHashes:{daily,hot,weekly,home}}`; each daily/hot/weekly payload is captured once from the fixed HTTPS consumer origin, `home` is byte-equal to daily, each payload is `<=150,000` bytes and the complete immutable result is `<=3 MiB` |
| `mention_claim_extraction/revision_shard` | `[legacySeedSetHash,sourceSyncResultHash,selectionOrdinal,sourceKey,revisionId,selectedRevisionRowHash,ingestionContentRevisionSha256,ingestionCanonicalContentHashV3OrNull]` | `[revisionId,selectionOrdinal,documentOutcomeId,claimCount,mentionCount,parseOutcomeRoot]` |
| `mention_claim_extraction/stage_barrier` | `[legacySeedSetHash,sourceSyncResultHash,selectedRevisionPageRoot,selectedRevisionCount]` | `[parseOutcomeRoot,documentCount,claimCount,mentionCount,connectorConservationHash]` |
| `candidate_funnel/stage_barrier` | `[legacySeedSetHash,parseOutcomeRoot,candidateInputRoot]` | `[candidateLedgerIds,discoverySummary]` |
| `facts_refresh` | `[legacySeedSetHash,candidateResultHash,orderedDeepSymbols]` | `[fundamentalSnapshotRefs,technicalSnapshotRefs,valuationSnapshotRefs]` |
| `analysis_revision` | `[legacySeedSetHash,factsResultHash,orderedCandidateSymbols]` | `[analysisRevisionIds,analysisEvaluationIds]` |
| `compact_radar_projection` | `[legacySeedSetHash,analysisResultHash,projectionAsOf]` | `[projectionId,projectionKey,payloadChecksum]` |

Claim itself constructs the exhaustive post-parse read plane; the worker has no
direct table access. `mention_shard_results` is the ordered persisted shard-result
set. `candidate_funnel_input` is the predecessor barrier plus the run-owned diagnostic
seed set and at most 60 candidates. `candidate_fact_plane` is returned only by
`read_legacy_candidate_fact_plane_v3_11(source_cutoff,candidate_result)`: for each of
those at-most-60 exact stock UUIDs it selects at most 256 cutoff-valid append-only
financial rows and 251 cutoff-valid adjusted OHLCV sessions, plus at most 251 TAIEX
reference sessions, all in deterministic order. `analysis_revision_input` is the
persisted facts result plus the run cutoff/producer identity. `compact_projection_input`
is the persisted analysis result plus the original succeeded `source_sync` result's
four legacy payloads, their hashes and exact result hash. Thus a retry cannot refetch
a later public payload, select a current family head or substitute a different
candidate. Every read value is canonicalized, hashed, bound to the leased
run/job/token/predecessor, capped at 3 MiB inside the at-most-5-MiB claim response and
returned with its exact row count. Missing source result, wrong kind/hash, invalid
candidate UUID/symbol, count overflow or byte overflow fails before stage execution;
completion either atomically persists the result and exact successor or leaves the
prior durable state retryable/terminal under the closed failure precedence.

Every array has the exact ordering and bounds in the discovery, financial, technical,
revision and radar contracts; the generic job envelope is canonical JSON no larger
than 3 MiB. PostgreSQL copies the run-owned seed hash into every payload and rejects
any predecessor/result chain whose hash differs. For `source_sync`, PostgreSQL also
copies the already-frozen run-owned authority hash and claim rejects disagreement
before returning any bytes. A revision shard additionally binds the frozen
selected-revision row and claim returns no raw bytes until all lease/hash checks pass.
Stage-specific append RPCs accept writes only while the caller owns the matching
leased job. Parse outcome rows are legal only for the exact revision shard, candidate
rows only at `candidate_funnel`, revisions
and evaluations only at `analysis_revision`, and a compact projection only at
`compact_radar_projection`. Completion verifies the exact retained IDs/counts and
hashes before publishing the successor. The projection append RPC alone inserts the
dedicated `legacy_radar_projections_v3_11` row and applies its exact per-window
1,500-row retention transaction. ACL/trigger checks reject direct service-role
mutation; the existing `runtime_artifacts` relation and retention behavior are
unchanged.

Producer states are `running|success|failed|cancelled`; job states are
`queued|leased|retryable|succeeded|failed|cancelled`. `skipped` is not a state: it is
a succeeded result with reason
`no_material_input_change|daily_analysis_already_terminal|owner_already_leased`.
Every job and run has a non-negative database-time duration. A terminal row is
immutable, every created run becomes terminal, and duplicate semantic input returns
the byte-identical retained result or fails `data_integrity_failure`.

Failure precedence is `data_integrity_failure`, explicit `cancelled`,
`provider_unavailable`, then lease expiry. Integrity fails the job/run immediately;
cancelled maps both to cancelled; provider/expiry becomes retryable below attempt five
and `job_attempts_exhausted` at five. A caller cannot submit retryability or a clock.

The immutable base-analysis uniqueness key is
`["analysis-base-v1",tradingDate,symbol]`; at most one succeeds per non-null
session-authorized symbol/date. A non-trading occurrence creates no analysis key. An
extra analysis requires `analysisKind="material_rerun"` and unique key
`["analysis-material-v1",tradingDate,symbol,triggerKind,materialChangeHash]`, where
`triggerKind` is `material_evidence|price_state_transition|official_filing`.
Duplicate keys return the retained terminal result. Every created run reaches
`success|failed|cancelled`; a negative duration, null terminal timestamp on a terminal
row, terminal-to-running transition or duplicate semantic write is integrity failure.

## Doctor and internal health

Doctor is read-only and accepts no caller-supplied health observation. It reads the
release files and launchd state directly, opens a read-only PostgreSQL transaction
using the fixed Keychain database reference, and calls the authenticated deployed
consumer health endpoint using the fixed internal-key reference. It validates, in
order: canonical manifest, review binding,
actual file hashes, scheduler rollback package/hash and activation journal,
active symlink target, proposed/installed plist hash/semantics, sole scheduler
owner/disabled-trigger catalog, lease schema, latest run
terminality/non-negative duration, stuck-run count, projection checksum/freshness,
and consumer/producer compatibility. It emits one canonical object:

```ts
type RuntimeHealthV11 = {
  schema: 'stockinsider-runtime-health-v1.1';
  status: 'pass'|'fail';
  checkedAt: string;
  producer: {
    commitSha: string|null;
    reviewedTreeSha: string|null;
    workerSha256: string|null;
    schedulerConfigSha256: string|null;
    schedulerRollbackPackageSha256: string|null;
    manifestSha256: string|null;
  };
  scheduler: {
    owner: 'com.stockinsider.auth-source-worker'|null;
    ownerPlistSha256:string|null;
    competingOwners: string[]; // sorted, max 8
    leaseStatus: 'absent'|'active'|'expired'|'invalid';
  };
  runtime: {
    stateSchema: 'stockinsider-producer-state-v1'|null;
    lastTerminalRunAt: string|null;
    lastTerminalStatus: 'success'|'failed'|'cancelled'|null;
    stuckRunCount: number;
  };
  projection: {
    asOf: string|null;
    checksum: string|null;
    freshness: 'fresh'|'stale'|'missing'|'invalid';
  };
  consumer: {
    commitSha: string|null;
    acceptedProducerSchema: 'stockinsider-producer-state-v1';
    compatibility: 'compatible'|'producer_newer'|'consumer_newer'|'unknown';
  };
  reasons: Array<
    'manifest_missing'|'manifest_noncanonical'|'review_binding_invalid'|
    'worker_hash_mismatch'|'config_hash_mismatch'|
    'scheduler_rollback_package_missing'|'scheduler_rollback_hash_mismatch'|
    'activation_journal_incomplete'|'active_pointer_invalid'|
    'scheduler_plist_mismatch'|'scheduler_owner_mismatch'|
    'competing_scheduler'|'lease_invalid'|
    'state_schema_mismatch'|'last_run_nonterminal'|'negative_run_duration'|
    'stuck_runs_present'|'projection_missing'|'projection_hash_mismatch'|
    'projection_stale'|'consumer_producer_incompatible'
  >;
};
```

Reasons are unique in the displayed enum order, arrays/counts are bounded non-negative
integers, and `status='pass'` iff `reasons=[]`. Internal health exposes this object
without secret paths/tokens. A hash or compatibility failure cannot be relabeled
degraded/pass and blocks later shadow activation.
