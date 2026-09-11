# Private storage primitives — implementation slice

These modules are connected to the dormant Contabo runtime adapter, but this
change does not migrate production data, activate the adapter or claim recovery.

## Artifact store

`privateArtifactStore` accepts a trusted absolute private root, a SHA-256 hash and
bounded bytes. Parents must be owned by root/the service UID and not writable by
untrusted users (root-owned sticky temporary parents are allowed for rehearsal).
The deployment must isolate the service account; this is not protection against
root or another process with that same UID.

Inputs are copied before asynchronous work, then privately written and fsynced.
Hard-link publication is atomic and never overwrites an existing final object.
Reads tolerate the two-private-link publication window, reject symlinks, bound
allocation and verify the complete hash. Original object/receipt identity remains
the caller's database responsibility. There is no public file route.

## Provider envelope

AES-256-GCM binds provider, credential ID, generation, key version and token digest
through AAD. A live trusted registry must supply the expected identity, not the
stored envelope. Errors do not return credential bytes. Callers must clear their
plaintext/key buffers.

The Contabo adapter loads versioned root keys from systemd credentials. Encrypted
provider rows use generation compare-and-swap for replacement and revocation, so
a delayed refresh cannot resurrect a revoked token. Threads lifecycle requests
remain signed, origin-bound and replay-deduplicated in the database.

## Runtime and restore contract

`STOCKINSIDER_DATA_PLANE=contabo` selects a SHA-256-pinned service-role JWT and
loopback-only PostgREST. The exact Supabase project-host guard is unchanged for
the compatibility mode. Candidate financial documents use the hash store in
Contabo mode and record a receipt after the file is fsynced and re-read.

The destination database first receives
`deployment/vps/bootstrap-stockinsider-postgres.sql`. It creates the role names
and pgcrypto extension required by the reviewed schema, but no login passwords
or plaintext Vault compatibility objects. Legacy Vault-backed function
definitions must be explicitly excluded from restore; the encrypted credential
RPCs in `20260911_contabo_data_plane_v1.sql` supersede them.

The bootstrap also creates one passwordless, non-privileged PostgreSQL login
named `stockinsider`.  It is only for the same-named isolated OS account running
PostgREST over PostgreSQL's Unix socket with `peer` authentication.  The
deployment must keep PostgreSQL TCP closed to this role and set the encrypted
`database-uri` credential to a socket URI such as
`postgresql:///stockinsider?host=/run/postgresql`.  The role has no superuser,
database creation, role creation, replication or RLS-bypass attribute; it can
only switch to the JWT roles granted by the bootstrap.

Generate a TOC with `pg_restore --list`, then run
`node scripts/build-contabo-restore-list.mjs <input-list> <new-output-list>`.
The 0600 output excludes Vault namespace objects, the named legacy
Threads/FinMind Vault functions, and the exact `extensions` schema creation
owned by the bootstrap. The bootstrap installs pgcrypto in that original schema
before dependent functions are replayed. The six provider-managed extension and
PostgREST DDL event triggers are also excluded rather than granting SUPERUSER to
their compatibility owner; standalone PostgREST schema reload is an operator
action. Review the exclusion count before using the list for rehearsal; the
source archive is never rewritten.

`scripts/rehearse-contabo-database-restore.mjs` performs the clean local
rehearsal. It authenticates the complete AES-GCM archive before SQL execution,
restores owners and ACLs into a new Unix-socket-only cluster, applies the
additive Contabo migration, and checks schema, RPC, trigger, RLS, grants and
owner mappings. It writes a mode-0600 receipt without row data or secrets and
then removes the disposable cluster. A passing receipt is recovery evidence,
not production cutover approval.

The identity fence is dormant after migration. During reviewed cutover, an
operator registers exactly one backend UUID, runner principal and 40-character
release, then activates the singleton. Writes still require the active release
and production lease. PostgreSQL and PostgREST remain private/loopback-only.

Still required before production: a complete schema/owner/grant/RLS restore,
credential transfer in restricted memory, capacity rehearsal and external
canary. These tests do not authorize migration or deployment.

## Verification

Run `npm run test:contabo-data-plane` and `npm --prefix web run build`.
Fixtures exercise two-link publication, concurrent idempotent puts, caller Buffer
mutation, writable ancestors, traversal, symlink, tamper and cryptographic identity
mutation. No real token or document is included in source control.
