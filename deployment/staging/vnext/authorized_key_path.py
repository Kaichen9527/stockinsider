"""Disabled host contract plus bounded NONKEY filesystem fixtures only.

No host-path installer, SSH config writer, account lookup or key reader exists
here. Fixture APIs accept only a pre-created private temporary anchor and write
an invalid-for-SSH sentinel; their results establish no runtime authority.
"""
import datetime
import os
import re
import stat

HOST_AUTH_DIRECTORY = '/run/stockinsider-vnext-staging-auth'
HOST_AUTHORIZED_KEYS_FILE = HOST_AUTH_DIRECTORY + '/authorized_keys'
FORCED_GATEWAY = '/usr/local/libexec/stockinsider-vnext-oct22-staging-gateway'
_SENTINEL = 'NONKEY_SENTINEL_NOT_AN_SSH_IDENTITY'
_MAX_BYTES = 4096
_DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC


class KeyPathContractError(Exception):
    """Fixed codes only: never reflect paths, identities, bytes or OS errors."""


def _fail(code):
    raise KeyPathContractError(code) from None


def host_path_readiness(*args, **kwargs):
    if args or kwargs:
        _fail('host_readiness_overrides_forbidden')
    return dict(disabled=True, hostApplied=False, isolatedSshdBindingObserved=False,
                exclusiveGroupObserved=False, keysProcessed=False,
                stagingAccepted=False)


def apply_host_authorized_path(*args, **kwargs):
    _fail('isolated_sshd_host_apply_not_admitted')


def _utc(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ', value):
        _fail('canonical_utc_required')
    try:
        return datetime.datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc)
    except ValueError:
        _fail('canonical_utc_required')


def authorization_options(expires_utc, now_utc):
    expires, now = _utc(expires_utc), _utc(now_utc)
    if not 0 < (expires - now).total_seconds() <= 3600:
        _fail('future_expiry_within_one_hour_required')
    return 'restrict,expiry-time="' + expires.strftime('%Y%m%d%H%M%SZ') + '",command="' + FORCED_GATEWAY + '"'


def _payload(expires_utc, now_utc):
    return (authorization_options(expires_utc, now_utc) + ' ' + _SENTINEL + '\n').encode('ascii')


def _acl_absent(fd):
    try:
        names = os.listxattr(fd)
    except (OSError, AttributeError, TypeError):
        _fail('acl_observation_unavailable')
    if 'system.posix_acl_access' in names or 'system.posix_acl_default' in names:
        _fail('posix_acl_forbidden')


def _metadata(fd, *, directory, gid, mode):
    s = os.fstat(fd)
    if (not (stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode))
            or s.st_uid != 0 or s.st_gid != gid or stat.S_IMODE(s.st_mode) != mode):
        _fail('exact_type_owner_group_mode_required')
    if not directory and (s.st_nlink != 1 or s.st_size < 1 or s.st_size > _MAX_BYTES):
        _fail('single_link_bounded_regular_file_required')
    _acl_absent(fd)
    return s


def _same_inode(left, right):
    return (left.st_dev, left.st_ino) == (right.st_dev, right.st_ino)


def _bound(chain, gid):
    for index, (parent, name, fd) in enumerate(chain):
        _metadata(fd, directory=True, gid=0 if index < 2 else gid,
                  mode=(0o755 if index == 0 else (0o1777 if name == 'tmp' else 0o755)) if index < 2 else 0o710)
        if parent is not None:
            named = os.stat(name, dir_fd=parent, follow_symlinks=False)
            if not stat.S_ISDIR(named.st_mode) or not _same_inode(named, os.fstat(fd)):
                _fail('directory_binding_changed')


def _open_anchor(anchor, gid):
    if os.geteuid() != 0:
        _fail('root_owned_fixture_privilege_required')
    if type(gid) is not int or not 0 < gid < 2147483647:
        _fail('nonzero_dedicated_fixture_group_required')
    # Exactly one private anchor below one allowed local fixture parent. No
    # normalization, symlink resolution, arbitrary prefix or /run substitution.
    if not isinstance(anchor, str) or not re.fullmatch(r'/(?:tmp|workspace)/stockinsider-keypath-fixture-[A-Za-z0-9_-]{8,80}', anchor):
        _fail('private_temporary_fixture_anchor_required')
    parent_name, anchor_name = anchor.split('/')[1:]
    chain = []
    try:
        root_fd = os.open('/', _DIR_FLAGS)
        chain.append((None, '/', root_fd))
        _metadata(root_fd, directory=True, gid=0, mode=0o755)
        parent_fd = os.open(parent_name, _DIR_FLAGS, dir_fd=root_fd)
        chain.append((root_fd, parent_name, parent_fd))
        # The sticky shared temp parent exception is ONLY a fixture anchor
        # rule. It is never accepted as a host /run baseline or auth directory.
        _metadata(parent_fd, directory=True, gid=0, mode=0o1777 if parent_name == 'tmp' else 0o755)
        anchor_fd = os.open(anchor_name, _DIR_FLAGS, dir_fd=parent_fd)
        chain.append((parent_fd, anchor_name, anchor_fd))
        _metadata(anchor_fd, directory=True, gid=gid, mode=0o710)
        _bound(chain, gid)
        return chain
    except BaseException:
        for _, _, fd in reversed(chain):
            os.close(fd)
        raise


