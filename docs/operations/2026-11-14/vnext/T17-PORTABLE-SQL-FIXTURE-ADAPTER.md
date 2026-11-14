# Executable portable SQL fixture adapter — NOT a real-backup adapter

This follows the reviewed4096 correction and closed orchestration contract. The
coordinator's onsite public fixture report remains separately recorded at
`t17-onsite-pg17-fixture-report.json`. No actual ciphertext, key, production DB or
Contabo resource was received or operated by this Cloud task.

## Actual Cloud PostgreSQL execution

`deployment/staging/vnext/t17_keyfd/portable_sql_fixture_adapter.py` exposes a
zero-argument fixed PUBLIC fixture. It creates and observes its own nonroot
PG17.11/server170011 cluster, fresh private PGDATA, peer authentication, private
Unix socket and listen_addresses=''. DB/user/socket/data identity is queried
from that server before use. It accepts no caller connection, SQL, backup, key,
binary or readiness option; real-backup execution always raises. An exact child
environment excludes inherited PG service/pass/host settings. Private `/tmp`
is fixed, ignoring TMPDIR; NSS resolves before allocating resources.

It captures and verifies the exact Git blob bytes of the ORIGINAL portable
bootstrap, compatibility migration and JS TOC helper pinned at protection9bca.
No copy of those SQL implementations is invented. Captured SQL is passed by
stdin; the captured helper is run from the new private directory. This is a
source binding, not proof of independent backup/key provenance or trusted
production executable admission.

Actual positive flow:

1. Existing bootstrap/pgcrypto on both new fixture DBs.
2. Fixed public2stocks/12signals, owned by NOLOGIN postgres compatibility role,
   RLS/policies/ACL grants, plus public synthetic vault/legacy-function objects
   solely to exercise exclusions. No real secret values exist.
3. Custom-format dump -> original JS TOC filter (**5 actual exclusions**) ->
   owner/ACL-preserving pg_restore into new target.
4. Exact original data-plane compatibility migration. No extra app/schema stubs
   were needed; deferred PL/pgSQL references are NOT exercised as full app logic.
5. Synthetic restored identity fence is activated then disarmed with the original
   restored-only SQL, clearing activation metadata before checks.
6. Observe14 NOLOGIN compatibility roles,2 fixture postgres owners,2RLS tables,
   2policies,4 data-plane RLS tables,0provider rows, no vault/legacy secret function;
   anon SELECT succeeds and INSERT is rejected. Source/target public data hashes
   match `53e611e465041f220bdb816e208f2b3ecddfc1a45e5412b8a12fca4f8393e1ca`.
7. Stop/wait/reap only the owned postmaster; socket and private tree removed.

4/4 focused tests pass, including poisoned PGHOST/PGDATABASE/PGSERVICE/TMPDIR
and refusal of connection/backup/key/executable/readiness overrides. Combined
Python37/37 and retained candidate12/12 pass. Independent source reviewer also
executed4/4 on the exact final source, with zero openP0/P1 in this fixed-public
fixture scope. This is engineering review, not formalA1 or real restore acceptance.

## Limits and first failures preserved

The first two intermediate attempts failed at fixed Node tool selection:
`/usr/bin/node` absent, then Cloud runtime Node's mapped UID65534 rejected by
the initial ownership check. They were not restore successes. Exact intermediate
source hashes were not captured. Final selection uses only conventional Node or
the fixed read-only Cloud runtime path; no caller PATH/binary option. The Cloud
exception requires mapped root/nobody ownership, no group/other write and no
current-user write. Final tests/source hashes are recorded in the JSON receipt.
PG tools similarly use only conventional17 paths or the existing fixed local
official-package fixture installation; this is not production binary attestation.

Child CPU20s/file32MiB/FD64/core0 limits apply; PG children have768MiB address-space
limits. Node instead has a64MiB JS heap because V8 reserves a large virtual cage.
Commands have <=15s timeout,90s cooperative overall deadline and bounded shutdown.
These are NOT aggregate cgroup/disk reservations, an instantaneous capture cap,
or cleanup guarantees under SIGKILL. External supervised OS sandbox admission
remains a live-runtime prerequisite. Owned generated artifacts are cleared;
original backups/release artifacts are neither read nor pruned.

This adapter's plaintext archive is generated synthetic data. It is NOT the
fs-verity/GCM/key-FD path and cannot accept an archive from another source.
The seven-table/three-function application contract, full ownership allowlist,
lineage and complete storage/provider set are not validated by these2table tests.
Successful fixture results never enable real restore or consume a production key.
Connecting the executable SQL stages to approved immutable disk replay, independent
keystore, actual host admission/lock/capacity and full validation is still pending.

## Reproduction and retained gates

With the exact pinned original source files and reviewed PG17/Node fixture tools:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s scripts/tests -p test_t17_portable_sql_fixture.py -v
```

Run only the fixed PUBLIC fixture, not a supplied backup or real connection.
No script here provisions loop/mounts, bypasses the existing live facade, modifies
HOLD/CI or changes PR384/main/product protection. Exact full-branch web build,
types/lint and formal review gates remain incomplete due full-checkout transport
CONNECT503; no older-source build is substituted and no gate is waived.
