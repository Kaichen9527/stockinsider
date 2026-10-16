#!/usr/bin/env bash
set -euo pipefail
umask 077
exec 8>/run/lock/vps-heavy-operation.lock
exec 9>/run/lock/stockinsider-production-write.lock
exec 7>/run/lock/stockinsider-production-health.lock
flock -n 8 || exit 75
flock -n 9 || exit 75
flock -n 7 || exit 75
test "$(readlink -f /opt/stockinsider/current)" = /opt/stockinsider-standalone/releases/dd59817f750684b093965f539dd4de466be13077
/usr/bin/python3 -I - <<'PY'
import datetime,json,os,pathlib,stat,subprocess,hashlib
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'read-only exact parser units/socket metadata/finite journal; no connect/start/restart/permission changes'}
paths=['/run','/run/stockinsider','/run/stockinsider/candidate-financial-parser.sock','/opt/stockinsider/runtime/candidate-financial-parser/bin/python','/opt/stockinsider/runtime/candidate-financial-parser/app/candidate_financial_parser_socket.py']
result['paths']=[]
for name in paths:
 try:
  s=os.lstat(name);result['paths'].append({'path':name,'mode':oct(stat.S_IMODE(s.st_mode)),'uid':s.st_uid,'gid':s.st_gid,'socket':stat.S_ISSOCK(s.st_mode),'directory':stat.S_ISDIR(s.st_mode),'symlink':stat.S_ISLNK(s.st_mode)})
 except FileNotFoundError:result['paths'].append({'path':name,'absent':True})
for unit in ['stockinsider-financial-parser.socket','stockinsider-financial-parser.service','stockinsider-web-standalone.service','stockinsider-internal-worker.service']:
 c=subprocess.run(['systemctl','show',unit,'--no-pager','-p','ActiveState','-p','SubState','-p','Result','-p','MainPID','-p','User','-p','Group','-p','SupplementaryGroups','-p','ExecMainCode','-p','ExecMainStatus','-p','FragmentPath','-p','DropInPaths'],capture_output=True,timeout=10)
 result[unit]={'exit':c.returncode,'properties':c.stdout.decode(),'stderr':c.stderr.decode()}
c=subprocess.run(['journalctl','-u','stockinsider-financial-parser.service','-u','stockinsider-financial-parser.socket','--since','2026-10-16 16:06:00 UTC','--until','2026-10-16 16:14:00 UTC','--utc','--no-pager','-n','80','-o','short-iso'],capture_output=True,timeout=10)
result['parserJournal']={'exit':c.returncode,'stdout':c.stdout.decode(),'stderr':c.stderr.decode()}
c=subprocess.run(['ss','-xlH'],capture_output=True,timeout=10);result['matchingListeners']=[s for s in c.stdout.decode().splitlines() if '/run/stockinsider/candidate-financial-parser.sock' in s]
for account in ['stockinsider']:
 c=subprocess.run(['id',account],capture_output=True,timeout=5);result['account']=c.stdout.decode().strip()
print(json.dumps(result,ensure_ascii=False))
PY
