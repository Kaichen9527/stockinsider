"""Read-only kernel checks for the proposed Contabo staging storage layout.

This root-side probe has no authority to accept a restore. The existing
unprivileged admission observer and all of its checks remain in force.
"""
import fcntl
import os
from pathlib import Path
import re
import stat
import subprocess

SECTOR = 512
DISK_BYTES = 1792 * 1024**2
RAM_BYTES = 1536 * 1024**2
HOST_FLOOR = 15 * 1024**3
MEMORY_FLOOR = 1536 * 1024**2
WORK_FLOOR = 512 * 1024**2
RUNNER_MEMORY_LIMIT = 768 * 1024**2
SYS_BLOCK = Path('/sys/dev/block')
HOST_DIRECTORY = Path('/var/tmp')
STAGE_NAME = re.compile(r'stockinsider-t18-split-geometry\.[A-Za-z0-9]{8}')
DM_NAME = re.compile(r'si_t18_(?:crypt|linear)_[A-Za-z0-9]{8}')


class SplitStorageRejected(Exception):
    """Fixed labels only."""


def require(condition, label):
    if not condition:
        raise SplitStorageRejected(label)


def kernel_text(path, limit=4096):
    with path.open('rb') as source:
        data = source.read(limit+1)
    require(len(data)<=limit, 'kernel_observation_too_large')
    return data.decode('utf-8', errors='strict').strip()


def mount_rows():
    rows = {}
    for line in kernel_text(Path('/proc/self/mountinfo'), 1024**2).splitlines():
        before, divider, after = line.partition(' - ')
        left, right = before.split(), after.split()
        require(divider and len(left)>=6 and len(right)==3, 'mount_topology_unobservable')
        # The validated workspace paths below have no escaped characters.
        name = left[4]
        rows.setdefault(name, []).append((left[2], left[3], set(left[5].split(',')),
                                           left[6:], right[0], set(right[2].split(','))))
    return rows


def one_mount(rows, path, fstype, *, noswap=False):
    matches = rows.get(str(path), [])
    require(len(matches)==1, 'exact_workspace_mount_required')
    device, root, flags, propagation, filesystem, superflags = matches[0]
    require(filesystem==fstype and root=='/' and
            {'rw','nosuid','nodev','noexec'}<=flags and
            not any(flag.startswith('shared:') for flag in propagation),
            'private_mount_flags_required')
    if noswap:
        require('noswap' in superflags, 'ram_backing_mount_noswap_required')
    return device


def fs_device(info):
    return f'{os.major(info.st_dev)}:{os.minor(info.st_dev)}'


def image_info(fd, expected_path, expected_bytes):
    require(fcntl.fcntl(fd,fcntl.F_GETFL)&os.O_ACCMODE==os.O_RDONLY,
            'readonly_image_descriptor_required')
    info = os.fstat(fd)
    require(stat.S_ISREG(info.st_mode) and info.st_uid==0
            and stat.S_IMODE(info.st_mode)==0o600 and info.st_nlink==1,
            'root_owned_image_required')
    require(info.st_size==expected_bytes and info.st_blocks*SECTOR>=expected_bytes,
            'fully_allocated_exact_image_required')
    path_info = os.stat(expected_path, follow_symlinks=False)
    require((path_info.st_dev,path_info.st_ino)==(info.st_dev,info.st_ino),
            'image_descriptor_identity_mismatch')
    return info


def directory_info(fd, path):
    info = os.fstat(fd)
    path_info = os.stat(path, follow_symlinks=False)
    require(stat.S_ISDIR(info.st_mode) and
            (info.st_dev,info.st_ino)==(path_info.st_dev,path_info.st_ino) and
            fcntl.fcntl(fd,fcntl.F_GETFL)&os.O_ACCMODE==os.O_RDONLY,
            'host_directory_descriptor_required')
    return info


def device_dir(device):
    require(re.fullmatch(r'\d+:\d+',device) is not None,'kernel_device_id_invalid')
    return SYS_BLOCK / device


def slave_ids(block):
    return sorted(kernel_text(entry/'dev',64) for entry in (block/'slaves').iterdir())


