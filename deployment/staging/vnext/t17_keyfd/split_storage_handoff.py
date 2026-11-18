"""Proposed split storage record on the existing root-authenticated IPC channel."""
import array
import fcntl
import json
import os
from pathlib import Path
import re
import socket
import stat
import struct

from ..split_storage_observer import (
    DISK_BYTES, RAM_BYTES, SECTOR, STAGE_NAME, SplitStorageRejected,
    device_dir, fs_device, kernel_text, slave_ids, observe_split_work_root,
)

MAX_PACKET = 4096
SCHEMA = 'stockinsider-t18-split-storage-v1'


class SplitHandoffRejected(Exception):
    """Use a finite error label for a failed or mismatched observation."""


def require(condition, label):
    if not condition:
        raise SplitHandoffRejected(label)


def seqpacket_peer(connection):
    require(connection.family==socket.AF_UNIX and
            connection.getsockopt(socket.SOL_SOCKET,socket.SO_TYPE)==socket.SOCK_SEQPACKET,
            'split_fixed_seqpacket_required')
    return struct.unpack('3i',connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))


def inode_identity(fd):
    info = os.fstat(fd)
    return [info.st_dev,info.st_ino]


def checked_image(fd, length):
    info = os.fstat(fd)
    require(stat.S_ISREG(info.st_mode) and info.st_uid==0 and
            stat.S_IMODE(info.st_mode)==0o600 and info.st_nlink==1 and
            fcntl.fcntl(fd,fcntl.F_GETFL)&os.O_ACCMODE==os.O_RDONLY and
            info.st_size==length and info.st_blocks*SECTOR>=length,
            'split_owner_readonly_preallocated_image_required')
    return info


