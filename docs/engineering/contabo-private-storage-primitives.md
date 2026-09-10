# Private storage primitives — implementation slice

These modules are deliberately not yet connected to production. This change does
not migrate data, replace Vault, activate a connector, or claim system recovery.

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

Still required before production: systemd encrypted credential loading, dedicated
database/RLS migration, atomic generation-checked refresh/revoke transactions,
principal and writer fences, runtime adapters, signed callback integration and a
full restore/canary. Cryptographic envelope tests do not establish those properties.

## Verification

Run `npm run test:contabo-data-plane` (seven cases) and `npm --prefix web run build`.
Fixtures exercise two-link publication, concurrent idempotent puts, caller Buffer
mutation, writable ancestors, traversal, symlink, tamper and cryptographic identity
mutation. No real token or document is included in source control.
