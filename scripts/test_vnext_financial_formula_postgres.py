#!/usr/bin/env python3
"""Run with PostgreSQL 17 installed as an unprivileged user in staging."""
from copy import deepcopy
from hashlib import sha256
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / 'migrations'
PG = Path(os.environ.get('STOCKINSIDER_TEST_PG_BIN', '/usr/lib/postgresql/17/bin'))
DAY = '2026-09-30'
CUTOFF = '2026-10-21T13:30:00Z'
INPUT = 'a' * 64
JOB = '11111111-1111-1111-1111-111111111111'
ACTOR = 'stockinsider_vnext_owner'
MIGRATION = '20261118_52_vnext_financial_formula_interval_v1.sql'


def section(source, start, end):
    assert source.count(start) == source.count(end) == 1
    return source[source.index(start):source.index(end)]


def literal(value):
    return "'" + json.dumps(value, separators=(',', ':')).replace("'", "''") + "'::jsonb"


def financial(identifier, amount, metric, start='2026-07-01', **changes):
    digest = sha256(identifier.encode()).hexdigest()
    meta = dict(schemaVersion='vnext-financial-observation-v1', factId=identifier,
                factContentHash=digest, periodStart=start, periodEnd=DAY, periodType='duration',
                storedDurationKind='quarterly', estimateKind='reported', estimateHorizon='reported_period',
                filingRevisionId='same-filing', sourceReceiptHash='c' * 64, sourceRawSha256='d' * 64,
                knownAt='2026-10-21T12:00:01Z', epsBasis=None, shareBasis=None,
                denominatorShares=None, restatementBasis=None, corporateActionRevision=None, reportingFrequency=None)
    meta.update(changes)
    return dict(id=identifier, key=metric, kind='fact', sourceTier='official', value=amount,
                unit='TWD', period=DAY, contentHash=digest, availableAt='2026-10-21T12:00:02Z', financial=meta)


def artifact():
    claim = dict(id='margin', text='Synthetic margin calculation.', kind='derived', evidenceIds=['profit', 'revenue'],
                 numeric=dict(key='gross_margin', value=0.5, unit='ratio', period=DAY,
                              formula=dict(operation='divide', evidenceIds=['profit', 'revenue'])))
    return dict(inputHash=INPUT, claims=[claim], sections={'cashflows': {'claimIds': ['margin']}})


