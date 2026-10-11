#!/usr/bin/env python3
"""Single disposable full-file prerequisite probe; never a production installer.

Reads only two exact tracked bootstrap/schema files. No table/function stubs,
fixture extraction, product changes, network, application rows or credentials.
The first SQL failure stops progression; later migrations are not attempted.
"""
import datetime
import hashlib
import json
import os
import pathlib
import pwd
import shutil
import subprocess
import sys
import time

SOURCE = 'bc01c006cba307735ccd50c78841b94242e1c014'
PG = pathlib.Path('/workspace/cloud-acceptance-0faebfd/tools/root/usr/lib/postgresql/17/bin')
ROOT = pathlib.Path(__file__).resolve().parent.parent
ART = pathlib.Path(sys.argv[1]).resolve()
assert ART.is_dir() and ART.stat().st_uid == os.geteuid()
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip() == SOURCE
os.umask(0o077)
ENV = os.environ.copy()
ENV['USER'] = pwd.getpwuid(os.geteuid()).pw_name
BEGIN = time.monotonic()
STEPS = []
ACTIVE = False
CLUSTER = ART / 'disposable-pg'
PORT = 55432

def command(label, executable, args, timeout=15):
    if time.monotonic() - BEGIN > 90:
        raise TimeoutError('probe shared 90-second bound exhausted')
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with (ART / (label + '.stdout')).open('wb') as out, (ART / (label + '.stderr')).open('wb') as err:
        child = subprocess.run([str(executable), *args], cwd=ROOT, env=ENV,
                               stdout=out, stderr=err, timeout=timeout)
    step = {'label': label, 'command': [str(executable), *args], 'exitCode': child.returncode,
            'startedAt': started, 'endedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    STEPS.append(step)
    return child.returncode

try:
    for name in ['initdb', 'pg_ctl', 'psql']:
        assert (PG / name).is_file() and os.access(PG / name, os.X_OK)
    assert command('initdb', PG / 'initdb', ['-D', str(CLUSTER), '-A', 'trust', '--no-locale', '--encoding=UTF8', '-U', ENV['USER'], '--no-instructions']) == 0
    assert command('start', PG / 'pg_ctl', ['-D', str(CLUSTER), '-l', str(ART / 'postgres.log'), '-o', f"-h '' -k {ART} -p {PORT}", '-w', 'start']) == 0
    ACTIVE = True
    arguments = ['-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', str(ART), '-p', str(PORT), '-U', ENV['USER'], '-d', 'postgres']
    assert command('original-bootstrap', PG / 'psql', [*arguments, '--single-transaction', '-f', str(ROOT / 'deployment/vps/bootstrap-stockinsider-postgres.sql')]) == 0
    result = command('original-full-schema', PG / 'psql', [*arguments, '--single-transaction', '-f', str(ROOT / 'supabase_schema.sql')])
    command('readonly-catalog-after-schema', PG / 'psql', [*arguments, '-At', '-c', "SELECT jsonb_build_object('authSchema',to_regnamespace('auth'),'authUsers',to_regclass('auth.users'),'publicStocks',to_regclass('public.stocks'),'pgcryptoSchema',(SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto'));" ])
    report = {'sourceHead': SOURCE, 'probeScope': 'Original bootstrap plus original complete schema only; stop at first error',
              'schemaExitCode': result, 'completeChainAttempted': False, 'syntheticPrerequisitesCreated': False,
              'modifiedSourceSQL': False, 'production': False, 'clusterUser': ENV['USER'],
              'bootstrapIsTrackedCompatibilityFileNotProductionSchemaDump': True,
              'schemaTransactionRolledBackOnFailure': result != 0,
              'elapsedSeconds': time.monotonic() - BEGIN}
    (ART / 'probe-result.json').write_text(json.dumps(report, indent=2) + '\n')
finally:
    if ACTIVE:
        code = command('stop', PG / 'pg_ctl', ['-D', str(CLUSTER), '-m', 'immediate', '-w', 'stop'])
        assert code == 0
        ACTIVE = False
        shutil.rmtree(CLUSTER)
    (ART / 'probe-steps.json').write_text(json.dumps(STEPS, indent=2) + '\n')
# Preserve the SQL RED in command exit status; it is not a passing install.
sys.exit(result)
