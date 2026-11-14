"""Source-bound compatibility for three historical NOT VALID CHECK profiles.

INTERNAL owned-database SQL callback only; no connection, caller predicate or
readiness argument. Reference CHECKs are parsed by PG17 in temporary tables in
the SAME connection as catalog comparison and false-row counting. Actual tables,
rows, constraints and convalidated bits are never modified or validated here.
"""
import hashlib
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[4]
SOURCE_PINS=(
 ('migrations/20260906_candidate_dossier_v4.sql','dee480e983c4ccd02dd325a512ff447de55347c1'),
 ('migrations/20260907_evidence_valuation_contract_v6.sql','44da6b3d32f953dbf2050f9faef26039e933b4a9'),
 ('migrations/20260901_source_research_shadow_v2.sql','2fbc579a08efbfdfe09b16c07b4ebf2b55061c43'),
 ('migrations/20260912_02_financial_validation_status_text_hotfix.sql','0c76a94817374c19a186e539ab5f26400857e851'),
)
# Source-only public identifiers. No names/expressions are emitted in results.
PROFILES=(
 ('paid_content_v4','candidate_research_dossiers','candidate_research_dossiers_paid_content_check','content','jsonb',True,0),
 ('financial_status_v6','opportunity_financial_facts_v3','opportunity_financial_facts_v3_validation_status_check','validation_status','text',True,1),
 ('valuation_method_v6','candidate_research_run_items','candidate_research_run_items_valuation_method_check','valuation_method','text',False,1),
)
COUNTS=('matched','unvalidated','definitionMismatch','typeMismatch','columnMismatch','checked','violations')
MAX_COUNT=8*1024**3


class HistoricalCheckRejected(Exception):
    def __init__(self,diagnostic=None):
        super().__init__('historical_check_profiles_rejected')
        self.diagnostic=diagnostic


def _sources():
    captured=[]
    for path,expected in SOURCE_PINS:
        with (ROOT/path).open('rb') as f:data=f.read(65537)
        if len(data)>65536 or hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()!=expected:
            raise HistoricalCheckRejected()
        captured.append(data.decode())
    return captured


def _predicate(source,name):
    found=re.findall(r'ADD CONSTRAINT\s+'+re.escape(name)+r'\s+CHECK\s*\(\s*(.*?)\s*\)\s+NOT VALID\s*;',source,re.S)
    if len(found)!=1:raise HistoricalCheckRejected()
    return found[0]


