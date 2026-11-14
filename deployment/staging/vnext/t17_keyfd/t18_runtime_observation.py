"""Actual three-UID/cgroup capacity; no caller readiness receipts."""
import os
from pathlib import Path
import re
import time


class ThreeUidBudgetRejected(Exception):
    def __init__(self):super().__init__('three_uid_memory_budget_rejected')


def _cgroup_budget(pid):
    lines=(Path('/proc')/str(pid)/'cgroup').read_text().splitlines()
    matched=[row[3:] for row in lines if row.startswith('0::')]
    if len(matched)!=1 or not matched[0].startswith('/') or '..' in Path(matched[0]).parts:raise ThreeUidBudgetRejected()
    root=Path('/sys/fs/cgroup')/matched[0].lstrip('/')
    memory=(root/'memory.max').read_text().strip()
    if not memory.isdecimal() or int(memory)<=0 or (root/'memory.swap.max').read_text().strip()!='0':raise ThreeUidBudgetRejected()
    for name in ('memory.max','memory.swap.max','pids.max','cpu.max'):
        info=(root/name).stat()
        if info.st_uid!=0 or info.st_mode&0o022:raise ThreeUidBudgetRejected()
    pids=(root/'pids.max').read_text().strip()
    cpu=(root/'cpu.max').read_text().split()
    if (not pids.isdecimal() or not 1<=int(pids)<=64 or len(cpu)!=2
        or not all(v.isdecimal() for v in cpu) or min(map(int,cpu))<=0):raise ThreeUidBudgetRejected()
    return matched[0],int(memory)


def observe_three_uid_budget(app,rest):
    # Private handles came only from sealed SO_PEERCRED/cookie/group observation.
    # A Python object or this result itself grants no runtime execution ability.
    if len({os.getuid(),app.uid,rest.uid})!=3 or min(app.uid,rest.uid)<=0:raise ThreeUidBudgetRejected()
    try:
        db_path,db=_cgroup_budget(os.getpid());app_path,app_max=_cgroup_budget(app.pid);rest_path,rest_max=_cgroup_budget(rest.pid)
        if len({db_path,app_path,rest_path})!=3 or db>768*1024**2 or app_max>512*1024**2 or rest_max>512*1024**2:raise ThreeUidBudgetRejected()
        for cg,ratio in ((db_path,.5),(app_path,.5),(rest_path,.25)):
            quota,period=map(int,(Path('/sys/fs/cgroup')/cg.lstrip('/')/'cpu.max').read_text().split())
            if quota/period>ratio:raise ThreeUidBudgetRejected()
        match=re.search(r'^MemAvailable:\s+(\d+) kB$',Path('/proc/meminfo').read_text(),re.M)
        if match is None:raise ThreeUidBudgetRejected()
        available=int(match[1])*1024
        if available-db-app_max-rest_max<1536*1024**2:raise ThreeUidBudgetRejected()
        return {'databaseMemoryLimitBytes':db,'appMemoryLimitBytes':app_max,'restMemoryLimitBytes':rest_max,
            'hostAvailableMemoryBytes':available,'reservedHostMemoryBytes':1536*1024**2,
            'swapLimitBytes':0,'distinctBoundedCgroupsObserved':True}
    except (OSError,ValueError):raise ThreeUidBudgetRejected() from None


def require_controller_only_cgroup():
    """New T18 dedicated DB cgroup must contain only its controller at cleanup."""
    path,_=_cgroup_budget(os.getpid())
    root=Path('/sys/fs/cgroup')/path.lstrip('/')
    for _ in range(20):
        members=(root/'cgroup.procs').read_text().split()
        if all(int(pid)==os.getpid() for pid in members):return
        time.sleep(.05)
    raise ThreeUidBudgetRejected()
