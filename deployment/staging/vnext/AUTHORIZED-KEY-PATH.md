# Isolated SSH authorization path — source and NONKEY fixtures

The operator reported an isolated SSH daemon could not read its authorization
file through a root-owned private staging tree. The operator then changed only
that isolated daemon to a separate runtime authorization directory. These are
operator-reported observations; this source work makes no host connection and
does not inspect the running daemon or authorization file. Production SSH
configuration is unchanged.

The old bootstrap called `mkdir(mode=0o750)` for the staging root and `.ssh`
without subsequently setting the directory modes. Under `umask 077`, both
become `0700`. Setting the file to `0640` leaves that traversal failure intact.
The offline regression uses an invalid-for-SSH NONKEY sentinel to reproduce it,
then drops credentials in a child process to check the resulting read denial.

The intended future isolated-daemon contract is an absolute
`AuthorizedKeysFile /run/stockinsider-vnext-staging-auth/authorized_keys`,
outside the private staging root. The directory must be root-owned, belong to
the dedicated staging reader group and be exactly `0710`; the single regular
file must have the same owner/group, mode `0640` and one hardlink. The root and
`/run` ancestors require the reviewed root-owned baseline, root group and exact
`0755` modes, with no symlinks or POSIX access/default ACLs. This is a source
contract, not an observation of `/run` or an installed daemon configuration.
An actual absolute-path binding to the dedicated isolated daemon, its reader
group membership and all other authentication paths need independent review.
Restricted key options alone do not disable passwords or other keys in another
daemon. No production SSH setting is changed or granted by these files.

`bootstrap.py` retains its original default capacity calculation, gateway bytes
and CLI flags. `--apply` now unconditionally rejects immediately after argument
parsing, before capacity reads, public-file access or account/key processing.
The old account/password and private-root `.ssh` mutation fallback is removed.
The dry-run reports the new path as `INTENT_ONLY`, the daemon binding as
`NOT_OBSERVED`, and `hostApplyAdmitted=false`. It neither repairs nor rotates an
existing host authorization file. Tests invoke the closed `--apply` barrier only
with a nonexistent public fixture path and require its immediate fixed refusal;
no admitted host apply or key read occurs. Isolated Python `-I --help` is also
checked without observing host capacity.

`authorized_key_path.py` has no admitted host installer or daemon configuration
writer. Its host facade always remains disabled and accepts no caller-created
readiness proof. Its only filesystem writer accepts a narrowly named private
temporary anchor and writes a fixed NONKEY sentinel, never caller key bytes.
The temporary sticky-parent exception is fixture-only and cannot substitute for
the `/run` contract. The anchor and authorization directory remain root-owned,
dedicated-group, exact `0710` directories. Results contain behavior booleans and
always retain `fixtureOnly=true`, `hostApplied=false`, `stagingAccepted=false`.

Fixture operations open every component with descriptor-relative `O_NOFOLLOW`,
check exact owner/group/type/mode and POSIX ACL absence through file descriptors,
and recheck each ancestor and named inode binding before accepting success.
Missing ACL observation fails closed. Files also require a single hardlink and
bounded size before any bytes are read; nonblocking opens reject FIFOs without
waiting for a writer. Existing mismatches fail without chmod, repair, overwrite
or expiry renewal. New descriptors receive explicit ownership and `fchmod`
independent of umask. A bounded temporary file is fsynced and published with an
atomic no-replace hardlink, then the temporary name is removed and the final
single-link contract is verified. A partial rejected fixture is not a live
cleanup or rollback guarantee.

The pure options formatter fixes `restrict`, the original forced-command gateway
and a canonical UTC expiry strictly in the future and at most one hour away.
Exact repeated bytes can be idempotent only while that same expiry remains
valid. Fixture expiry checks are source tests, never proof that a server enforced
expiry, revoked an identity or closed existing sessions. The gateway still
allows only `vnext-preflight-v1`; there is no worker, timer, database or broader
SSH grant.

The focused Python suite requires a real root-owned temporary filesystem and
actual child credential drops; unavailable privileges cause a blocked failure,
never skipped tests or mocked ownership acceptance. It uses no account lookup,
account creation, key, environment/secret file, agent socket, SSH process, network,
host `/run` write, service action or database. Its output is sanitized behavior
booleans. Execution and results are coordinated separately from source review.