def _script():
    sources=_sources()
    # Source explicitly establishes JSONB NOT NULL; the later hotfix proves
    # checked pg_catalog.text, not the obsolete function-body enum cast. The
    # only enum CREATE in the repository is fixture-only, not a production grant.
    if 'content JSONB NOT NULL' not in sources[2] or "columns.udt_name <> 'text'" not in sources[3]:
        raise HistoricalCheckRejected()
    predicates={p[0]:_predicate(sources[p[6]],p[2]) for p in PROFILES}
    statements=['\\set QUIET 1','BEGIN;',
       'SET LOCAL search_path=pg_catalog,pg_temp;',
       'CREATE TEMP TABLE t17_profile_result(id text PRIMARY KEY,matched bigint NOT NULL DEFAULT 0,unvalidated bigint NOT NULL DEFAULT 0,definition_mismatch bigint NOT NULL DEFAULT 0,type_mismatch bigint NOT NULL DEFAULT 0,column_mismatch bigint NOT NULL DEFAULT 0,checked bigint NOT NULL DEFAULT 0,violations bigint NOT NULL DEFAULT 0) ON COMMIT DROP;',
       'CREATE TEMP TABLE t17_profile_totals(total_unvalidated bigint NOT NULL,invalid_foreign_keys bigint NOT NULL,invalid_other bigint NOT NULL,unknown_checks bigint NOT NULL) ON COMMIT DROP;',
       "INSERT INTO t17_profile_totals SELECT count(*),count(*) FILTER(WHERE c.contype='f'),count(*) FILTER(WHERE c.contype NOT IN ('c','f')),0 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated;"]
    branches=[]
    for profile_id,table,constraint,column,data_type,notnull,_ in PROFILES:
        reference='t17_expected_'+profile_id
        predicate=predicates[profile_id]
        statements.extend((
          f"INSERT INTO t17_profile_result(id) VALUES('{profile_id}');",
          f"CREATE TEMP TABLE {reference}({column} pg_catalog.{data_type}{' NOT NULL' if notnull else ''}) ON COMMIT DROP;",
          f"ALTER TABLE {reference} ADD CONSTRAINT {reference}_check CHECK ({predicate}) NOT VALID;"))
        branches.append(f"""
        {'IF' if not branches else 'ELSIF'} item.relname='{table}' AND item.conname='{constraint}' THEN
          UPDATE t17_profile_result SET matched=matched+1,unvalidated=unvalidated+1 WHERE id='{profile_id}';
          SELECT * INTO actual_column FROM pg_attribute WHERE attrelid=item.conrelid AND attname='{column}' AND attnum>0 AND NOT attisdropped;
          SELECT * INTO expected_column FROM pg_attribute WHERE attrelid='pg_temp.{reference}'::regclass AND attname='{column}' AND attnum>0 AND NOT attisdropped;
          SELECT * INTO expected_constraint FROM pg_constraint WHERE conrelid='pg_temp.{reference}'::regclass AND conname='{reference}_check';
          type_bad:=actual_column.attnum IS NULL OR actual_column.atttypid IS DISTINCT FROM expected_column.atttypid
            OR actual_column.atttypmod IS DISTINCT FROM expected_column.atttypmod OR actual_column.attcollation IS DISTINCT FROM expected_column.attcollation;
          column_bad:=actual_column.attnum IS NULL OR item.conkey IS DISTINCT FROM ARRAY[actual_column.attnum]::smallint[]
            OR actual_column.attnotnull IS DISTINCT FROM expected_column.attnotnull OR item.connoinherit IS DISTINCT FROM expected_constraint.connoinherit;
          definition_bad:=pg_get_expr(item.conbin,item.conrelid) IS DISTINCT FROM pg_get_expr(expected_constraint.conbin,expected_constraint.conrelid);
          UPDATE t17_profile_result SET type_mismatch=type_bad::int,column_mismatch=column_bad::int,definition_mismatch=definition_bad::int WHERE id='{profile_id}';
          IF NOT type_bad AND NOT column_bad AND NOT definition_bad THEN
            SELECT count(*) INTO false_rows FROM public.{table} WHERE ({predicate}) IS FALSE;
            UPDATE t17_profile_result SET checked=1,violations=false_rows WHERE id='{profile_id}';
          END IF;
        """)
    statements.append("""DO $historical_profiles$
      DECLARE item record; actual_column pg_attribute%ROWTYPE; expected_column pg_attribute%ROWTYPE;
        expected_constraint pg_constraint%ROWTYPE; type_bad boolean; column_bad boolean; definition_bad boolean; false_rows bigint;
      BEGIN
        FOR item IN SELECT c.*,r.relname FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace LEFT JOIN pg_class r ON r.oid=c.conrelid
            WHERE n.nspname='public' AND NOT c.convalidated AND c.contype='c' LOOP
      """+'\n'.join(branches)+"""
          ELSE UPDATE t17_profile_totals SET unknown_checks=unknown_checks+1;
          END IF;
        END LOOP;
      END $historical_profiles$;""")
    statements.append("""SELECT json_build_object(
      'totalUnvalidated',total_unvalidated,'invalidForeignKeys',invalid_foreign_keys,
      'invalidOther',invalid_other,'unknownChecks',unknown_checks,
      'profiles',(SELECT json_agg(json_build_object('id',id,'matched',matched,'unvalidated',unvalidated,
        'definitionMismatch',definition_mismatch,'typeMismatch',type_mismatch,'columnMismatch',column_mismatch,
        'checked',checked,'violations',violations) ORDER BY id) FROM t17_profile_result)) FROM t17_profile_totals;
      COMMIT;""")
    return ('\n'.join(statements)+'\n').encode()


def assess_historical_check_profiles(sql):
    """Return bounded fixed-ID/integer diagnostics or fail closed with them.

    `sql` must be the engine's internal already-owned-DB callback, never a
    caller connection/receipt. It executes this entire script in ONE backend.
    """
    if not callable(sql):raise HistoricalCheckRejected()
    raw=sql(_script())
    if not isinstance(raw,(str,bytes)) or len(raw)>8192:raise HistoricalCheckRejected()
    try:result=json.loads(raw)
    except (TypeError,ValueError):raise HistoricalCheckRejected() from None
    return require_historical_check_profiles(result)


def project_historical_check_profiles(result):
    """Exact bounded fixed-label projection for both success and rejection."""
    top=('totalUnvalidated','invalidForeignKeys','invalidOther','unknownChecks')
    if not isinstance(result,dict) or set(result)!=set(top)|{'profiles'}:return None
    if any(type(result[k]) is not int or not 0<=result[k]<=MAX_COUNT for k in top):return None
    profiles=result['profiles']
    if not isinstance(profiles,list) or len(profiles)!=3:return None
    expected={p[0] for p in PROFILES}
    if any(not isinstance(p,dict) or type(p.get('id')) is not str for p in profiles):return None
    if {p['id'] for p in profiles}!=expected:return None
    for p in profiles:
        if set(p)!={'id',*COUNTS} or any(type(p[k]) is not int or not 0<=p[k]<=MAX_COUNT for k in COUNTS):return None
    return {**{k:result[k] for k in top},'profiles':[{k:p[k] for k in ('id',*COUNTS)} for p in profiles]}


def require_historical_check_profiles(result):
    result=project_historical_check_profiles(result)
    if result is None:raise HistoricalCheckRejected()
    profiles=result['profiles']
    valid=(result['totalUnvalidated']<=3 and result['invalidForeignKeys']==0
       and result['invalidOther']==0 and result['unknownChecks']==0
       and sum(p['unvalidated'] for p in profiles)==result['totalUnvalidated']
       and all(p['matched']==p['unvalidated']==p['checked'] and p['matched']<=1
           and p['definitionMismatch']==p['typeMismatch']==p['columnMismatch']==p['violations']==0 for p in profiles))
    if not valid:raise HistoricalCheckRejected(result)
    return result
