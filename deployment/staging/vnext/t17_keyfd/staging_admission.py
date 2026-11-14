"""Observed Linux staging admission. No caller receipt or readiness authority.

The host provisions the namespace, encrypted/private work mount, cgroup and
exclusive lock. This observer changes none of them and rejects unknown state.
It does not prove the root host administrator or a compromised kernel honest.
"""
import errno
import fcntl
import os
from pathlib import Path, PurePosixPath
import re
import socket
import stat

GiB = 1024**3
MAX_MEMORY_BYTES = 768 * 1024**2
MIN_HOST_DISK_BYTES = 15 * GiB
MIN_HOST_MEMORY_BYTES = 1536 * 1024**2
MIN_WORK_FREE_BYTES = 512 * 1024**2
PRODUCTION_PG_DIRECTORIES = (
    '/var/lib/postgresql', '/run/postgresql', '/var/run/postgresql',
    '/srv/stockinsider/pgdata', '/srv/stockinsider-postgres','/etc/stockinsider',
)


class StagingAdmissionRejected(Exception):
    """Sanitized fixed rejection labels; no private paths or system logs."""


def _decode_mount_field(value):
    return re.sub(r'\\([0-7]{3})', lambda m: chr(int(m.group(1), 8)), value)


def _mounts(text):
    rows = []
    for line in text.splitlines():
        left, separator, right = line.partition(' - ')
        a, b = left.split(), right.split()
        if not separator or len(a) < 6 or len(b) < 3:
            raise StagingAdmissionRejected('mount_observation_invalid')
        rows.append({'id':a[0], 'device':a[2], 'root':_decode_mount_field(a[3]),
                     'mount':_decode_mount_field(a[4]), 'options':set(a[5].split(',')),
                     'optional':a[6:], 'filesystem':b[0], 'super_options':set(b[2].split(','))})
    return rows


def _finite_memory_limit(value):
    if not value.strip().isdigit():
        raise StagingAdmissionRejected('finite_memory_cgroup_required')
    result = int(value)
    if result <= 0 or result > MAX_MEMORY_BYTES:
        raise StagingAdmissionRejected('memory_cgroup_limit_required')
    return result


def _observe_cgroup():
    lines = Path('/proc/self/cgroup').read_text().splitlines()
    matches = [line[3:] for line in lines if line.startswith('0::')]
    if len(matches) != 1:
        raise StagingAdmissionRejected('cgroup_v2_required')
    path = PurePosixPath(matches[0])
    if not path.is_absolute() or '..' in path.parts:
        raise StagingAdmissionRejected('cgroup_path_rejected')
    root = Path('/sys/fs/cgroup').joinpath(*path.parts[1:])
    memory = _finite_memory_limit((root / 'memory.max').read_text())
    if (root / 'memory.swap.max').read_text().strip() != '0':
        raise StagingAdmissionRejected('swap_disabled_cgroup_required')
    return memory


def _observe_exclusive_lock(fd):
    if type(fd) is not int or fd <= 2:
        raise StagingAdmissionRejected('host_lock_fd_required')
    info = os.fstat(fd)
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0
            or info.st_mode & 0o022 or info.st_nlink != 1):
        raise StagingAdmissionRejected('root_owned_host_lock_required')
    # Atomically acquire/retain EX on the supplied trusted inode. This also works
    # for a root0600 handoff that the DynamicUser cannot reopen by pathname.
    # The same open description must remain owned until final cleanup.
    _acquire_exclusive_lock(fd)
    os.set_inheritable(fd,False)


