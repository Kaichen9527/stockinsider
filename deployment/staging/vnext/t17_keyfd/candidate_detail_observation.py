"""Source-fixed same-clone detail discovery. NO grants, RPC execution or HTTP.

Only the validated engine supplies its scoped SQL callback. Output is bounded
counts/dates/public route selectors and hashes, never narrative/facts/SQL/logs.
A projected receipt is descriptive and cannot enable a later detail reader.
"""
import datetime
import json
import re

TABLES={
 'stocks':('id:uuid','symbol:text:20','name:text:255','market:text:10'),
 'candidate_detail_snapshots':('id:uuid','stock_id:uuid','session_date:date','lifecycle_stage:text','detail_kind:text','title:text','summary:text','sections:jsonb','fact_ids:jsonb','source_links:jsonb','valuation:jsonb','technical:jsonb','as_of:timestamptz','available_at:timestamptz','publication_phase:text','provenance:jsonb'),
 'candidate_research_dossiers':('id:uuid','detail_snapshot_id:uuid','narrative_kind:text','content:jsonb','validation_status:text','bundle_id:uuid','bundle_hash:text','input_hash:text','published_at:timestamptz','created_at:timestamptz'),
 'candidate_dossier_submission_receipts':('dossier_id:uuid','bundle_id:uuid','revision_id:uuid','input_hash:text','status:text','received_at:timestamptz'),
 'candidate_official_facts':('fact_id:uuid','stock_id:uuid','fact_key:text','fact_kind:text','period_end:date','value:numeric','unit:text','as_of:timestamptz','available_at:timestamptz','source_url:text','provenance:jsonb','derivation:jsonb'),
 'taiwan_data_publication_metadata_v5':('session_date:date','publication_phase:text','data_cutoff_at:timestamptz','dataset_completeness:jsonb','dataset_completeness_pct:numeric','shadow_eligible:bool'),
 'radar_public_snapshots':('id:uuid','payload_json:jsonb','window_key:text','status:text','published_at:timestamptz','content_as_of:timestamptz'),
}
REQUIRED_COLUMNS=sum(map(len,TABLES.values()))
COUNTS=('requiredColumns','matchingColumns','missingColumns','typeMismatchColumns','matchingTables',
 'publishedCards','publishedPins','matchingDetailRows','stockRows','factIds','invalidFactIds',
 'duplicateFactIds','missingFacts','crossStockFacts','futureFacts','paidFacts','detailSections','invalidSections',
 'titlePresent','summaryPresent','dossierRows','acceptedReceiptRows','metadataRows','revisionContextAvailable',
 'metadataRpcPresent')
DATES=('snapshotContentDate','snapshotPublishedDate','sessionDate','detailAvailableDate')
HASHES=('snapshotSha256','detailSha256','factsSha256','metadataSha256','metadataRpcSourceSha256')
STATUSES=('GAP_SCHEMA','GAP_PUBLISHED_SNAPSHOT','GAP_PUBLISHED_PAYLOAD_BOUND',
 'GAP_AMBIGUOUS_PUBLIC_SNAPSHOT','GAP_PUBLISHED_DETAIL_PIN','GAP_DETAIL_REVISION',
 'GAP_STOCK_AMBIGUITY','GAP_DETAIL_CONTENT','GAP_FACT_CLOSURE','GAP_PUBLICATION_METADATA',
 'GAP_REVISION_CONTEXT','GAP_QUERY_BUDGET','OBSERVED_PINNED_DETAIL_SCOPE')
CONSTANTS={'readOnly':True,'appAcceptance':False,'grantsChanged':0,'detailHttpAcceptance':'NOT_RUN',
 'enrichedAcceptance':'NOT_RUN','originalRpcExecution':'NOT_GRANTED_NOT_CALLED',
 'hashScheme':'PG17_JSONB_PROJECTION_SHA256_NOT_JS_DOSSIER_INPUT_HASH'}
DEFAULT={**{k:0 for k in COUNTS},**{k:None for k in DATES+HASHES},**CONSTANTS,
 'stockSymbol':None,'revisionId':None,'status':'GAP_SCHEMA','requiredColumns':REQUIRED_COLUMNS}
values=[]
for table,columns in TABLES.items():
 for column in columns:
  name,kind,*width=column.split(':')
  values.append("('%s','%s','pg_catalog.%s'::regtype::oid,%s)"%(table,name,kind,int(width[0])+4 if width else 0))

