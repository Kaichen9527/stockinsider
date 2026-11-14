# T18 fixed validated-clone read point — preflight only

T17 compatibility was published first at
bddce6ba2de5b1b81d94ab532624a365d556f8c7. Its70-test receipt and source hashes
remain historical evidence for that exact commit. Actual September-backup
compatibility and row checks still require the coordinator's next onsite run.
This separate follow-up does not retroactively accept any failed restore.

## Fixed lifetime and boundary

The engine's private context owns the restored PG17 process/socket/tree. Its
single yield occurs only after GCM/TOC/bootstrap/restore/compat migration, restored
identity-fence disable, owner/portable/app contracts, historical CHECK row tests,
named RLS/grants and all seven lineage anti-joins. DB failure never enters a
reader. A private handle exposes one fixed observation method, no command/SQL
selector; it is invalidated on exit. Reader failure also destroys the clone.
Existing restore_owned_database(replay, work_root) retains its DB-only signature;
there is no callback, live flag or keep-alive argument. This is an internal
trusted-source boundary, not protection against arbitrary code in the same Python
process. External admission remains actual OS/FD/key/immutable-source observation.

The new fixed entry is scripts/staging_restore_reader_preflight.py. It uses the
same host/FD3–8/key/capacity/GCM guard as T17, with no caller readiness assertions
or arbitrary executable/connection arguments. The1200s main alarm,900s engine
budget,768MiB/no-swap sandbox requirements and teardown order remain unchanged.
It performs the fixed read point before cleanup and returns only after cleanup.
The ordinary DB-only entry still has no app consumer or new CLI options.

Inside one repeatable-read READ ONLY transaction, the observer checks the two
reader tables and11 fixed column names/types in public against the known reader
contract. Views/foreign tables/wrong types do not qualify. A schema gap reports
GAP_SCHEMA without selecting nonexistent/invalid row sources. Matching schemas
return only home/daily valid snapshot counts, count older than26h, missing-date
count and strictly projected oldest/newest UTC YYYY-MM-DD. No payload, ID, etag,
publication reason, SQL, log or runtime path is output. Missing genuine rows
reports GAP_NO_PUBLISHED_SNAPSHOT; a count reports OBSERVED_PUBLISHED_SNAPSHOT,
which is descriptive only. It does not certify ranking health or genuine-source
acceptance. Rows, timestamps, data and catalog state remain unchanged.

## Onsite invocation and limits

After the host independently prepares the SAME reviewed dedicated staging
sandbox and FD3–8 handoff from T17, it may replace only the Python entry with:

```sh
/usr/bin/python3 -I -B /readonly/reviewed-repo/scripts/staging_restore_reader_preflight.py \
  --work-root /run/stage/work
```

The example paths are namespace-local host preparation, not paths to production.
The script does not prepare mounts, open permissions, SSH, obtain keys or choose
an external database. Cloud refuses its actual admission before PostgreSQL.
The receipt explicitly retains rankingHealth=NOT_ACCEPTED,
postgrestAcceptance=NOT_RUN, nextRollback=NOT_RUN and fullReleaseAcceptance=false.
Do not send raw data/logs/SQL or any key to Cloud. A successful DB-only run already
deleted its clone; this entry must be chosen before that run, not attached later.

## Actual app adapter requirements still open

Issue403 reports two retained, verified genuine Next16.3.4 packages:

- dd59817f750684b093965f539dd4de466be13077, manifest344489589e929158a73d658c968128a563dd53ed9a5eac6b37ee89553b9a0a4a.
- 169aad1b6cfa747f78ae3464b614f43c0749d806, manifest2893ad708f4164abdc269e40bfcf15d167e00ee7e4e6b539e82305e25830575a.

Cloud inspected their public GitHub source, not these onsite binary packages.
Both use data-plane-runtime.ts blob2eb1f6e218a762f4853837b865185f81a39a9691:
fixed127.0.0.1:3302 with SDK /rest/v1. Native PostgREST3301 alone is insufficient.
Their credential setting name does not require a JWT service_role claim; a fresh
staging-only role/JWT can fit the unchanged runtime contract. Never reuse the
restored stockinsider/service_role role: original service_role has BYPASSRLS and
writes. A future fixed app consumer needs clone-only SELECT grants/RLS policies,
no elevated membership or writable RPCs, independently scoped JWT custody, and
3302 prefix forwarding restricted to read methods on the private network. The
PostgREST login must be a clone-only unprivileged authenticator with reviewed
peer mapping to the sandbox OS user and membership only in the staging reader.
It must never connect as the owned-cluster admin. GET-only HTTP alone does not
remove PUBLIC EXECUTE/SECURITY DEFINER RPC privilege; those paths need explicit
restriction and negative tests. The current count observer uses the internal DB
admin solely in a READ ONLY transaction and establishes none of these app roles.

Issue403 reports PostgREST16.3 binary SHA256
0cf367dc2ee47d5c648baa2952e25bdf299de4e1998d31e251bb00d129262d71.
It remains an onsite asset, not a binary executed in this Cloud slice. No
PostgREST or Next process is started here, and this read point does not yet
provide a live HTTP endpoint. Future actual app consumption must be implemented
as a fixed reviewed operation inside this same validated scope, with bounded
process/memory/socket cleanup. It must not turn the DB-only entry into an
arbitrary command callback or use this receipt as permission.

The two packages postdate the2026-09-19 backup. Old snapshots must retain their
original date and stale/read-only action policy. A missing snapshot/schema is a
real gap, never a reason to insert fixtures into a restored backup. The prior
8cf11bed86cc091eec9686aa6fb2bc48af758bc5 home/static/rollback evidence used empty
REST data and radar503, so it remains partial T18 evidence. Actual restored-data
HTTP results, genuine snapshot/schema compatibility, new-radar package, A→B→A
and fault rollback, and unchanged production pointers/services/timers are still
onsite acceptance items. No such acceptance is claimed by this source slice.
