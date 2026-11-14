"""Pure fixed argv for NEW T18 staging units; never provisions or starts them.

Host preparation, ownership, mounts, sealed code/assets and FD handoff are separate
observed responsibilities. Admission/invalid/real modes never add a free command,
path, environment value or credential to these generated argv tuples.
"""
import json

BROKER_REFUSAL_SCHEMA='stockinsider-t18-broker-refusal-v1'
BROKER_REFUSAL_MAX_BYTES=512
BROKER_REFUSAL_TAGS=frozenset((
 'namespace_observation','namespace_nonroot','namespace_capabilities',
 'namespace_interfaces_invalid','namespace_interfaces_unavailable',
 'namespace_not_loopback','namespace_not_independent','production_pg_paths',
 'broker_identity','broker_group_lookup','broker_group_membership',
 'prctl_library','prctl_dumpable','prctl_no_new_privileges','db_work_inaccessible',
 'mount_observation','app_work_tmpfs','credential_tmpfs','rest_work_tmpfs',
 'cgroup_path','cgroup_memory','cgroup_swap','cgroup_tasks',
 'control_path','control_socket_create','control_socket_bind','control_socket_listen',
 'asset_verification','namespace_cookie','children_identity','tool_installation',
 'node_version','peer_accept','peer_identity','process_setup','runtime_or_cleanup',
))


def broker_refusal_bytes(role,tag):
    """Diagnostic text only, never runtime authority. No exception interpolation."""
    if role not in ('APP','REST') or type(tag) is not str or tag not in BROKER_REFUSAL_TAGS:
        raise ValueError('fixed_broker_diagnostic_rejected')
    return (json.dumps({'schema':BROKER_REFUSAL_SCHEMA,'role':role,'tag':tag},
                       sort_keys=True,separators=(',',':'))+'\n').encode('ascii')


def project_broker_refusal(data,role):
    """Export only ONE bounded exact-schema record with a compiled role/tag."""
    if type(data) is not bytes or len(data)>BROKER_REFUSAL_MAX_BYTES or role not in ('APP','REST'):
        return None
    def pairs(values):
        result={}
        for key,value in values:
            if key in result:raise ValueError()
            result[key]=value
        return result
    try:
        value=json.loads(data.decode('ascii'),object_pairs_hook=pairs)
        if (type(value) is not dict or set(value)!={'schema','role','tag'}
            or value['schema']!=BROKER_REFUSAL_SCHEMA or value['role']!=role
            or type(value['tag']) is not str or value['tag'] not in BROKER_REFUSAL_TAGS):return None
        return {'schema':BROKER_REFUSAL_SCHEMA,'role':role,'tag':value['tag']}
    except (ValueError,UnicodeError,TypeError,RecursionError):return None

SOURCE_HOST='/run/stockinsider-t18-host-source'
SOURCE_UNIT='/readonly/t18-source'
ASSETS_HOST='/var/tmp/stockinsider-t18-fa1d6c-assets'
ASSETS_UNIT='/run/t18-assets'
DB_UNIT='stockinsider-t18-db.service'
APP_UNIT='stockinsider-t18-app.service'
REST_UNIT='stockinsider-t18-rest.service'
KINDS=frozenset(('DB','APP','REST'))
MODES=frozenset(('admission','invalid','real'))
PRODUCTION_DENIALS=(
 '-/var/lib/postgresql','-/run/postgresql','-/var/run/postgresql',
 '-/srv/stockinsider/pgdata','-/srv/stockinsider-postgres','-/etc/stockinsider',
)