def mapped_device(block, device, prefix, sectors, expected_name):
    require(kernel_text(block/'dev',64)==device and
            kernel_text(block/'size',64)==str(sectors) and
            kernel_text(block/'dm/suspended',64)=='0', 'running_mapper_identity_required')
    name = kernel_text(block/'dm/name',256)
    require(DM_NAME.fullmatch(name) is not None and name==expected_name and
            kernel_text(block/'dm/uuid',256).startswith(prefix), 'staging_mapper_kind_required')
    return name


def loop_device(device, image, filename, bytes_expected):
    block = device_dir(device).resolve(strict=True)
    require(re.fullmatch(r'loop\d+',block.name) is not None and
            kernel_text(block/'dev',64)==device and kernel_text(block/'size',64)==str(bytes_expected//SECTOR) and
            kernel_text(block/'loop/offset',64)=='0' and kernel_text(block/'loop/sizelimit',64)=='0',
            'whole_dedicated_loop_required')
    backing = kernel_text(block/'loop/backing_file')
    require(backing==str(filename), 'loop_backing_path_mismatch')
    actual = os.stat(backing, follow_symlinks=False)
    require((actual.st_dev,actual.st_ino)==(image.st_dev,image.st_ino),
            'loop_backing_descriptor_identity_mismatch')


def inspect_tool(executable, *args):
    path = Path(executable)
    info = path.stat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid==0 and info.st_mode&0o022==0,
            'system_device_mapper_tool_required')
    result = subprocess.run([str(path),*args],stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,check=True,timeout=3,
                            env={'LC_ALL':'C','PATH':'/usr/sbin:/usr/bin'})
    require(0<len(result.stdout)<=4096, 'mapper_query_result_invalid')
    return result.stdout.decode('ascii',errors='strict').splitlines()


def space(path_or_fd):
    info = os.fstatvfs(path_or_fd) if isinstance(path_or_fd,int) else os.statvfs(path_or_fd)
    return info.f_bavail*info.f_frsize