class NativeFinancialFormulaTests(unittest.TestCase):
    @classmethod
    def command(cls, name, *arguments, sql=None, check=True):
        return subprocess.run([str(PG / name), *arguments], input=sql, text=True,
                              capture_output=True, timeout=55, check=check)

    @classmethod
    def psql(cls, sql, check=True):
        return cls.command('psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-h', str(cls.socket),
                           '-U', 'postgres', '-d', 'postgres', sql=sql, check=check)

    @classmethod
    def setUpClass(cls):
        if os.geteuid() == 0 or not cls.command('initdb', '--version').stdout.split()[-1].startswith('17.'):
            raise RuntimeError('Dedicated PostgreSQL 17 staging account required')
        temp = tempfile.TemporaryDirectory(prefix='si-formula-pg-')
        cls.addClassCleanup(temp.cleanup)
        home = Path(temp.name)
        cls.socket = home / 'socket'
        cls.socket.mkdir(mode=0o700)
        data = home / 'data'
        cls.command('initdb', '-D', str(data), '-U', 'postgres', '-A', 'trust',
                    '--no-locale', '--encoding=UTF8', '--no-sync')
        cls.command('pg_ctl', '-w', '-D', str(data), '-l', str(home / 'pg.log'), '-o',
                    f'-c listen_addresses= -k {cls.socket} -c unix_socket_permissions=0700', 'start')
        cls.addClassCleanup(cls.command, 'pg_ctl', '-w', '-D', str(data), '-m', 'fast', 'stop')
        base = (MIGRATIONS / '20261022_stockinsider_vnext_20_v1.sql').read_text()
        provider = (MIGRATIONS / '20261116_24_vnext_financial_provider_work_context_v1.sql').read_text()
        # Original table and arithmetic definitions. No production row or provider model.
        tables = section(base, 'CREATE TABLE public.vnext_sessions_v1', 'CREATE TABLE public.vnext_publications_v1')
        binding = section(provider, 'CREATE TABLE public.vnext_financial_preparation_protocols_v1',
                          'CREATE TRIGGER vnext_writer_fence BEFORE INSERT')
        clock = section(provider, 'CREATE FUNCTION public.vnext_financial_wire_clock_v1',
                        '-- Narrow bounded owner-held read')
        core = section(base, 'CREATE FUNCTION public.vnext_validate_claims_v1', 'CREATE FUNCTION public.vnext_command_v1')
        cls.psql(f"""CREATE ROLE {ACTOR} NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
{tables}
ALTER TABLE public.vnext_jobs_v1 OWNER TO {ACTOR};
ALTER TABLE public.vnext_jobs_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_jobs_v1 FROM PUBLIC,anon,authenticated,service_role;
{binding}
{clock}
ALTER FUNCTION public.vnext_financial_wire_clock_v1(text) OWNER TO {ACTOR};
{core}
INSERT INTO public.vnext_sessions_v1 VALUES ('2026-10-21','2026-10-21T05:30:00Z',true);
INSERT INTO public.vnext_members_v1(symbol,state,input_hash,evidence,admitted_session)
 VALUES ('2330','researching','{INPUT}','{{}}','2026-10-21');
INSERT INTO public.vnext_jobs_v1(job_id,request_key,symbol,input_hash,admission_hash,state,session_date)
 VALUES ('{JOB}','synthetic-formula','2330','{INPUT}','{INPUT}','running','2026-10-21');
INSERT INTO public.vnext_preparations_v1(job_id,admission_hash,input_hash,evidence)
 VALUES ('{JOB}','{INPUT}','{INPUT}','{{}}');""")
        cls.candidate = (MIGRATIONS / MIGRATION).read_text()

    def test_real_author_update_checks_bound_financial_periods(self):
        match = [financial('profit', 50, 'quarterly_gross_profit'), financial('revenue', 100, 'quarterly_revenue')]
        mismatched = [match[0], financial('revenue', 100, 'quarterly_revenue', start='2026-01-01')]
        update = f"""SET ROLE {ACTOR};
UPDATE public.vnext_jobs_v1 SET state='authored',author_result={literal(artifact())} WHERE job_id='{JOB}';"""
        self.seed(mismatched)
        # Red control: the original numerical validator accepts equal end dates.
        self.psql(f"SELECT public.vnext_validate_claims_v1({literal(artifact())},{literal(mismatched)});")
        self.psql(update)
        self.assertEqual(self.result(), 'authored:true')
        self.psql(self.candidate)

        def scoped(entry, key, val):
            item = deepcopy(entry)
            item['financial'][key] = val
            return item

        no_metadata = {k: v for k, v in match[1].items() if k != 'financial'}
        eps = [{**row, 'unit': 'TWD_per_share', 'key': 'quarterly_basic_eps',
                'financial': {**row['financial'], 'epsBasis': 'basic', 'denominatorShares': 1000}} for row in match]
        scalar = {**no_metadata, 'key': 'pe_multiple', 'unit': 'multiple'}
        # These measure the new comparison trigger only. Existing unit math is unchanged.
        cases = {
            'different duration with same end': (mismatched, False),
            'different filing revision': ([match[0], scoped(match[1], 'filingRevisionId', 'other-filing')], False),
            'missing metadata': ([match[0], no_metadata], False),
            'unproved EPS denominator': (eps, False),
            'late source clock': ([match[0], scoped(match[1], 'knownAt', '2026-10-21T12:00:02.000001Z')], False),
            'mismatched fact identity': ([match[0], scoped(match[1], 'factId', 'different-fact')], False),
            'same interval and filing': (match, True),
            'no filing revision and same original document': ([scoped(x, 'filingRevisionId', None) for x in match], True),
            'one quantity and a scalar': ([match[0], scalar], True),
            'pre-protocol historical job': (None, True),
        }
        for label, (evidence, accepted) in cases.items():
            with self.subTest(case=label):
                self.seed(evidence)
                attempt = self.psql(update, check=False)
                self.assertEqual(attempt.returncode == 0, accepted, attempt.stderr)
                if not accepted:
                    self.assertIn('vnext_financial_formula_period_or_basis_unavailable', attempt.stderr)
                self.assertEqual(self.result(), 'authored:true' if accepted else 'running:false')
        self.seed(match)
        tampered = artifact()
        tampered['inputHash'] = 'b' * 64
        result = self.psql(f"SET ROLE {ACTOR}; UPDATE public.vnext_jobs_v1 SET author_result={literal(tampered)};", check=False)
        self.assertIn('vnext_financial_formula_binding_invalid', result.stderr)
        self.assertEqual(self.result(), 'running:false')
        strangers = self.psql("""
SELECT role, has_function_privilege(role,'public.vnext_financial_formula_window_internal_v1(jsonb,timestamptz)','EXECUTE'),
 has_function_privilege(role,'public.vnext_financial_formula_on_author_v1()','EXECUTE'),has_table_privilege(role,'public.vnext_jobs_v1','UPDATE')
FROM unnest(ARRAY['anon','authenticated','service_role']) role ORDER BY role;""")
        self.assertEqual(strangers.stdout.strip().splitlines(),
                         ['anon|f|f|f', 'authenticated|f|f|f', 'service_role|f|f|f'])

    def result(self):
        return self.psql("SELECT state||':'||(author_result IS NOT NULL)::text FROM public.vnext_jobs_v1;").stdout.strip()

    def seed(self, evidence):
        self.psql("UPDATE public.vnext_jobs_v1 SET state='running',author_result=NULL;"
                  "DELETE FROM public.vnext_financial_preparation_protocols_v1;")
        if evidence is not None:
            packet = literal({'cutoff': CUTOFF, 'evidence': evidence})
            self.psql(f"""INSERT INTO public.vnext_financial_preparation_protocols_v1(job_id,input_hash,protocol,frozen_packet,packet_digest)
 VALUES ('{JOB}','{INPUT}','vnext-financial-provider-input-v1',{packet},'synthetic');""")


if __name__ == '__main__':
    unittest.main()
