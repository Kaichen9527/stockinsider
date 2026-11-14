#!/usr/bin/env python3
"""No-argument, no-key asset admission only. Does not start PG/app/broker units."""
from pathlib import Path
import json
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from deployment.staging.vnext.t17_keyfd.t18_release_assets import (
    observe_fixed_release_assets,ReleaseAssetsRejected,NODE_SHA256,POSTGREST_SHA256)


def main():
    if len(sys.argv)!=1:
        print(json.dumps({'status':'REJECTED','reason':'no_asset_preflight_arguments_allowed'}));return 2
    try:
        with observe_fixed_release_assets() as assets:
            releases=[{k:item[k] for k in ('sourceCommit','manifestSha256','bytes','fileCount','buildId','nextVersion')}
                      for item in assets.releases]
        print(json.dumps({'schema':'stockinsider-t18-assets-admission-v1','status':'ASSETS_VERIFIED_ONLY',
            'releases':releases,'nodeSha256':NODE_SHA256,'postgrestSha256':POSTGREST_SHA256,
            'keyRead':False,'databaseStarted':False,'applicationStarted':False,
            'nativeHoldRetained':True,'runtimeRestoreAdmission':False},sort_keys=True))
        return 0
    except ReleaseAssetsRejected as error:
        print(json.dumps({'schema':'stockinsider-t18-assets-admission-v1','status':'REJECTED',
            'reason':str(error),'keyRead':False,'databaseStarted':False,'applicationStarted':False,
            'nativeHoldRetained':True,'runtimeRestoreAdmission':False},sort_keys=True));return 2
    except BaseException:
        print(json.dumps({'schema':'stockinsider-t18-assets-admission-v1','status':'REJECTED',
            'reason':'fixed_assets_unavailable','keyRead':False,'databaseStarted':False,
            'applicationStarted':False,'nativeHoldRetained':True,'runtimeRestoreAdmission':False},sort_keys=True));return 2


if __name__=='__main__':raise SystemExit(main())
