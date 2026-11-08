# Isolated authorization path / schedule replay identity — bounded amendment

Continue protection checkpoint6428918f540d5d088814be324ab8578c0cb41e4e on the same development VM with explicitly selected GPT-6.1 Sol High authors and independent engineering review. This authorizes source changes and offline filesystem/fixture verification only. No Contabo connection, VPN/key handling, sshd/timer activation, SQL/native retry, original PR-head change or release.

## Root cause and path contract

The reported isolated SSH failure concerns a nonroot authentication read beneath root-owned private directories. Existing bootstrap mkdir(mode0750) does not override umask0077, so directories can become0700 even when the final authorization file is explicitly0640. Source inspection must remain separate from the coordinator's real SSH evidence; no private logs, addresses, credentials or account identifiers are imported.

The intended isolated-daemon authorization path is outside the private staging root, beneath a dedicated root-owned runtime directory: exact directory0710/root:dedicated nonzero group and regular single-link file0640/root:same group. The authentication reader may traverse/read but cannot list/write/replace the authorization. Other groups must not inherit access. Restrict, bounded future UTC expiry≤1hour and the original forced command remain fixed. Expiry does not automatically terminate an already-authenticated session or clean up identities.

Use descriptor-relative nofollow operations with exact type/owner/group/mode and ACL checks, bounded file size, inode/name binding rechecks and atomic no-replace publication. Existing mismatched content/ownership/mode/links/ACL/path must refuse without repair, overwrite, key rotation or expiry renewal. Repetition accepts only identical still-valid content. Reject symlinks, hardlinks, special files, unsafe ancestors, missing ACL observation and changed bindings. Unprivileged-write resistance does not imply protection from an external privileged administrator after return.

This development slice never installs an authorization file or daemon binding on a host. Host writer remains hard-disabled; fixture APIs accept only an invalid-for-SSH nonkey sentinel in a bounded private temporary anchor, never caller key bytes, a host path or an activation attestation. Legacy bootstrap apply refuses before capacity/key/account processing until a separately reviewed real isolated-daemon integration exists; preserve default capacity dry-run/CLI compatibility without treating this VM as host capacity evidence. No production sshd configuration is changed or used as fallback.

## Offline evidence and privacy

Reproduce the old umask/path traversal failure and the new actual kernel nonroot read/no-write/group-denial behavior, plus mode/owner/group/link/ACL/expiry/isolation negatives. Ordinary executor root privilege is unavailable; the supported managed local Docker runtime may run a digest-pinned official Python image with networknone, readonly root/source, small temporary filesystem and only credential-drop/file-owner capabilities. No privileged container, host network, host runtime/key/env mount, account creation or host daemon/service change is authorized. Stop/mark blocked if actual DAC credentials cannot be tested; mode arithmetic or a mock is not kernel read/no-write evidence.

Public receipts contain source versions, test results and redacted behavior only: no staging address, key/fingerprint, account/UID/GID, temporary identity or private log. Synthetic anonymous fixture data is not real SSH authentication or exclusive live group membership. Coordinator real SSH checks in the independent VM remain separate acceptance.

## Optional schedule replay identity contract

Reuse the existing disabled schedule fixture's official-session/fixed-cutoff planning to distinguish stable slot identity from material request identity. Material binds exact selected calendar revision, original source/event/publication facts and opaque original queue/admission/prepared/provider/ranking request references. Acquisition-only or generated clocks must not manufacture another billable attempt; substantive changed material at one slot is a conflict, not permission to retry. Preserve original result cutoff/expiry on completed fixture replay; pending/uncertain/failed outcomes never authorize an automatic POST.

Existing ledgers do not currently provide a whole-entry composite receipt. New pure identity observation is explicitly FixtureOnly and not a DB row, FK, lease, review or authority. No new ledger, route, SQL, store/worker integration or proof is created; execution/charge/provider-POST flags and production boundary remain false/Disabled. The planner's prior fixture-receipt domain cannot be substituted for this new identity domain. Missing original retry/cause references remain explicit gaps.

## Gates

Run bounded Python/kernel fixture and TypeScript/source regressions, types/lint/full ordinary build on this VM; bind exact source, environment limits and sanitized results before pushing the existing protection branch. Native HOLD/same_failure_limit2/maxiterations5, VN01–VN20, A1/protected review, real source/current qualification/session/scheduler/staging/backup/release gates remain. No raw private staging evidence is published; no old VM/iCloud data is changed or deleted.
