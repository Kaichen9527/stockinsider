"""Read-only public catalog counts; no identifiers/definitions/rows in output.

This observes NOT VALID state, not row violations. It never validates, repairs
or grants compatibility; the separate source-bound evaluator checks rows.
"""
PHASE = 'post_restore_constraint_observation'
CONTYPES = ('c','f','p','u','t','x','other')
MAX_COUNT = 8 * 1024**3

# All SQL/identifiers are source constants, not parameters or a catalog name
# projected into output. Unknown contypes collapse into the fixed other bucket.
CONSTRAINT_COUNTS_SQL = b"""
WITH public_constraints AS (
  SELECT c.contype::text AS kind,c.convalidated,c.conname,r.relname
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace
  LEFT JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
  WHERE n.nspname='public'
), bucketed AS (
  SELECT CASE WHEN kind IN ('c','f','p','u','t','x') THEN kind ELSE 'other' END AS bucket,
         convalidated FROM public_constraints
), fixed(bucket) AS (VALUES ('c'),('f'),('p'),('u'),('t'),('x'),('other'))
SELECT json_build_object(
 'phase','post_restore_constraint_observation',
 'invalidConstraints',(SELECT count(*) FROM public_constraints WHERE NOT convalidated),
 'foreignKeys',(SELECT count(*) FROM public_constraints WHERE kind='f'),
 'byContype',(SELECT json_object_agg(f.bucket,json_build_object(
    'total',(SELECT count(*) FROM bucketed b WHERE b.bucket=f.bucket),
    'unvalidated',(SELECT count(*) FROM bucketed b WHERE b.bucket=f.bucket AND NOT b.convalidated))) FROM fixed f),
 'knownLegacyPaidContentCheck',json_build_object(
    'matches',(SELECT count(*) FROM public_constraints WHERE kind='c'
      AND relname='candidate_research_dossiers' AND conname='candidate_research_dossiers_paid_content_check'),
    'unvalidated',(SELECT count(*) FROM public_constraints WHERE kind='c' AND NOT convalidated
      AND relname='candidate_research_dossiers' AND conname='candidate_research_dossiers_paid_content_check')))
"""


def project_constraint_diagnostics(value):
    """Exact bounded projection or None. Bad payload never becomes raw stdout."""
    if type(value) is not dict or set(value) != {
        'phase','invalidConstraints','foreignKeys','byContype','knownLegacyPaidContentCheck'}:
        return None
    if value['phase'] != PHASE:
        return None
    def count(number):
        return type(number) is int and 0 <= number <= MAX_COUNT
    if not count(value['invalidConstraints']) or not count(value['foreignKeys']):
        return None
    buckets=value['byContype']
    if type(buckets) is not dict or set(buckets)!=set(CONTYPES):
        return None
    result={}
    for kind in CONTYPES:
        row=buckets[kind]
        if (type(row) is not dict or set(row)!={'total','unvalidated'}
                or not count(row['total']) or not count(row['unvalidated'])
                or row['unvalidated']>row['total']):
            return None
        result[kind]={'total':row['total'],'unvalidated':row['unvalidated']}
    known=value['knownLegacyPaidContentCheck']
    if (type(known) is not dict or set(known)!={'matches','unvalidated'}
            or not count(known['matches']) or not count(known['unvalidated'])
            or known['unvalidated']>known['matches'] or known['matches']>1
            or known['matches']>result['c']['total']
            or known['unvalidated']>result['c']['unvalidated']):
        return None
    if (sum(row['unvalidated'] for row in result.values())!=value['invalidConstraints']
            or result['f']['total']!=value['foreignKeys']):
        return None
    return {'phase':PHASE,'invalidConstraints':value['invalidConstraints'],
            'foreignKeys':value['foreignKeys'],'byContype':result,
            'knownLegacyPaidContentCheck':{'matches':known['matches'],'unvalidated':known['unvalidated']}}


def diagnostic_after_cleanup(error):
    """A second boundary check: only exact diagnostics + successful owned cleanup."""
    projected=project_constraint_diagnostics(getattr(error,'constraint_diagnostics',None))
    cleanup=getattr(error,'diagnostic_cleanup',None)
    if (projected is None or type(cleanup) is not dict
            or set(cleanup)!={'postmasterReaped','socketRemoved','privateTreeRemoved'}
            or any(type(v) is not bool or not v for v in cleanup.values())):
        return None
    from .historical_check_profiles import project_historical_check_profiles
    historical=project_historical_check_profiles(getattr(error,'historical_check_compatibility',None))
    output={**projected,'cleanup':{k:True for k in ('postmasterReaped','socketRemoved','privateTreeRemoved')}}
    if historical is not None:output['historicalCheckCompatibility']=historical
    return output
