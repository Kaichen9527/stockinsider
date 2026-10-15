import os,json,pathlib,datetime,platform
root=pathlib.Path('/opt/stockinsider-standalone/releases')
mem=dict((x.split(':',1)[0],x.split(':',1)[1].strip())for x in pathlib.Path('/proc/meminfo').read_text().splitlines())
print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'current':os.path.realpath('/opt/stockinsider/current'),'previous':os.path.realpath('/opt/stockinsider/previous') if os.path.lexists('/opt/stockinsider/previous') else None,'newTargetExists':os.path.lexists(root/'dd59817f750684b093965f539dd4de466be13077'),'memoryAvailableBytes':int(mem['MemAvailable'].split()[0])*1024,'requiredMemoryBytes':2684354560,'python':platform.python_version(),'kernel':platform.system(),'readOnly':True}))
