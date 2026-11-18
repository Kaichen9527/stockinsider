import fcntl
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile

from vnext.t17_keyfd.t18_fd_handoff import send_six_fds
from vnext.t17_keyfd.split_storage_handoff import send_split_storage, seqpacket_peer

worker_uid=65534
probe_root=Path(__file__).resolve().parent
work=Path(sys.argv[1])/'stage'
assert work.is_mount() and os.geteuid()==0
assert Path('/proc/self/ns/mnt').readlink()!=Path('/proc/1/ns/mnt').readlink()
worker_wrap="""set -eu
ip link set lo up
mount -o remount,bind,ro /
for denied in /var/lib/postgresql /run/postgresql /srv/stockinsider/pgdata /srv/stockinsider-postgres /etc/stockinsider; do
 if test -d "$denied"; then mount --bind "$1/denied" "$denied"; fi
done
exec /usr/bin/setpriv --reuid=65534 --regid=65534 --clear-groups --bounding-set=-all --no-new-privs \\
  /usr/bin/python3 -I -B "$1/code/worker.py" "$1" "$2"
"""

def call(args):
    subprocess.run(args,check=True,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)

with tempfile.TemporaryDirectory(prefix='stockinsider-t18-split-ipc.',dir='/run') as place:
    owned=Path(place)
    owned.chmod(0o711)
    code=owned/'code'
    code.mkdir(0o700)
    code.chmod(0o755)
    for file in ['worker.py','vnext/split_storage_observer.py','vnext/t17_keyfd/staging_admission.py',
                 'vnext/t17_keyfd/split_storage_handoff.py','vnext/t17_keyfd/t18_fd_handoff.py',
                 'vnext/t17_keyfd/stage_credentials.py','vnext/t17_keyfd/sealed_fixture.py']:
        target=code/file
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(probe_root/file,target)
        target.chmod(0o444)
    for folder in (code/'vnext',code/'vnext/t17_keyfd'):
        folder.chmod(0o755)
    deny=owned/'denied'
    deny.mkdir(0o700)
    deny.chmod(0)
    worker_mount=owned/'work'
    worker_mount.mkdir(0o700)
    os.chown(work,worker_uid,worker_uid)
    work.chmod(0o700)
    call(['/usr/bin/mount','--bind',str(work),str(worker_mount)])
    lock_path=owned/'synthetic.lock'
    flags=os.O_NOFOLLOW|os.O_CLOEXEC
    lock=os.open(lock_path,flags|os.O_RDWR|os.O_CREAT|os.O_EXCL,0o600)
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    descriptors=[
        os.open('/var/tmp',flags|os.O_RDONLY|os.O_DIRECTORY),
        os.open(work.parent/'root.img',flags|os.O_RDONLY),
        os.open(work.parent/'ram/ram.img',flags|os.O_RDONLY),
        os.open(lock_path,flags|os.O_RDWR),
        os.open('/dev/null',flags|os.O_RDONLY),
        *(os.open('/dev/null',flags|os.O_RDONLY) for _ in range(3)),
    ]
    host,disk,ram,alternate_lock,replacement,*placeholders=descriptors
    try:
        with socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET) as server:
            endpoint=owned/'handoff'
            server.bind(str(endpoint))
            os.chown(endpoint,0,worker_uid)
            endpoint.chmod(0o660)
            server.listen(1)
            server.settimeout(20)
            for scenario in ('valid','different_descriptors','different_lock_description','legacy'):
                unit='stockinsider-t18-split-probe-'+owned.name.rsplit('.',1)[1]+'-'+scenario.replace('_','-')
                invocation=[
                    '/usr/bin/systemd-run','--scope','--quiet','--collect','--unit='+unit,
                    '--property=MemoryMax=768M','--property=MemorySwapMax=0','--property=TasksMax=16',
                    '/usr/bin/unshare','--mount','--propagation','private','--net',
                    '/bin/bash','-c',worker_wrap,'split-probe',str(owned),scenario,
                ]
                with tempfile.TemporaryFile() as output:
                    child=subprocess.Popen(invocation,stdin=subprocess.DEVNULL,stdout=output,stderr=output)
                    try:
                        connection,_=server.accept()
                        with connection:
                            assert seqpacket_peer(connection)[1]==worker_uid
                            snapshot_lock=alternate_lock if scenario=='different_lock_description' else lock
                            snapshot_file=replacement if scenario=='different_descriptors' else disk
                            send_six_fds(connection,[*placeholders,snapshot_lock,host,snapshot_file])
                            if scenario in ('valid','different_descriptors'):
                                send_split_storage(connection,work,lock,host,disk,ram,worker_uid)
                            status=child.wait(timeout=20)
                        output.seek(0)
                        raw=output.read(8193)
                        assert len(raw)<=8192
                        if status!=0:
                            print(raw.decode('utf-8',errors='replace'),end='',flush=True)
                            raise AssertionError(scenario+' unsuccessful')
                        lines=[json.loads(line) for line in raw.splitlines() if line.startswith(b'{')]
                        assert len(lines)==1,scenario
                        print(json.dumps(lines[0]),flush=True)
                    except BaseException:
                        try: child.wait(timeout=2)
                        except subprocess.TimeoutExpired: pass
                        output.seek(0)
                        captured=output.read(8193)
                        if 0<len(captured)<=8192:
                            print(captured.decode('utf-8',errors='replace'),end='',flush=True)
                        raise
                    finally:
                        if child.poll() is None:
                            try:call(['/usr/bin/systemctl','stop',unit+'.scope'])
                            finally:child.wait(timeout=8)
    finally:
        for fd in descriptors:
            os.close(fd)
        call(['/usr/bin/umount',str(worker_mount)])
        os.close(lock)
print(json.dumps({'allSyntheticWorkersReaped':True,'authorityNoRestore':True}),flush=True)
