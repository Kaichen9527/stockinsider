# Exact pinned0664 package compatibility

Onsite preflight of fa1d6c4658f703718f33d7307aaa88a2071056fb correctly stopped
before any launch or key, but its contract was too restrictive for the two
original packages. A contains1246 ordinary0644,1328 ordinary0664 and10 ordinary0755
files; B contains1246/1330/10 respectively. Their exact original manifest modes
and content hashes match. All0664 files are root:root. The coordinator further
reported2584/2586 members,513 directories each0755, manifest0644, no links/special
or missing paths,180349201 total asset bytes and exact PostgREST pin; systemd255
private joined-unit namespace cookie checks passed and production signatures were
unchanged (onsite evidence7e0e253). These facts are not Cloud execution admission.

Only the two compiled original(commit,manifestSHA256) pairs may structurally
contain ordinary0664 files. Canonical manifest hashing must still match exactly.
The exception then requires a private live lease from the actual fixed RO asset
mount: independently opened fixed release directory, same held-FD device/inode
AND kernel mount ID, ST_RDONLY, root-owned non-writable directory. Member modes
are sealed only after the original manifest pin is verified. Tree traversal and
file hashing both enforce exact member0664, regular inode, UID0/GID0 and nlink1;
file hashing additionally checks ST_RDONLY on its actual open FD. Ownership/mode
and inode metadata must remain stable across hashing. An arbitrary parsed
manifest or Boolean cannot issue this lease or authorize an executable.

Wrong GID/UID, other writable modes, RW alias FD, different/closed release FD,
unknown pins, writable directories, links, special files and missing RO evidence
reject. Node/PostgREST binary rules and original pins are unchanged. Manifest
wrapper remains0644, as explicitly created by the original public packager.
No chmod of original packages or captured member copies is needed or permitted
by this change. Existing root/private/RO asset lifetime requirements remain.

## Exact runtime files to stage

Retain all previously verified fa1d6c runtime blobs and all four historical
migration pins. Replace ONE module and add ONE optional no-key entry:

- deployment/staging/vnext/t17_keyfd/t18_release_assets.py
- scripts/staging_t18_assets_preflight.py

The adjacent JSON receipt records their SHA256 and Git blob IDs. Tests and docs
need not be staged for runtime. Both old release manifests/bytes/modes and Node/
PostgREST pins remain original. The old real-restore entry and FD3–8 handoff are
unchanged; this patch does not itself start any unit or read a key.

## No-key asset admission

In the coordinator's new private RO asset/source namespace, as a nonroot
capability-free actor, run only:

```sh
/usr/bin/python3 -I -B /readonly/t18-source/scripts/staging_t18_assets_preflight.py
```

No arguments, stdin credential, keyFD3–8 or live flag is accepted. The entry
hashes/observes only the fixed assets and returns ASSETS_VERIFIED_ONLY. It neither
starts PG/app/brokers nor authorizes real restore. In Cloud it fails closed
because the fixed root-owned RO tree and pinned binaries are unavailable.
An asset-only transient unit may use DynamicUser, PrivateNetwork, ProtectSystem
strict, capability bounds empty and private RO binds of the fixed source/assets;
there is no reason to give it a key or production paths.

The repository still lacks the known-good root-only SCM_RIGHTS host loader
source/protocol. The e1987ea commit identifies the reader adapter; its public
receipt stores launcher SHA256, not launcher bytes. Full reusable real-key host
orchestration therefore requires the coordinator's exact sanitized loader source
and FD3–8/peer/lock/cleanup protocol. Do not guess a replacement or execute the
real restore entry as a no-key admission check. HOLD remains and no formal service,
production mode or protected release/PR branch is changed.
