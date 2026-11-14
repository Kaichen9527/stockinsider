"""Fixed read-only restored-radar observation, not web/app acceptance.

Only the engine's internal owned-clone SQL callback is accepted. One backend,
repeatable-read READ ONLY transaction, fixed schema and count/date queries.
No payload_json/etag/id/terminal_reason values, caller SQL, publication or inserts.
"""
import datetime
import json

MAX_COUNT=8*1024**3
COUNTS=('requiredColumns','matchingColumns','missingColumns','typeMismatchColumns',
        'matchingTables','homeValidSnapshots','dailyValidSnapshots','staleSnapshots26h','missingContentDates')
STATUSES=('GAP_SCHEMA','GAP_NO_PUBLISHED_SNAPSHOT','OBSERVED_PUBLISHED_SNAPSHOT')

READER_OBSERVATION_SQL=br"""
\set QUIET 1
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL timezone='UTC';
DO $fixed_radar_reader$
DECLARE matching_columns bigint; missing_columns bigint; mismatched_columns bigint;
  matching_tables bigint; result jsonb; row_counts jsonb;
BEGIN
  IF current_setting('transaction_read_only')<>'on'
    OR current_setting('transaction_isolation')<>'repeatable read'
  THEN RAISE EXCEPTION 'radar_reader_readonly_required'; END IF;
  WITH expected(table_name,column_name,type_oid) AS (VALUES
   ('radar_public_snapshots','id','pg_catalog.uuid'::regtype::oid),
   ('radar_public_snapshots','etag','pg_catalog.text'::regtype::oid),
   ('radar_public_snapshots','content_as_of','pg_catalog.timestamptz'::regtype::oid),
   ('radar_public_snapshots','published_at','pg_catalog.timestamptz'::regtype::oid),
   ('radar_public_snapshots','payload_json','pg_catalog.jsonb'::regtype::oid),
   ('radar_public_snapshots','window_key','pg_catalog.text'::regtype::oid),
   ('radar_public_snapshots','status','pg_catalog.text'::regtype::oid),
   ('radar_publication_state','window_key','pg_catalog.text'::regtype::oid),
   ('radar_publication_state','status','pg_catalog.text'::regtype::oid),
   ('radar_publication_state','last_attempt_at','pg_catalog.timestamptz'::regtype::oid),
   ('radar_publication_state','terminal_reason','pg_catalog.text'::regtype::oid)
  ), observed AS (
   SELECT e.*,c.oid AS relation_oid,c.relkind,a.attnum,a.atttypid,a.atttypmod
   FROM expected e LEFT JOIN pg_namespace n ON n.nspname='public'
    LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.table_name
    LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=e.column_name AND a.attnum>0 AND NOT a.attisdropped
  )
  SELECT count(*) FILTER(WHERE relkind IN ('r','p') AND attnum IS NOT NULL AND atttypid=type_oid AND atttypmod=-1),
    count(*) FILTER(WHERE attnum IS NULL),
    count(*) FILTER(WHERE attnum IS NOT NULL AND (relkind NOT IN ('r','p') OR atttypid<>type_oid OR atttypmod<>-1)),
    count(DISTINCT relation_oid) FILTER(WHERE relkind IN ('r','p'))
  INTO matching_columns,missing_columns,mismatched_columns,matching_tables FROM observed;
  result:=jsonb_build_object('status','GAP_SCHEMA','rowObservation','NOT_RUN_SCHEMA_GAP',
    'requiredColumns',11,'matchingColumns',matching_columns,'missingColumns',missing_columns,
    'typeMismatchColumns',mismatched_columns,'matchingTables',matching_tables,
    'homeValidSnapshots',0,'dailyValidSnapshots',0,'staleSnapshots26h',0,'missingContentDates',0,
    'oldestContentDate',NULL,'newestContentDate',NULL,'readOnly',true,'appAcceptance',false);
  IF matching_columns=11 AND matching_tables=2 AND missing_columns=0 AND mismatched_columns=0 THEN
    -- Dynamic execution only avoids resolving absent relations in GAP_SCHEMA.
    -- The SQL itself is fixed: no caller identifiers/conditions or payloads.
    EXECUTE $count_fixed_public_snapshots$
      SELECT jsonb_build_object(
       'homeValidSnapshots',count(*) FILTER(WHERE window_key='home'),
       'dailyValidSnapshots',count(*) FILTER(WHERE window_key='daily'),
       'staleSnapshots26h',count(*) FILTER(WHERE content_as_of < transaction_timestamp()-interval '26 hours'),
       'missingContentDates',count(*) FILTER(WHERE content_as_of IS NULL),
       'oldestContentDate',to_char(min(content_as_of) AT TIME ZONE 'UTC','YYYY-MM-DD'),
       'newestContentDate',to_char(max(content_as_of) AT TIME ZONE 'UTC','YYYY-MM-DD'))
      FROM public.radar_public_snapshots WHERE status='valid' AND window_key IN ('home','daily')
    $count_fixed_public_snapshots$ INTO row_counts;
    result:=result||row_counts||jsonb_build_object('rowObservation','COUNTS_AND_DATES_ONLY',
       'status',CASE WHEN (row_counts->>'homeValidSnapshots')::bigint+(row_counts->>'dailyValidSnapshots')::bigint>0
          THEN 'OBSERVED_PUBLISHED_SNAPSHOT' ELSE 'GAP_NO_PUBLISHED_SNAPSHOT' END);
  END IF;
  PERFORM set_config('stockinsider.fixed_radar_reader_observation',result::text,true);
END $fixed_radar_reader$;
SELECT current_setting('stockinsider.fixed_radar_reader_observation')::jsonb;
COMMIT;
"""


