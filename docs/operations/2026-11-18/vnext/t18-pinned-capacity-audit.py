"""Measure the pinned T18 capacity predicates without opening the backup or key."""
import ast
from hashlib import sha1, sha256
import json
from pathlib import Path
import os
import re
import stat
import subprocess

GIB = 1024**3
HERE = Path(__file__).resolve().parent
MANIFEST = Path('/run/stockinsider-t17-5b65286/source/database-manifest.json')
NODE = Path('/var/tmp/stockinsider-launch-institutional-ab667c9/node')
NODE_SHA256 = '1abce2374a485bddae3c27b17a3e3143e2780232026e627c4fe74ddde3f380a1'
PREVIOUS_SPLIT_RAW_BYTES = 3489660928
PREVIOUS_SPLIT_WORK_FREE_BYTES = 3339055104


def pinned_source(name, blob):
    value = (HERE/name).read_bytes()
    assert sha1(b'blob '+str(len(value)).encode()+b'\0'+value).hexdigest()==blob
    return ast.parse(value)


def function(tree, name):
    return next(part for part in tree.body if isinstance(part,ast.FunctionDef) and part.name==name)


def arithmetic(node, database=0):
    if isinstance(node,ast.Constant) and type(node.value) is int and node.value>=0:
        return node.value
    if ast.dump(node)==ast.dump(ast.parse("manifest['databaseBytes']",mode='eval').body):
        return database
    if isinstance(node,ast.BinOp):
        left=arithmetic(node.left,database)
        right=arithmetic(node.right,database)
        if isinstance(node.op,ast.Add): return left+right
        if isinstance(node.op,ast.Mult): return left*right
        if isinstance(node.op,ast.Pow) and right<=4: return left**right
    raise ValueError('pinned_capacity_expression_unrecognized')


def gate(tree, reason):
    found=[]
    for node in ast.walk(function(tree,'execute')):
        if not isinstance(node,ast.If) or len(node.body)!=1 or not isinstance(node.body[0],ast.Raise):
            continue
        if ast.dump(node.body[0].exc)!=ast.dump(ast.parse("HostRejected("+repr(reason)+")",mode='eval').body):
            continue
        condition=node.test
        assert isinstance(condition,ast.BoolOp) and isinstance(condition.op,ast.Or) and len(condition.values)==2
        thresholds={}
        for item in condition.values:
            assert isinstance(item,ast.Compare) and len(item.ops)==1 and isinstance(item.ops[0],ast.Lt)
            if ast.dump(item.left)==ast.dump(ast.parse("disk('/var/tmp')",mode='eval').body): key='disk'
            elif ast.dump(item.left)==ast.dump(ast.parse('memory()',mode='eval').body): key='memory'
            else:raise ValueError('pinned_host_measurement_unrecognized')
            assert key not in thresholds
            thresholds[key]=arithmetic(item.comparators[0])
        found.append(thresholds)
    assert len(found)==1 and set(found[0])=={'disk','memory'}
    return found[0]


def authenticated_manifest_size():
    with NODE.open('rb') as executable:
        digest=sha256()
        while block:=executable.read(1024**2):
            digest.update(block)
        assert digest.hexdigest()==NODE_SHA256
    fd=os.open(MANIFEST,os.O_CLOEXEC|os.O_NOFOLLOW|os.O_RDONLY)
    with os.fdopen(fd,'rb') as source:
        info=os.fstat(source.fileno())
        assert stat.S_ISREG(info.st_mode) and info.st_uid==0 and stat.S_IMODE(info.st_mode)==0o400 and info.st_nlink==1
        assert 0<info.st_size<1024**2
        raw=source.read(1024**2)
        after=os.fstat(source.fileno())
        assert len(raw)==info.st_size and (info.st_ctime_ns,info.st_mtime_ns,info.st_size)==(after.st_ctime_ns,after.st_mtime_ns,after.st_size)
    program="""import {createHash} from 'node:crypto';
let raw='';for await(const data of process.stdin)raw+=data;
const x=JSON.parse(raw);const bytes=String(x.manifest.databaseBytes);
if(createHash('sha256').update(JSON.stringify(x.manifest)).digest('hex')!==x.contextSha256||
  !/^[0-9]+$/.test(bytes)|| x.manifest.format!=='pg_dump_custom')process.exit(2);
process.stdout.write(bytes);
"""
    result=subprocess.run([str(NODE),'--max-old-space-size=32','--input-type=module','-e',program],input=raw,capture_output=True,
                          timeout=10,check=True,env={'PATH':'/usr/bin:/bin','LC_ALL':'C','HOME':'/nonexistent'})
    assert re.fullmatch(rb'[0-9]{1,14}',result.stdout)
    size=int(result.stdout)
    assert size>0
    return size


def main():
    db=pinned_source('stage_database_restore.py','07107b17bd172756f0bc8272347b88f86ffbdec6')
    host=pinned_source('staging_t18_host.py','9b7255df35efc4668d03d7e2cdf30f415a1266e0')
    runtime=function(db,'_authenticated_staging_backup')
    required,=(item.value for item in runtime.body if isinstance(item,ast.Assign) and any(
        isinstance(target,ast.Name) and target.id=='required' for target in item.targets))
    size=authenticated_manifest_size()
    min_work=arithmetic(required,size)
    startup=gate(host,'initial_host_capacity')
    pre_key=gate(host,'pre_key_host_reserve')
    filesystem=os.statvfs('/var/tmp')
    current_disk=filesystem.f_bavail*filesystem.f_frsize
    text=Path('/proc/meminfo').read_text()
    memory=re.search(r'^MemAvailable:\s*(\d+)\s+kB$',text,re.M)
    assert memory is not None
    current_memory=int(memory[1])*1024
    disk_budget=max(0,current_disk-pre_key['disk'])
    memory_budget=max(0,current_memory-pre_key['memory'])
    split_optimistic=disk_budget+memory_budget
    result={
        'manifestContextVerified':True,'databaseSizeBytes':size,
        'requiredWorkFreeBytes':min_work,'additionalWorkReserveBytes':min_work-size,
        'startupDiskFloorBytes':startup['disk'],'startupMemoryFloorBytes':startup['memory'],
        'preKeyDiskFloorBytes':pre_key['disk'],'preKeyMemoryFloorBytes':pre_key['memory'],
        'hostDiskAvailableBytes':current_disk,'hostMemoryAvailableBytes':current_memory,
        'directProfileStartingDiskShortfallBytes':max(0,startup['disk']-current_disk),
        'testedSplitRawBytes':PREVIOUS_SPLIT_RAW_BYTES,'testedSplitWorkFreeBytes':PREVIOUS_SPLIT_WORK_FREE_BYTES,
        'testedSplitWorkFreeShortfallBytes':max(0,min_work-PREVIOUS_SPLIT_WORK_FREE_BYTES),
        'maxCombinedSplitBytesBeforeFilesystemOverhead':split_optimistic,
        'evenOptimisticSplitShortfallBytes':max(0,min_work-split_optimistic),
        'productionChanged':False,'backupOrKeyOpened':False,
    }
    print(json.dumps(result,sort_keys=True))


if __name__=='__main__':main()
