#!/usr/bin/env python3
"""No-argument/no-key THREE-unit prerequisites only; no PG/configuration RPC."""
from pathlib import Path
import json
import os
import pwd
import signal
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from deployment.staging.vnext.t17_keyfd.stage_database_restore import protect_key_process
from deployment.staging.vnext.t17_keyfd.stage_next_rollback import _wait_fixed_broker_sockets
from deployment.staging.vnext.t17_keyfd.staging_admission import _namespace_and_privileges,_production_pg_inaccessible
from deployment.staging.vnext.t17_keyfd.t18_release_assets import observe_fixed_release_assets
from deployment.staging.vnext.t17_keyfd.t18_broker_transport import connect_fixed_app_broker,connect_fixed_rest_broker
from deployment.staging.vnext.t17_keyfd.t18_runtime_observation import observe_three_uid_budget


def main():
    def stop(*_):
        signal.alarm(0)
        for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGALRM):signal.signal(sig,signal.SIG_IGN)
        raise TimeoutError()
    for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGALRM):signal.signal(sig,stop)
    signal.alarm(90)
    try:
        if len(sys.argv)!=1 or pwd.getpwuid(os.getuid()).pw_name!='si-t18-db':raise RuntimeError()
        protect_key_process();_namespace_and_privileges();_production_pg_inaccessible()
        _wait_fixed_broker_sockets()
        with observe_fixed_release_assets() as assets:
            with connect_fixed_app_broker() as app,connect_fixed_rest_broker() as rest:
                try:budget=observe_three_uid_budget(app,rest)
                finally:
                    error=False
                    for broker in (app,rest):
                        try:broker.request('SHUTDOWN')
                        except Exception:error=True
                    if error:raise RuntimeError()
            bindings=[{k:v[k] for k in ('sourceCommit','manifestSha256','fileCount','buildId','nextVersion')} for v in assets.releases]
        print(json.dumps({'schema':'stockinsider-t18-host-admission-v1','status':'HOST_PREREQUISITES_VERIFIED_ONLY',
            'threeUidBudget':budget,'fixedReleases':bindings,'namespaceKernelCookiesMatched':True,
            'keyRead':False,'databaseStarted':False,'applicationStarted':False,
            'encryptedWorkAdmission':'NOT_RUN','runtimeRestoreAdmission':False,'nativeHoldRetained':True},sort_keys=True))
        return 0
    except BaseException:
        print(json.dumps({'schema':'stockinsider-t18-host-admission-v1','status':'REJECTED',
            'reason':'fixed_host_prerequisites_not_verified','keyRead':False,'databaseStarted':False,
            'applicationStarted':False,'runtimeRestoreAdmission':False,'nativeHoldRetained':True},sort_keys=True));return 2
    finally:signal.alarm(0)


if __name__=='__main__':raise SystemExit(main())