class RadarReaderObservationRejected(Exception):
    def __init__(self):super().__init__('radar_reader_observation_rejected')


def project_radar_reader_observation(value):
    """Exact bounded privacy projection, never caller authority."""
    expected=set(COUNTS)|{'status','rowObservation','oldestContentDate','newestContentDate','readOnly','appAcceptance'}
    if type(value) is not dict or set(value)!=expected:return None
    if (type(value['status']) is not str or value['status'] not in STATUSES
        or value['readOnly'] is not True or value['appAcceptance'] is not False):return None
    if any(type(value[k]) is not int or not 0<=value[k]<=MAX_COUNT for k in COUNTS):return None
    if value['requiredColumns']!=11 or value['matchingTables']>2:return None
    if value['matchingColumns']>7*value['matchingTables']:return None
    if type(value['rowObservation']) is not str:return None
    if value['matchingColumns']+value['missingColumns']+value['typeMismatchColumns']!=11:return None
    for field in ('oldestContentDate','newestContentDate'):
        date=value[field]
        if date is not None:
            if type(date) is not str or len(date)!=10:return None
            try:
                if datetime.date.fromisoformat(date).isoformat()!=date:return None
            except ValueError:return None
    if value['oldestContentDate'] is not None and value['newestContentDate'] is not None:
        if value['oldestContentDate']>value['newestContentDate']:return None
    if (value['oldestContentDate'] is None)!=(value['newestContentDate'] is None):return None
    total=value['homeValidSnapshots']+value['dailyValidSnapshots']
    if total>MAX_COUNT or value['staleSnapshots26h']+value['missingContentDates']>total:return None
    if value['status']=='GAP_SCHEMA':
        if value['rowObservation']!='NOT_RUN_SCHEMA_GAP' or total or value['staleSnapshots26h'] or value['missingContentDates']:return None
        if value['oldestContentDate'] is not None or value['newestContentDate'] is not None:return None
        if value['matchingColumns']==11 and value['matchingTables']==2:return None
    else:
        if value['rowObservation']!='COUNTS_AND_DATES_ONLY' or value['matchingColumns']!=11 or value['matchingTables']!=2:return None
        if value['status']=='GAP_NO_PUBLISHED_SNAPSHOT' and total:return None
        if value['status']=='OBSERVED_PUBLISHED_SNAPSHOT' and not total:return None
        if total==0 and (value['oldestContentDate'] is not None or value['newestContentDate'] is not None):return None
        if total>0 and (value['oldestContentDate'] is None)!=(value['missingContentDates']==total):return None
    return {key:value[key] for key in (*COUNTS,'status','rowObservation','oldestContentDate','newestContentDate','readOnly','appAcceptance')}


def assess_radar_reader(sql):
    """Internal owned-clone callback, one fixed read-only transaction only."""
    if not callable(sql):raise RadarReaderObservationRejected()
    raw=sql(READER_OBSERVATION_SQL)
    if not isinstance(raw,(str,bytes)) or len(raw)>4096:raise RadarReaderObservationRejected()
    try:observation=project_radar_reader_observation(json.loads(raw))
    except (TypeError,ValueError):raise RadarReaderObservationRejected() from None
    if observation is None:raise RadarReaderObservationRejected()
    return observation