def _read_exact(directory_fd, expected, gid):
    fd = os.open('authorized_keys', _FILE_FLAGS, dir_fd=directory_fd)
    try:
        before = _metadata(fd, directory=False, gid=gid, mode=0o640)
        if before.st_size != len(expected):
            _fail('existing_authorization_mismatch')
        value = os.read(fd, _MAX_BYTES + 1)
        after = _metadata(fd, directory=False, gid=gid, mode=0o640)
        named = os.stat('authorized_keys', dir_fd=directory_fd, follow_symlinks=False)
        if (not _same_inode(before, after) or not _same_inode(after, named)
                or (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns)
                or not stat.S_ISREG(named.st_mode) or value != expected):
            _fail('existing_authorization_mismatch')
    finally:
        os.close(fd)


def _publish_sentinel(directory_fd, expected, gid, chain):
    # A fixed bounded namespace is sufficient: this root-owned nonwritable
    # directory cannot be populated by the reader. Existing entries are never
    # overwritten, repaired, rotated, chmodded or removed.
    temporary = None
    fd = None
    try:
        for index in range(32):
            name = '.fixture-pending-' + str(index)
            try:
                fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=directory_fd)
                temporary = name
                break
            except FileExistsError:
                continue
        if fd is None:
            _fail('bounded_temporary_namespace_exhausted')
        os.fchown(fd, 0, gid)
        os.fchmod(fd, 0o640)  # Explicitly independent of the caller's umask.
        # Check ACLs and the newly created descriptor before writing any bytes.
        s = os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_uid != 0 or s.st_gid != gid or stat.S_IMODE(s.st_mode) != 0o640 or s.st_nlink != 1:
            _fail('new_file_metadata_mismatch')
        _acl_absent(fd)
        written = os.write(fd, expected)
        if written != len(expected):
            _fail('incomplete_fixture_write')
        os.fsync(fd)
        _metadata(fd, directory=False, gid=gid, mode=0o640)
        _bound(chain, gid)
        # linkat-style publication is atomic and refuses replacement. The
        # temporary second hardlink is removed before final nlink==1 validation.
        try:
            os.link(temporary, 'authorized_keys', src_dir_fd=directory_fd, dst_dir_fd=directory_fd, follow_symlinks=False)
            created = True
        except FileExistsError:
            created = False
        os.unlink(temporary, dir_fd=directory_fd)
        temporary = None
        os.fsync(directory_fd)
        _read_exact(directory_fd, expected, gid)
        _bound(chain, gid)
        return created
    finally:
        if fd is not None:
            os.close(fd)
        if temporary is not None:
            os.unlink(temporary, dir_fd=directory_fd)


def install_fixture_authorization(anchor, dedicated_gid, expires_utc, now_utc):
    """Write only a NONKEY sentinel; return behavior booleans, never identifiers.

    Existing content/metadata must match exactly; this API cannot install a
    public/private key or accept caller payloads, force commands or host paths.
    """
    expected = _payload(expires_utc, now_utc)  # Validate expiry before any IO.
    chain = []
    created_dir = False
    try:
        chain = _open_anchor(anchor, dedicated_gid)
        anchor_fd = chain[-1][2]
        try:
            os.mkdir('auth', 0o700, dir_fd=anchor_fd)
            created_dir = True
            created_inode = os.stat('auth', dir_fd=anchor_fd, follow_symlinks=False)
        except FileExistsError:
            pass
        auth_fd = os.open('auth', _DIR_FLAGS, dir_fd=anchor_fd)
        chain.append((anchor_fd, 'auth', auth_fd))
        if created_dir:
            opened = os.fstat(auth_fd)
            if not stat.S_ISDIR(opened.st_mode) or not _same_inode(created_inode, opened):
                _fail('new_directory_binding_changed')
            _acl_absent(auth_fd)
            os.fchown(auth_fd, 0, dedicated_gid)
            os.fchmod(auth_fd, 0o710)
        _metadata(auth_fd, directory=True, gid=dedicated_gid, mode=0o710)
        _bound(chain, dedicated_gid)
        try:
            _read_exact(auth_fd, expected, dedicated_gid)
            created = False
        except FileNotFoundError:
            created = _publish_sentinel(auth_fd, expected, dedicated_gid, chain)
        _metadata(auth_fd, directory=True, gid=dedicated_gid, mode=0o710)
        _bound(chain, dedicated_gid)
        return dict(fixtureOnly=True, created=created, idempotent=not created,
                    exactOwnerGroupMode=True, posixAclAbsent=True,
                    hostApplied=False, stagingAccepted=False)
    except KeyPathContractError:
        raise
    except (OSError, ValueError, TypeError):
        _fail('filesystem_contract_rejected')
    finally:
        for _, _, fd in reversed(chain):
            os.close(fd)
