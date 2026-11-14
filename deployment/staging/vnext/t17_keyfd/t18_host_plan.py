"""Pure fixed argv for NEW T18 staging units; never provisions or starts them.

Host preparation, ownership, mounts, sealed code/assets and FD handoff are separate
observed responsibilities. Admission/invalid/real modes never add a free command,
path, environment value or credential to these generated argv tuples.
"""

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
                           'StandardOutput=null','StandardError=null'))
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