OBSERVATION_SQL=(r"""
\set QUIET 1
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL timezone='UTC';
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
DO $detail_observe$
DECLARE result jsonb := '"""+json.dumps(DEFAULT,separators=(',',':'))+r"""'::jsonb;
  matched bigint; missing bigint; mismatched bigint; tables bigint;
  pub record; chosen record; routes jsonb; closure jsonb; meta jsonb; context jsonb;
  n bigint; d_hash text;
BEGIN
 IF current_setting('transaction_read_only')<>'on' OR current_setting('transaction_isolation')<>'repeatable read'
 THEN RAISE EXCEPTION 'candidate_detail_readonly_required'; END IF;
 WITH expected(table_name,column_name,type_oid,varchar_typmod) AS (VALUES """+','.join(values)+r"""),
 observed AS (
  SELECT e.*,c.oid,c.relkind,a.attnum,a.atttypid,a.atttypmod FROM expected e
  LEFT JOIN pg_namespace ns ON ns.nspname='public'
  LEFT JOIN pg_class c ON c.relnamespace=ns.oid AND c.relname=e.table_name
  LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=e.column_name AND a.attnum>0 AND NOT a.attisdropped
 ), assessed AS (
  SELECT *,relkind='r' AND ((atttypid=type_oid AND atttypmod=-1) OR
   (varchar_typmod>0 AND atttypid='pg_catalog.varchar'::regtype::oid AND atttypmod=varchar_typmod)) AS exact_type
  FROM observed
 ) SELECT count(*) FILTER(WHERE attnum IS NOT NULL AND exact_type),count(*) FILTER(WHERE attnum IS NULL),
  count(*) FILTER(WHERE attnum IS NOT NULL AND NOT exact_type),count(DISTINCT oid) FILTER(WHERE relkind='r')
 INTO matched,missing,mismatched,tables FROM assessed;
 result:=result||jsonb_build_object('matchingColumns',matched,'missingColumns',missing,
  'typeMismatchColumns',mismatched,'matchingTables',tables);
 <<data_observation>>
 BEGIN
  IF matched<>60 OR missing<>0 OR mismatched<>0 OR tables<>7 THEN EXIT data_observation; END IF;
  EXECUTE $latest_public$
   SELECT id,payload_json,published_at,content_as_of FROM public.radar_public_snapshots
   WHERE window_key='daily' AND status='valid' ORDER BY published_at DESC,id DESC LIMIT 1
  $latest_public$ INTO pub;
  IF pub.id IS NULL THEN result:=result||'{"status":"GAP_PUBLISHED_SNAPSHOT"}'; EXIT data_observation; END IF;
  result:=result||jsonb_build_object('snapshotContentDate',to_char(pub.content_as_of,'YYYY-MM-DD'),
   'snapshotPublishedDate',to_char(pub.published_at,'YYYY-MM-DD'));
  EXECUTE $ties$SELECT count(*) FROM public.radar_public_snapshots WHERE window_key='daily' AND status='valid' AND published_at=$1$ties$ INTO n USING pub.published_at;
  IF n<>1 THEN result:=result||'{"status":"GAP_AMBIGUOUS_PUBLIC_SNAPSHOT"}'; EXIT data_observation; END IF;
  IF pub.published_at IS NULL OR pub.content_as_of IS NULL OR pub.content_as_of>pub.published_at OR octet_length(pub.payload_json::text)>2097152
  THEN result:=result||'{"status":"GAP_PUBLISHED_PAYLOAD_BOUND"}'; EXIT data_observation; END IF;
  result:=result||jsonb_build_object('snapshotSha256',encode(sha256(convert_to(pub.payload_json::text,'UTF8')),'hex'));
  EXECUTE $routes$
   WITH cards AS (
    SELECT c.value FROM (VALUES('found'),('waiting'),('actionable')) b(bucket)
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof($1->'stages'->b.bucket)='array' THEN $1->'stages'->b.bucket ELSE '[]'::jsonb END) c
   ), pins AS (
    SELECT DISTINCT value->>'symbol' AS symbol,lower(value->>'detailRevisionId') AS revision
    FROM cards WHERE jsonb_typeof(value)='object' AND value->>'symbol' ~ '^[0-9]{4}$'
     AND value->>'detailRevisionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND value->>'detailHref'='/stock/'||(value->>'symbol')||'?candidateRevision='||lower(value->>'detailRevisionId')
   ) SELECT jsonb_build_object('cards',(SELECT count(*) FROM cards),'pins',
     coalesce((SELECT jsonb_agg(jsonb_build_object('symbol',symbol,'revision',revision) ORDER BY symbol,revision) FROM pins),'[]'::jsonb))
  $routes$ INTO routes USING pub.payload_json;
  result:=result||jsonb_build_object('publishedCards',(routes->>'cards')::bigint,'publishedPins',jsonb_array_length(routes->'pins'));
  IF (routes->>'cards')::bigint>1000 THEN result:=result||'{"status":"GAP_PUBLISHED_PAYLOAD_BOUND"}'; EXIT data_observation; END IF;
  IF jsonb_array_length(routes->'pins')=0 THEN result:=result||'{"status":"GAP_PUBLISHED_DETAIL_PIN"}'; EXIT data_observation; END IF;
  result:=result||jsonb_build_object('stockSymbol',routes->'pins'->0->>'symbol','revisionId',routes->'pins'->0->>'revision');
  EXECUTE $match_count$
   SELECT count(*) FROM jsonb_to_recordset($1) p(symbol text,revision uuid)
   JOIN public.stocks s ON s.symbol=p.symbol AND s.market='TW'
   JOIN public.candidate_detail_snapshots d ON d.stock_id=s.id AND d.id=p.revision
   WHERE d.available_at<=$2 AND d.as_of<=$2 AND d.session_date<=($2 AT TIME ZONE 'UTC')::date
  $match_count$ INTO n USING routes->'pins',pub.published_at;
  result:=result||jsonb_build_object('matchingDetailRows',n);
  IF n=0 THEN result:=result||'{"status":"GAP_DETAIL_REVISION"}'; EXIT data_observation; END IF;
  EXECUTE $one_detail$
   SELECT d.id,d.stock_id,d.session_date,d.lifecycle_stage,d.detail_kind,d.title,d.summary,d.sections,d.fact_ids,
    d.source_links,d.valuation,d.technical,d.as_of,d.available_at,d.publication_phase,d.provenance,s.symbol AS bound_symbol
   FROM jsonb_to_recordset($1) p(symbol text,revision uuid)
   JOIN public.stocks s ON s.symbol=p.symbol AND s.market='TW'
   JOIN public.candidate_detail_snapshots d ON d.stock_id=s.id AND d.id=p.revision
   WHERE d.available_at<=$2 AND d.as_of<=$2 AND d.session_date<=($2 AT TIME ZONE 'UTC')::date
   ORDER BY s.symbol,d.id LIMIT 1
  $one_detail$ INTO chosen USING routes->'pins',pub.published_at;
  result:=result||jsonb_build_object('stockSymbol',chosen.bound_symbol,'revisionId',chosen.id,
   'sessionDate',to_char(chosen.session_date,'YYYY-MM-DD'),'detailAvailableDate',to_char(chosen.available_at,'YYYY-MM-DD'),
   'titlePresent',coalesce(length(btrim(chosen.title))>0,false)::int,'summaryPresent',coalesce(length(btrim(chosen.summary))>0,false)::int,
   'detailSections',CASE WHEN jsonb_typeof(chosen.sections)='array' THEN jsonb_array_length(chosen.sections) ELSE 0 END,
   'detailSha256',encode(sha256(convert_to(to_jsonb(chosen)::text,'UTF8')),'hex'));
  EXECUTE $stock_count$SELECT count(*) FROM public.stocks WHERE symbol=$1 AND market='TW'$stock_count$ INTO n USING chosen.bound_symbol;
  result:=result||jsonb_build_object('stockRows',n);
  IF n<>1 THEN result:=result||'{"status":"GAP_STOCK_AMBIGUITY"}'; EXIT data_observation; END IF;
  SELECT count(*) INTO n FROM jsonb_array_elements(CASE WHEN jsonb_typeof(chosen.sections)='array' THEN chosen.sections ELSE '[]'::jsonb END) s
   WHERE jsonb_typeof(s.value) IS DISTINCT FROM 'object'
    OR jsonb_typeof(s.value->'key') IS DISTINCT FROM 'string' OR coalesce(btrim(s.value->>'key'),'')=''
    OR jsonb_typeof(s.value->'title') IS DISTINCT FROM 'string' OR coalesce(btrim(s.value->>'title'),'')=''
    OR jsonb_typeof(s.value->'body') IS DISTINCT FROM 'string' OR coalesce(btrim(s.value->>'body'),'')=''
    OR jsonb_typeof(s.value->'factIds') IS DISTINCT FROM 'array'
    OR EXISTS(SELECT FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.value->'factIds')='array' THEN s.value->'factIds' ELSE '[]'::jsonb END) f WHERE jsonb_typeof(f.value) IS DISTINCT FROM 'string');
  result:=result||jsonb_build_object('invalidSections',n);
  IF chosen.title IS NULL OR chosen.summary IS NULL OR (result->>'titlePresent')::int<>1 OR (result->>'summaryPresent')::int<>1
   OR (result->>'detailSections')::int=0 OR n<>0
   OR (CASE WHEN jsonb_typeof(chosen.fact_ids)='array' THEN jsonb_array_length(chosen.fact_ids)>2000 ELSE true END)
  THEN result:=result||'{"status":"GAP_DETAIL_CONTENT"}'; EXIT data_observation; END IF;
  EXECUTE $facts$
   WITH raw AS (SELECT value FROM jsonb_array_elements($1)), typed AS (
    SELECT CASE WHEN jsonb_typeof(value)='string' AND value#>>'{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     THEN (value#>>'{}')::uuid ELSE NULL END AS id FROM raw
   ), valid AS (SELECT id FROM typed WHERE id IS NOT NULL), adopted AS (SELECT v.id,f.fact_id,f.stock_id,f.fact_key,f.fact_kind,f.period_end,f.value,f.unit,f.as_of,f.available_at,f.source_url,f.provenance,f.derivation
     FROM valid v LEFT JOIN public.candidate_official_facts f ON f.fact_id=v.id)
   SELECT jsonb_build_object('factIds',(SELECT count(*) FROM raw),'invalidFactIds',(SELECT count(*) FROM raw)-(SELECT count(*) FROM valid),
    'duplicateFactIds',(SELECT count(*)-count(DISTINCT id) FROM valid),
    'missingFacts',count(*) FILTER(WHERE fact_id IS NULL),'crossStockFacts',count(*) FILTER(WHERE fact_id IS NOT NULL AND stock_id IS DISTINCT FROM $2),
    'futureFacts',count(*) FILTER(WHERE fact_id IS NOT NULL AND (available_at IS NULL OR available_at>$3)),
    'paidFacts',count(*) FILTER(WHERE fact_id IS NOT NULL AND (coalesce(source_url,'')||' '||coalesce(provenance::text,'')) ~* '(investanchors?|定錨投資|定錨會員)'),
    'factsSha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(jsonb_build_array(fact_id,stock_id,fact_key,fact_kind,period_end,value,unit,as_of,available_at,source_url,provenance,derivation)::text,'UTF8')),'hex'),'' ORDER BY fact_id) FILTER(WHERE fact_id IS NOT NULL),''),'UTF8')),'hex'))
   FROM adopted
  $facts$ INTO closure USING chosen.fact_ids,chosen.stock_id,chosen.available_at;
  result:=result||closure;
  context:=chosen.provenance->'revision_context';
  IF context->'version'='1'::jsonb AND jsonb_typeof(context->'scores')='object'
    AND NOT EXISTS(SELECT FROM (VALUES('discovery'),('research'),('actionability'),('dataConfidence')) s(k)
      WHERE NOT coalesce(CASE WHEN jsonb_typeof(context->'scores'->s.k)='number' THEN (context->'scores'->>s.k)::numeric BETWEEN 0 AND 100 ELSE false END,false))
    AND context->'riskAction'->>'state' IN ('hold','trim_no_chase','hard_exit','data_incomplete')
    AND jsonb_typeof(context->'riskAction'->'reasons')='array'
    AND NOT EXISTS(SELECT FROM jsonb_array_elements(CASE WHEN jsonb_typeof(context->'riskAction'->'reasons')='array' THEN context->'riskAction'->'reasons' ELSE '[]'::jsonb END) r WHERE jsonb_typeof(r.value)<>'string')
  THEN result:=result||'{"revisionContextAvailable":1}'; END IF;
  EXECUTE $dossiers$SELECT count(*) FROM public.candidate_research_dossiers WHERE detail_snapshot_id=$1 AND narrative_kind='codex_enriched' AND validation_status='valid'$dossiers$ INTO n USING chosen.id;
  result:=result||jsonb_build_object('dossierRows',n);
  EXECUTE $receipts$SELECT count(*) FROM public.candidate_dossier_submission_receipts WHERE revision_id=$1 AND status='accepted'$receipts$ INTO n USING chosen.id;
  result:=result||jsonb_build_object('acceptedReceiptRows',n);
  EXECUTE $metadata$
   SELECT jsonb_build_object('metadataRows',count(*),'metadataSha256',
    CASE WHEN count(*)=1 THEN encode(sha256(convert_to(jsonb_agg(jsonb_build_array(session_date,publication_phase,data_cutoff_at,dataset_completeness,dataset_completeness_pct,shadow_eligible))::text,'UTF8')),'hex') ELSE NULL END)
   FROM public.taiwan_data_publication_metadata_v5 WHERE session_date=$1 AND publication_phase='final'
  $metadata$ INTO meta USING chosen.session_date;
  result:=result||meta;
  SELECT count(*),max(encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')) INTO n,d_hash
   FROM pg_proc p WHERE p.oid=to_regprocedure('public.read_taiwan_data_publication_metadata_v5(date,text)')
    AND p.prorettype='jsonb'::regtype AND p.provolatile='s' AND p.prosecdef;
  result:=result||jsonb_build_object('metadataRpcPresent',n,'metadataRpcSourceSha256',d_hash);
  IF (result->>'factIds')::int=0 OR EXISTS(SELECT FROM jsonb_each(closure) e WHERE e.key IN
   ('invalidFactIds','duplicateFactIds','missingFacts','crossStockFacts','futureFacts','paidFacts') AND e.value<>'0'::jsonb)
  THEN result:=result||'{"status":"GAP_FACT_CLOSURE"}'; EXIT data_observation; END IF;
  IF (result->>'metadataRows')::int<>1 OR (result->>'metadataRpcPresent')::int<>1
  THEN result:=result||'{"status":"GAP_PUBLICATION_METADATA"}'; EXIT data_observation; END IF;
  IF (result->>'revisionContextAvailable')::int<>1
  THEN result:=result||'{"status":"GAP_REVISION_CONTEXT"}'; EXIT data_observation; END IF;
  result:=result||'{"status":"OBSERVED_PINNED_DETAIL_SCOPE"}';
 EXCEPTION WHEN query_canceled OR lock_not_available THEN
  result:=result||'{"status":"GAP_QUERY_BUDGET"}';
 END data_observation;
 PERFORM set_config('stockinsider.fixed_candidate_detail_observation',result::text,true);
END $detail_observe$;
SELECT current_setting('stockinsider.fixed_candidate_detail_observation')::jsonb;
COMMIT;
""").encode()