def _acquire_exclusive_lock(fd):
    """Actual syscall helper; not admission without root-owned inode checks."""
    try:
        fcntl.flock(fd,fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        raise StagingAdmissionRejected('exclusive_host_lock_unavailable') from None


def _check_preallocation(image, work_bytes):
    if image.st_size <= 0 or image.st_blocks * 512 < image.st_size:
        raise StagingAdmissionRejected('fully_preallocated_backing_image_required')
    if work_bytes > image.st_size:
        raise StagingAdmissionRejected('work_filesystem_image_size_rejected')


def _namespace_and_privileges():
    if os.getuid() == 0 or os.geteuid() == 0:
        raise StagingAdmissionRejected('nonroot_required')
    status = Path('/proc/self/status').read_text()
    for name in ('CapEff','CapPrm','CapAmb'):
        caps = re.search(r'^'+name+r':\s*([0-9a-fA-F]+)$',status,re.M)
        if caps is None or int(caps.group(1),16) != 0:
            raise StagingAdmissionRejected('capability_free_required')
    if {name for _,name in socket.if_nameindex()} != {'lo'}:
        raise StagingAdmissionRejected('private_loopback_network_required')
    current = os.stat('/proc/self/ns/net')
    # DynamicUser/ProtectProc may prohibit root-PID1 namespace stat. That does
    # not negate the actual only-lo/capability-free observation above. Record
    # the unavailable comparison honestly instead of requiring another host FD.
    try:
        host = os.stat('/proc/1/ns/net')
    except (PermissionError,FileNotFoundError):
        return 'unavailable'
    if (current.st_dev,current.st_ino) == (host.st_dev,host.st_ino):
        raise StagingAdmissionRejected('independent_network_namespace_required')
    return 'distinct'


def _production_pg_inaccessible():
    for path in PRODUCTION_PG_DIRECTORIES:
        try:
            os.stat(path)
        except (FileNotFoundError,PermissionError):
            continue
        if os.access(path,os.R_OK | os.X_OK):
            raise StagingAdmissionRejected('production_pg_path_accessible')


def _bind_encrypted_image(device, backing_image_fd, host_directory_fd, work_info, work_stat):
    if (type(backing_image_fd) is not int or backing_image_fd <= 2
            or backing_image_fd == host_directory_fd):
        raise StagingAdmissionRejected('backing_image_fd_required')
    image = os.fstat(backing_image_fd)
    host = os.fstat(host_directory_fd)
    if (not stat.S_ISREG(image.st_mode) or image.st_uid != 0 or image.st_mode & 0o022
            or image.st_nlink != 1 or image.st_dev != host.st_dev or image.st_dev == work_info.st_dev):
        raise StagingAdmissionRejected('root_owned_backing_image_required')
    if fcntl.fcntl(backing_image_fd,fcntl.F_GETFL) & os.O_ACCMODE != os.O_RDONLY:
        raise StagingAdmissionRejected('readonly_backing_image_fd_required')
    _check_preallocation(image,work_stat.f_blocks * work_stat.f_frsize)
    dm = Path('/sys/dev/block') / device
    if not (dm/'dm/uuid').read_text().strip().startswith('CRYPT-'):
        raise StagingAdmissionRejected('encrypted_work_device_required')
    slaves = list((dm/'slaves').iterdir())
    if len(slaves) != 1 or not re.fullmatch(r'loop\d+',slaves[0].name):
        raise StagingAdmissionRejected('dedicated_loop_backing_required')
    backing = (Path('/sys/class/block')/slaves[0].name/'loop/backing_file').read_text().strip()
    if not backing.startswith('/') or '\x00' in backing or backing.endswith(' (deleted)'):
        raise StagingAdmissionRejected('loop_image_identity_unobservable')
    linked = os.stat(backing)
    if (linked.st_dev,linked.st_ino) != (image.st_dev,image.st_ino):
        raise StagingAdmissionRejected('loop_image_identity_rejected')
    os.set_inheritable(backing_image_fd,False)


def observe_staging(work_root, lock_fd=6, host_directory_fd=7, backing_image_fd=8):
    """Observe actual bindings; preserve host FDs until caller's final cleanup.

    FD6 is an inherited root-owned host lock; EX is acquired on that actual FD
    before capacity observations. FD7 is a read-only host filesystem directory whose
    device differs from the work mount; it measures reserve OUTSIDE the image.
    FD8 is the read-only root-owned fully-preallocated backing image. The actual
    dm-crypt->single loop device mapping must identify that same image inode.
    The parent must never unlock its shared lock OFD while staging runs.
    """
    try:
        namespace_comparison = _namespace_and_privileges()
        memory = _observe_cgroup()
        _observe_exclusive_lock(lock_fd)
        requested = Path(work_root)
        if not requested.is_absolute() or requested.is_symlink():
            raise StagingAdmissionRejected('dedicated_work_mount_required')
        work = requested.resolve(strict=True)
        info = work.stat()
        if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid()
                or stat.S_IMODE(info.st_mode) != 0o700):
            raise StagingAdmissionRejected('private_owned_work_root_required')
        mounts = _mounts(Path('/proc/self/mountinfo').read_text())
        matching = [row for row in mounts if row['mount']==str(work)]
        root_mounts = [row for row in mounts if row['mount']=='/']
        if (len(matching)!=1 or len(root_mounts)!=1 or work==Path('/')
                or matching[0]['id']==root_mounts[0]['id']):
            raise StagingAdmissionRejected('dedicated_work_mount_required')
        mount = matching[0]
        if ('rw' not in mount['options'] or any(x.startswith('shared:') for x in mount['optional'])
                or 'ro' not in root_mounts[0]['options']):
            raise StagingAdmissionRejected('private_strict_work_mount_required')
        if mount['filesystem']!='ext4' or not re.fullmatch(r'\d+:\d+',mount['device']):
            raise StagingAdmissionRejected('encrypted_private_work_filesystem_required')
        work_stat = os.statvfs(work)
        work_free = work_stat.f_bavail * work_stat.f_frsize
        if work_free < MIN_WORK_FREE_BYTES:
            raise StagingAdmissionRejected('work_capacity_floor')
        if (type(host_directory_fd) is not int or host_directory_fd<=2
                or len({lock_fd,host_directory_fd,backing_image_fd})!=3):
            raise StagingAdmissionRejected('host_capacity_fd_required')
        host_info = os.fstat(host_directory_fd)
        if not stat.S_ISDIR(host_info.st_mode) or host_info.st_dev==info.st_dev:
            raise StagingAdmissionRejected('separate_host_capacity_fd_required')
        if fcntl.fcntl(host_directory_fd,fcntl.F_GETFL) & os.O_ACCMODE != os.O_RDONLY:
            raise StagingAdmissionRejected('readonly_host_capacity_fd_required')
        _bind_encrypted_image(mount['device'],backing_image_fd,host_directory_fd,info,work_stat)
        host_stat = os.fstatvfs(host_directory_fd)
        host_free = host_stat.f_bavail * host_stat.f_frsize
        if host_free < MIN_HOST_DISK_BYTES:
            raise StagingAdmissionRejected('host_disk_reserve_floor')
        mem = re.search(r'^MemAvailable:\s*(\d+)\s+kB$',Path('/proc/meminfo').read_text(),re.M)
        available = int(mem.group(1))*1024 if mem else 0
        if available - MAX_MEMORY_BYTES < MIN_HOST_MEMORY_BYTES:
            raise StagingAdmissionRejected('host_memory_reserve_floor')
        _production_pg_inaccessible()
        os.set_inheritable(host_directory_fd,False)
        return {'nonroot':True,'effectiveCapabilities':0,'privateLoopbackNetwork':True,
                'networkNamespaceComparison':namespace_comparison,
                'memoryLimitBytes':memory,'swapLimitBytes':0,'strictPrivateWorkMount':True,
                'workStorage':'kernel_dm_crypt','backingImagePreallocationObserved':True,
                'backingImageDeviceBindingObserved':True,'workFreeBytes':work_free,'hostFreeBytes':host_free,
                'hostAvailableMemoryBytes':available,'exclusiveHostLockObserved':True,
                'productionPgPathsInaccessible':True}
    except StagingAdmissionRejected:
        raise
    except (OSError,ValueError,TypeError):
        raise StagingAdmissionRejected('staging_observation_unavailable') from None