def check_split_work_root(work, host_fd, disk_fd, ram_fd):
    require(os.geteuid()==0 and Path('/proc/self/ns/mnt').readlink()!=Path('/proc/1/ns/mnt').readlink(),
            'private_root_coordinator_required')
    require(all(type(fd) is int and fd>2 for fd in (host_fd,disk_fd,ram_fd)) and
            len({host_fd,disk_fd,ram_fd})==3, 'distinct_storage_descriptors_required')
    work = Path(work)
    parent = work.parent
    require(work.is_absolute() and work.name=='stage' and parent.parent==HOST_DIRECTORY and
            STAGE_NAME.fullmatch(parent.name) is not None and work==work.resolve(strict=True),
            'owned_workspace_path_required')
    parent_info = parent.stat()
    require(parent_info.st_uid==0 and stat.S_IMODE(parent_info.st_mode)==0o700,
            'private_workspace_owner_required')
    root_name = parent/'root.img'
    ram_mount = parent/'ram'
    ram_name = ram_mount/'ram.img'
    mount_list = mount_rows()
    crypt_id = one_mount(mount_list,work,'ext4')
    ram_mount_id = one_mount(mount_list,ram_mount,'tmpfs',noswap=True)
    disk = image_info(disk_fd,root_name,DISK_BYTES)
    ram = image_info(ram_fd,ram_name,RAM_BYTES)
    host = directory_info(host_fd,HOST_DIRECTORY)
    require(disk.st_dev==host.st_dev and ram.st_dev!=host.st_dev and fs_device(ram)==ram_mount_id and
            fs_device(work.stat())==crypt_id and crypt_id not in {ram_mount_id,fs_device(host)},
            'distinct_physical_storage_required')

    disk_sectors, ram_sectors = DISK_BYTES//SECTOR, RAM_BYTES//SECTOR
    sectors = disk_sectors+ram_sectors
    suffix = parent.name.rsplit('.',1)[1]
    crypt = device_dir(crypt_id)
    crypt_name = mapped_device(crypt,crypt_id,'CRYPT-PLAIN-',sectors,'si_t18_crypt_'+suffix)
    children = slave_ids(crypt)
    require(len(children)==1,'single_linear_device_required')
    linear_id = children[0]
    linear = device_dir(linear_id)
    linear_name = mapped_device(linear,linear_id,'SI-T18-LINEAR-',sectors,'si_t18_linear_'+suffix)
    leaves = slave_ids(linear)
    require(len(leaves)==2 and len(set(leaves))==2,'two_distinct_loop_devices_required')

    crypt_status = inspect_tool('/usr/sbin/dmsetup','status',crypt_name)
    require(len(crypt_status)==1 and crypt_status[0].split()[:3]==['0',str(sectors),'crypt'],
            'one_full_crypt_target_required')
    # cryptsetup status reports the backing device and geometry, never the key.
    crypt_details = inspect_tool('/usr/sbin/cryptsetup','status',crypt_name)
    fields = dict((key.strip(),value.strip()) for line in crypt_details[1:]
                  for key,_,value in [line.partition(':')])
    backing = Path(fields.get('device','/'))
    backing_info = backing.stat()
    require(fields.get('cipher')=='aes-xts-plain64' and fields.get('keysize')=='512 bits' and
            fields.get('offset')=='0 sectors' and fields.get('size')==f'{sectors} sectors' and
            stat.S_ISBLK(backing_info.st_mode) and
            f'{os.major(backing_info.st_rdev)}:{os.minor(backing_info.st_rdev)}'==linear_id,
            'crypt_mapping_geometry_mismatch')

    status = inspect_tool('/usr/sbin/dmsetup','status',linear_name)
    require(len(status)==2 and all(line.split()[2:3]==['linear'] for line in status),
            'linear_target_count_mismatch')
    lines = inspect_tool('/usr/sbin/dmsetup','table','--target','linear',linear_name)
    require(len(lines)==2,'linear_target_count_mismatch')
    disk_segment, ram_segment = (line.split() for line in lines)
    require(len(disk_segment)==5 and len(ram_segment)==5 and
            disk_segment[:3]==['0',str(disk_sectors),'linear'] and
            ram_segment[:3]==[str(disk_sectors),str(ram_sectors),'linear'] and
            disk_segment[-1]==ram_segment[-1]=='0' and
            sorted([disk_segment[3],ram_segment[3]])==leaves,
            'ordered_linear_geometry_required')
    loop_device(disk_segment[3],disk,root_name,DISK_BYTES)
    loop_device(ram_segment[3],ram,ram_name,RAM_BYTES)
    require(one_mount(mount_rows(),work,'ext4')==crypt_id and
            one_mount(mount_rows(),ram_mount,'tmpfs',noswap=True)==ram_mount_id and
            slave_ids(crypt)==children and slave_ids(linear)==leaves and
            inspect_tool('/usr/sbin/dmsetup','table','--target','linear',linear_name)==lines,
            'workspace_geometry_changed')
    image_info(disk_fd,root_name,DISK_BYTES)
    image_info(ram_fd,ram_name,RAM_BYTES)
    available = re.search(r'^MemAvailable:\s*(\d+)\s+kB$',kernel_text(Path('/proc/meminfo')),re.M)
    require(available is not None,'host_memory_measurement_required')
    memory = int(available[1])*1024
    host_disk, work_disk = space(host_fd),space(work)
    require(host_disk>=HOST_FLOOR and work_disk>=WORK_FLOOR and
            memory-RUNNER_MEMORY_LIMIT>=MEMORY_FLOOR,'workspace_capacity_floor')
    return {'orderedKernelMappings':True,'distinctBackings':True,'noswapRamVerified':True,
            'rootImageBytes':DISK_BYTES,'ramImageBytes':RAM_BYTES,'hostDiskBytes':host_disk,
            'hostMemoryBytes':memory,'workFreeBytes':work_disk,'restoreAuthorized':False}


def observe_split_work_root(work, host_fd, disk_fd, ram_fd):
    """Read only kernel state, while the trusted coordinator owns the mount."""
    try:
        return check_split_work_root(work,host_fd,disk_fd,ram_fd)
    except (OSError,UnicodeError,ValueError,subprocess.SubprocessError):
        raise SplitStorageRejected('split_storage_observation_unavailable') from None