class CandidateDetailObservationRejected(Exception):
 def __init__(self):super().__init__('fixed_candidate_detail_observation_rejected')


def project_candidate_detail_observation(value):
 if type(value) is not dict or set(value)!=set(DEFAULT):return None
 if value.get('status') not in STATUSES:return None
 if any(type(value[k]) is not type(v) or value[k]!=v for k,v in CONSTANTS.items()):return None
 if any(type(value[k]) is not int or not 0<=value[k]<=8*1024**3 for k in COUNTS):return None
 if value['requiredColumns']!=60 or sum(value[k] for k in ('matchingColumns','missingColumns','typeMismatchColumns'))!=60 or value['matchingTables']>7:return None
 for k in DATES:
  if value[k] is not None:
   try:
    if type(value[k]) is not str or datetime.date.fromisoformat(value[k]).isoformat()!=value[k]:return None
   except ValueError:return None
 for k in HASHES:
  if value[k] is not None and (type(value[k]) is not str or not re.fullmatch('[0-9a-f]{64}',value[k])):return None
 if value['stockSymbol'] is not None and (type(value['stockSymbol']) is not str or not re.fullmatch('[0-9]{4}',value['stockSymbol'])):return None
 if value['revisionId'] is not None and (type(value['revisionId']) is not str or not re.fullmatch('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',value['revisionId'])):return None
 if (value['stockSymbol'] is None)!=(value['revisionId'] is None):return None
 if value['status']=='OBSERVED_PINNED_DETAIL_SCOPE':
  if (value['matchingColumns']!=60 or value['matchingTables']!=7 or value['stockRows']!=1 or value['metadataRows']!=1
   or not 1<=value['publishedCards']<=1000 or not 1<=value['publishedPins']<=value['publishedCards'] or not 1<=value['matchingDetailRows']<=value['publishedPins']
   or value['metadataRpcPresent']!=1 or value['revisionContextAvailable']!=1 or not 1<=value['factIds']<=2000 or value['detailSections']==0 or value['titlePresent']!=1 or value['summaryPresent']!=1
   or any(value[k]!=0 for k in ('invalidFactIds','duplicateFactIds','missingFacts','crossStockFacts','futureFacts','paidFacts','invalidSections'))
   or any(value[k] is None for k in DATES+HASHES) or value['stockSymbol'] is None):return None
 return dict(value)


def assess_candidate_detail(sql):
 raw=sql(OBSERVATION_SQL)
 if not isinstance(raw,(bytes,str)) or len(raw)>16384:raise CandidateDetailObservationRejected()
 try:value=json.loads(raw)
 except (ValueError,TypeError):raise CandidateDetailObservationRejected() from None
 result=project_candidate_detail_observation(value)
 if result is None:raise CandidateDetailObservationRejected()
 return result
