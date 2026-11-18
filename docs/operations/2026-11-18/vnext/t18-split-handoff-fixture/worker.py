import fcntl
import json
import os
from pathlib import Path
import socket
import stat
import sys

sys.path.insert(0,str(Path(__file__).resolve().parent))
from vnext.t17_keyfd import staging_admission
from vnext.t17_keyfd.t18_fd_handoff import install_fixed_fds, install_stage_and_channel, receive_six_fds
from vnext.t17_keyfd.split_storage_handoff import seqpacket_peer

root = Path(sys.argv[1])
scenario = sys.argv[2]
endpoint = root/'handoff'
parent_info = root.stat()
socket_info = endpoint.lstat()
assert parent_info.st_uid==0 and stat.S_IMODE(parent_info.st_mode)==0o711
assert stat.S_ISSOCK(socket_info.st_mode) and socket_info.st_uid==0 and socket_info.st_gid==65534
assert stat.S_IMODE(socket_info.st_mode)==0o660
with socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET) as client:
    client.settimeout(15)
    client.connect(str(endpoint))
    assert seqpacket_peer(client)[1]==0
    originals=receive_six_fds(client)
    channel=fcntl.fcntl(client.fileno(),fcntl.F_DUPFD_CLOEXEC,90)
install_fixed_fds(originals)
with open('/dev/null','rb') as marker:
    stage_placeholder=fcntl.fcntl(marker.fileno(),fcntl.F_DUPFD_CLOEXEC,30)
install_stage_and_channel(stage_placeholder,channel)
expected={
    'different_descriptors':'split_record_descriptors_do_not_match',
    'different_lock_description':'exclusive_host_lock_unavailable',
    'legacy':'work_filesystem_image_size_rejected',
}
try:
    if scenario=='legacy':
        result=staging_admission.observe_staging(root/'work')
    else:
        result=staging_admission.observe_staging_split(root/'work')
    assert scenario=='valid','unexpected admission'
    assert result['workStorage']=='kernel_dm_crypt_split'
    assert result['authenticatedRootStoragePeer'] and result['liveSplitMappingIdentityObserved']
    assert result['nonroot'] and result['effectiveCapabilities']==0 and result['privateLoopbackNetwork']
    assert result['memoryLimitBytes']==805306368 and result['swapLimitBytes']==0
    assert result['strictPrivateWorkMount'] and result['exclusiveHostLockObserved'] and result['productionPgPathsInaccessible']
    print(json.dumps({'syntheticWorkerObservation':result,'backupRead':False,'restoreStarted':False}),flush=True)
except staging_admission.StagingAdmissionRejected as error:
    assert str(error)==expected.get(scenario),'unexpected '+str(error)
    print(json.dumps({'scenario':scenario,'rejected':str(error)}),flush=True)
finally:
    for fd in (3,4,5,7,8,9,10,6):
        os.close(fd)