def mapper_identity(device, prefix, length):
    block = device_dir(device)
    identity = [
        kernel_text(block/'dev',64),kernel_text(block/'diskseq',64),
        kernel_text(block/'dm/uuid',256),kernel_text(block/'size',64),
    ]
    require(identity[0]==device and identity[1].isdigit() and
            identity[2].startswith(prefix) and identity[3]==str(length//SECTOR) and
            kernel_text(block/'dm/suspended',64)=='0','split_mapper_identity_mismatch')
    return block,identity


def loop_identity(device):
    block = device_dir(device).resolve(strict=True)
    require(re.fullmatch(r'loop\d+',block.name) is not None and
            kernel_text(block/'dev',64)==device and
            kernel_text(block/'loop/offset',64)=='0' and
            kernel_text(block/'loop/sizelimit',64)=='0','split_whole_loop_required')
    sequence=kernel_text(block/'diskseq',64)
    require(sequence.isdigit(),'split_loop_generation_required')
    return [device,sequence,kernel_text(block/'size',64),kernel_text(block/'loop/backing_file')]


def kernel_identity(device, stage_parent):
    length = DISK_BYTES+RAM_BYTES
    crypt,crypt_data = mapper_identity(device,'CRYPT-PLAIN-',length)
    children = slave_ids(crypt)
    require(len(children)==1,'split_single_crypt_child_required')
    linear,linear_data = mapper_identity(children[0],'SI-T18-LINEAR-',length)
    children = slave_ids(linear)
    require(len(children)==2 and len(set(children))==2,'split_two_loop_children_required')
    loops = {item[3]:item for item in map(loop_identity,children)}
    root_name,ram_name = str(stage_parent/'root.img'),str(stage_parent/'ram/ram.img')
    require(set(loops)=={root_name,ram_name} and
            loops[root_name][2]==str(DISK_BYTES//SECTOR) and
            loops[ram_name][2]==str(RAM_BYTES//SECTOR),'split_backing_kernel_paths_mismatch')
    return [crypt_data,linear_data,loops[root_name],loops[ram_name]]


def stage_parent(value):
    result = Path(value)
    require(result.parent==Path('/var/tmp') and STAGE_NAME.fullmatch(result.name) is not None and
            str(result)==value,'split_fixed_stage_directory_required')
    return result


def canonical(value):
    return json.dumps(value,separators=(',',':'),sort_keys=True,ensure_ascii=True).encode()


def send_split_storage(connection, work_root, lock_fd, host_fd, disk_fd, ram_fd, worker_uid):
    """Trusted root coordinator only. Call while holding the original host lock."""
    require(os.geteuid()==0 and type(worker_uid) is int and worker_uid>0 and
            seqpacket_peer(connection)[1]==worker_uid,'split_expected_worker_peer_required')
    from .staging_admission import _observe_exclusive_lock
    _observe_exclusive_lock(lock_fd)
    connection.settimeout(15)
    work=Path(work_root)
    parent=stage_parent(str(work.parent))
    device=fs_device(work.stat())
    before=kernel_identity(device,parent)
    observe_split_work_root(work,host_fd,disk_fd,ram_fd)
    after=kernel_identity(device,parent)
    require(before==after,'split_root_mapping_changed')
    value={
        'schema':SCHEMA,'stageParent':str(parent),'kernelIdentity':after,
        'host':inode_identity(host_fd),'disk':inode_identity(disk_fd),
        'ram':inode_identity(ram_fd),'lock':inode_identity(lock_fd),
    }
    payload=canonical(value)
    require(len(payload)<=MAX_PACKET,'split_packet_bound_rejected')
    count=connection.sendmsg([payload],[(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',[ram_fd]))])
    require(count==len(payload),'split_packet_send_rejected')


def receive_and_bind_split_storage(connection, work_device, lock_fd, host_fd, disk_fd):
    """Consume one supplemental record from the authenticated root peer.

    The existing worker admission must check the lock and other isolation
    before calling this binding check. This function does not approve a restore.
    """
    require(os.geteuid()!=0 and seqpacket_peer(connection)[1]==0,'split_root_peer_required')
    connection.settimeout(15)
    owned=[]
    int_size=array.array('i').itemsize
    try:
        payload,ancillary,flags,_=connection.recvmsg(MAX_PACKET+1,socket.CMSG_SPACE(int_size),socket.MSG_CMSG_CLOEXEC)
        for level,kind,data in ancillary:
            if (level,kind)==(socket.SOL_SOCKET,socket.SCM_RIGHTS):
                integers=array.array('i')
                integers.frombytes(data[:len(data)//int_size*int_size])
                owned.extend(integers)
        require(0<len(payload)<=MAX_PACKET and not flags&(socket.MSG_CTRUNC|socket.MSG_TRUNC) and
                len(ancillary)==1 and ancillary[0][:2]==(socket.SOL_SOCKET,socket.SCM_RIGHTS) and
                len(ancillary[0][2])==int_size and len(owned)==1,
                'split_one_bound_descriptor_required')
        ram_fd=owned[0]
        require(fcntl.fcntl(ram_fd,fcntl.F_GETFD)&fcntl.FD_CLOEXEC,'split_cloexec_required')
        value=json.loads(payload)
        require(isinstance(value,dict) and canonical(value)==payload and
                set(value)=={'schema','stageParent','kernelIdentity','host','disk','ram','lock'} and
                value['schema']==SCHEMA and isinstance(value['stageParent'],str),
                'split_canonical_record_required')
        require(all(value[key]==inode_identity(fd) for key,fd in
                    {'host':host_fd,'disk':disk_fd,'ram':ram_fd,'lock':lock_fd}.items()),
                'split_record_descriptors_do_not_match')
        disk,ram=checked_image(disk_fd,DISK_BYTES),checked_image(ram_fd,RAM_BYTES)
        require(disk.st_dev==os.fstat(host_fd).st_dev and disk.st_dev!=ram.st_dev and
                work_device not in {fs_device(disk),fs_device(ram)},'split_backing_devices_do_not_match')
        require(value['kernelIdentity']==kernel_identity(work_device,stage_parent(value['stageParent'])),
                'split_kernel_identity_changed')
        return {'workStorage':'kernel_dm_crypt_split','authenticatedRootStoragePeer':True,
                'liveSplitMappingIdentityObserved':True,'backingImagePreallocationObserved':True,
                'backingImageDeviceBindingObserved':True}
    except (OSError,ValueError,SplitStorageRejected):
        raise SplitHandoffRejected('split_storage_record_unavailable') from None
    finally:
        for fd in owned:
            os.close(fd)