def _properties(kind):
    units={'DB':DB_UNIT,'APP':APP_UNIT,'REST':REST_UNIT}
    users={'DB':'si-t18-db','APP':'si-t18-app','REST':'si-t18-rest'}
    work={'DB':'/run/t18-db-work','APP':'/run/t18-app-work','REST':'/run/t18-rest-work'}
    properties=[
      'Type=exec','DynamicUser=no','User='+users[kind],'Group='+users[kind],
      'SupplementaryGroups=stockinsider-t18-ipc'+(' stockinsider-t18-dbaccess' if kind!='APP' else ''),
      'WorkingDirectory='+work[kind],
      'PrivateNetwork=yes','PrivateTmp=yes',
      'TemporaryFileSystem=/tmp:rw,size=32M,mode=1777 /var/tmp:rw,size=32M,mode=1777',
      'PrivateDevices=yes','PrivateMounts=yes',
      'MountFlags=private','ProtectSystem=strict','ProtectHome=yes','ProtectControlGroups=yes',
      'ProtectKernelTunables=yes','ProtectKernelModules=yes','ProtectKernelLogs=yes','ProtectProc=default',
      'NoNewPrivileges=yes','RestrictSUIDSGID=yes','RestrictNamespaces=yes',
      'CapabilityBoundingSet=','AmbientCapabilities=','UMask=0077',
      'MemoryMax='+{'DB':'768M','APP':'512M','REST':'256M'}[kind],
      'MemorySwapMax=0','CPUQuota='+('25%' if kind=='REST' else '50%'),'TasksMax=64',
      'RuntimeMaxSec='+('1250' if kind=='DB' else '1100'),'TimeoutStopSec=25',
      'KillMode=control-group','SendSIGKILL=yes','LimitCORE=0','LimitNOFILE=128',
    ]
    readonly=[SOURCE_HOST+':'+SOURCE_UNIT,ASSETS_HOST+':'+ASSETS_UNIT]
    if kind=='DB':
        readonly.extend(('/run/t18-broker:/run/t18-broker','/run/t18-rest:/run/t18-rest',
                         '/run/stockinsider-t18:/run/stockinsider-t18'))
        writable=('/run/t18-db-work','/run/t18-pg')
        denied=PRODUCTION_DENIALS+('/run/t18-app-work','/run/t18-rest-work',
                                  '/run/credentials/stockinsider-t18-app')
    elif kind=='APP':
        writable=('/run/t18-app-work','/run/credentials/stockinsider-t18-app','/run/t18-broker')
        denied=PRODUCTION_DENIALS+('/run/t18-db-work','/run/t18-pg','-/run/t18-rest-work')
    else:
        writable=('/run/t18-rest-work','/run/t18-rest')
        denied=PRODUCTION_DENIALS+('/run/t18-db-work','-/run/t18-app-work',
                                  '-/run/credentials/stockinsider-t18-app')
    properties.extend(('BindReadOnlyPaths='+' '.join(readonly),
                       'ReadWritePaths='+' '.join(writable),
                       'InaccessiblePaths='+' '.join(denied)))
    if kind!='DB':
        properties.extend(('Requires='+DB_UNIT,'After='+DB_UNIT,'BindsTo='+DB_UNIT,
                           'JoinsNamespaceOf='+DB_UNIT,
                           'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6',
                           'StandardError=null'))
    # Keep one property per argv element, including list values with spaces.
    return units[kind],tuple('--property='+value for value in properties)


def build_unit_argv(kind,mode):
    """Return fixed argv only; all three DB modes retain identical isolation.

    Invalid/real differ only in the root-controlled SCM_RIGHTS payload, never
    in executable arguments. Broker entrypoints are mode-independent.
    """
    if type(kind) is not str or kind not in KINDS or type(mode) is not str or mode not in MODES:
        raise ValueError('fixed_t18_unit_selector_rejected')
    unit,properties=_properties(kind)
    if kind=='DB':
        script='staging_t18_host_admission.py' if mode=='admission' else 'staging_t18_fd_bootstrap.py'
    else:
        script='staging_t18_app_broker.py' if kind=='APP' else 'staging_t18_rest_broker.py'
    return ('systemd-run','--unit='+unit,'--quiet','--wait','--pipe','--collect',
            *properties,'--','/usr/bin/python3','-I','-B',SOURCE_UNIT+'/scripts/'+script)
