"""Private genuine-clone SQL projection. No DB grants/RPC/URL/command entry.

Internal validated-clone SQL only. Projection values stay private and scoped;
receipt is descriptive. Unknown forwarded public JSON is a GAP. Audit-only
provenance uses the explicit reduced context/locator projection, not invented data.
"""
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass,field
import datetime
import hashlib
import json
import math
import re
from urllib.parse import parse_qsl,urlsplit
from .candidate_detail_observation import OBSERVATION_SQL,project_candidate_detail_observation

MAX_BYTES=512*1024
STOCK_SELECT='id,symbol,name'
DETAIL_SELECT='id,stock_id,session_date,lifecycle_stage,detail_kind,title,summary,sections,fact_ids,source_links,valuation,technical,as_of,available_at,publication_phase,provenance'
DOSSIER_SELECT='id,narrative_kind,content,validation_status,bundle_id,bundle_hash,input_hash,published_at,created_at'
RECEIPT_SELECT='dossier_id,bundle_id,revision_id,input_hash,status,received_at'
FACT_SELECT='fact_id,stock_id,fact_key,fact_kind,period_end,value,unit,as_of,available_at,source_url,provenance,derivation'
RPC_PATH='/rest/v1/rpc/read_taiwan_data_publication_metadata_v5'
# No invocation of the original function: fixed table SELECT preserves wire shape.
_SUFFIX=br"""
DO $private_detail_projection$
DECLARE observed jsonb:=current_setting('stockinsider.fixed_candidate_detail_observation')::jsonb; payload jsonb;
BEGIN
 IF observed->>'status'='OBSERVED_PINNED_DETAIL_SCOPE' THEN
 EXECUTE $fixed_rows$
 SELECT jsonb_build_object(
 'stock',jsonb_build_object('id',s.id,'symbol',s.symbol,'name',s.name),
 'detail',jsonb_build_object('id',d.id,'stock_id',d.stock_id,'session_date',d.session_date,'lifecycle_stage',d.lifecycle_stage,'detail_kind',d.detail_kind,'title',d.title,'summary',d.summary,'sections',d.sections,'fact_ids',d.fact_ids,'source_links',d.source_links,'valuation',d.valuation,'technical',d.technical,'as_of',d.as_of,'available_at',d.available_at,'publication_phase',d.publication_phase,'provenance',d.provenance),
 'facts',(SELECT jsonb_agg(jsonb_build_object('fact_id',f.fact_id,'stock_id',f.stock_id,'fact_key',f.fact_key,'fact_kind',f.fact_kind,'period_end',f.period_end,'value',f.value,'unit',f.unit,'as_of',f.as_of,'available_at',f.available_at,'source_url',f.source_url,'provenance',f.provenance,'derivation',f.derivation) ORDER BY f.period_end DESC,f.fact_id) FROM public.candidate_official_facts f
   WHERE f.fact_id IN(SELECT value::uuid FROM jsonb_array_elements_text(d.fact_ids))),
 'metadata',(SELECT jsonb_build_object('publicationPhase',m.publication_phase,'dataCutoffAt',m.data_cutoff_at,
   'datasetCompleteness',m.dataset_completeness,'datasetCompletenessPct',m.dataset_completeness_pct,'shadowEligible',m.shadow_eligible)
   FROM public.taiwan_data_publication_metadata_v5 m WHERE m.session_date=d.session_date AND m.publication_phase='final'))
 FROM public.stocks s JOIN public.candidate_detail_snapshots d ON d.stock_id=s.id
 WHERE s.symbol=$1 AND s.market='TW' AND d.id=$2
 $fixed_rows$ INTO payload USING observed->>'stockSymbol',(observed->>'revisionId')::uuid;
 END IF;
 IF octet_length(payload::text)>524288 THEN payload:=NULL; END IF;
 PERFORM set_config('stockinsider.private_detail_projection',coalesce(payload,'null'::jsonb)::text,true);
END $private_detail_projection$;
SELECT jsonb_build_object('observation',current_setting('stockinsider.fixed_candidate_detail_observation')::jsonb,
 'projection',current_setting('stockinsider.private_detail_projection')::jsonb);
COMMIT;
"""
_tail=b"SELECT current_setting('stockinsider.fixed_candidate_detail_observation')::jsonb;\nCOMMIT;"
assert OBSERVATION_SQL.count(_tail)==1
PROJECTION_SQL=OBSERVATION_SQL.replace(_tail,_SUFFIX)


PROFILE_CATEGORIES=frozenset(('ENVELOPE','BOUNDS','STOCK','DETAIL','SECTION','SOURCE_LINK',
 'VALUATION','TECHNICAL','VALUATION_HISTORY','RESEARCH_COVERAGE','BUSINESS_PROFILE',
 'FORWARD_BVPS','EARNINGS_BRIDGE','COMMON_INCOME_BRIDGE','EQUITY_BRIDGE','FACTOR',
 'REVISION_CONTEXT','FACT','FACT_URL','PUBLIC_LOCATOR','METADATA','METADATA_DATASET'))
PROFILE_REASONS=frozenset(('OBJECT_TYPE','UNSUPPORTED_FIELD','MISSING_FIELD','FIELD_TYPE',
 'UNSUPPORTED_SEMANTICS','REFERENCE_SCOPE','URL_POLICY','BOUND_EXCEEDED','SENSITIVE_PATTERN',
 'INVALID_PROFILE','URL_QUERY_HOST_POLICY','FACTOR_STATUS','FACTOR_GRADE','FACTOR_COUNT','FACTOR_RANGE'))


BOUND_SUBTYPES=frozenset(('DEPTH','JS_SAFE_NUMBER','STRING_BYTES','ARRAY_COUNT','OBJECT_COUNT','KEY_BOUND'))


BOUND_REGIONS=frozenset(('METADATA_DATASET_MAP','METADATA_OTHER','DETAIL_PROVENANCE',
 'DETAIL_VALUATION','DETAIL_TECHNICAL','DETAIL_SECTIONS','FACT_PROVENANCE','FACT_DERIVATION','OTHER'))
_BOUND_CONTEXT=ContextVar('fixed_bound_region',default=('ROOT','OTHER'))


@contextmanager
def _bound_scope(position,region):
 token=_BOUND_CONTEXT.set((position,region))
 try:yield
 finally:_BOUND_CONTEXT.reset(token)


def _bound_child(position,region,key):
 # Called only AFTER the existing key bound, inside the original traversal.
 # Return compiled states only; never retain a raw key/path/index.
 if position=='ROOT':
  if key=='metadata':return 'METADATA_ROW','METADATA_OTHER'
  if key=='detail':return 'DETAIL_ROW','OTHER'
  if key=='facts':return 'FACT_LIST','OTHER'
 elif position=='METADATA_ROW':
  if key=='datasetCompleteness':return 'METADATA_MAP','METADATA_DATASET_MAP'
 elif position=='METADATA_MAP':return 'DESCENDANT','METADATA_OTHER'
 elif position=='DETAIL_ROW':
  if key=='provenance':return 'DESCENDANT','DETAIL_PROVENANCE'
  if key=='valuation':return 'DESCENDANT','DETAIL_VALUATION'
  if key=='technical':return 'DESCENDANT','DETAIL_TECHNICAL'
  if key=='sections':return 'DESCENDANT','DETAIL_SECTIONS'
 elif position=='FACT_ROW':
  if key=='provenance':return 'DESCENDANT','FACT_PROVENANCE'
  if key=='derivation':return 'DESCENDANT','FACT_DERIVATION'
 return 'DESCENDANT',region


class DetailAdapterRejected(Exception):
 def __init__(self,reason='INVALID_PROFILE',bound_subtype=None,bound_region=None):
  self.category=None
  self.bound_subtype=bound_subtype
  self.bound_region=bound_region
  self.reason=reason if type(reason) is str and reason in PROFILE_REASONS else 'INVALID_PROFILE'
  super().__init__('fixed_detail_read_adapter_rejected')


@contextmanager
def _profile(category):
 if category not in PROFILE_CATEGORIES:raise DetailAdapterRejected()
 try:yield
 except DetailAdapterRejected as error:
  if error.category is None:error.category=category
  raise
 except (ValueError,TypeError,KeyError,AttributeError,OverflowError,RecursionError) as error:
  reason='MISSING_FIELD' if isinstance(error,KeyError) else 'FIELD_TYPE' if isinstance(error,(TypeError,AttributeError)) else 'INVALID_PROFILE'
  rejected=DetailAdapterRejected(reason);rejected.category=category
  raise rejected from None


def project_profile_diagnostic(value):
 """Closed enums ONLY, never an actual field name/type/value/exception string."""
 if (type(value) is not dict or set(value) not in ({'category','reason'},{'category','reason','boundSubtype'},{'category','reason','boundSubtype','boundRegion'})
     or type(value['category']) is not str or value['category'] not in PROFILE_CATEGORIES
     or type(value['reason']) is not str or value['reason'] not in PROFILE_REASONS):return None
 result={'category':value['category'],'reason':value['reason']}
 if 'boundSubtype' in value:
  subtype=value['boundSubtype']
  if (value['category']!='BOUNDS' or value['reason']!='BOUND_EXCEEDED'
      or type(subtype) is not str or subtype not in BOUND_SUBTYPES):return None
  result['boundSubtype']=subtype
 if 'boundRegion' in value:
  region=value['boundRegion']
  if (value['category']!='BOUNDS' or value['reason']!='BOUND_EXCEEDED' or value.get('boundSubtype')!='OBJECT_COUNT'
      or type(region) is not str or region not in BOUND_REGIONS):return None
  result['boundRegion']=region
 return result


RAW_FACT_URL_POLICIES=frozenset(('NOT_OBSERVED','ACCEPTED_URL_POLICY','REJECTED_URL_POLICY','REJECTED_QUERY_HOST_POLICY'))


def project_raw_fact_url_policy(value):
 return value if type(value) is str and value in RAW_FACT_URL_POLICIES else None


def _raw_fact_url_policy(rows):
 """Parallel pure observation, not first-exception attribution or authority.

    Fixed bounded fact set only. No host, key, parameter, URL, index or value is
    returned/retained. Check the unchanged raw validator, never sanitize/rewrite.
 """
 try:
  facts=rows['facts']
  if type(facts) is not list or not 1<=len(facts)<=40:return 'NOT_OBSERVED'
  rejected=False;query_host=False
  for fact in facts:
   try:_url(fact['source_url'])
   except DetailAdapterRejected as error:
    rejected=True;query_host=query_host or error.reason=='URL_QUERY_HOST_POLICY'
   except (ValueError,TypeError,KeyError,AttributeError):rejected=True
  return 'REJECTED_QUERY_HOST_POLICY' if query_host else 'REJECTED_URL_POLICY' if rejected else 'ACCEPTED_URL_POLICY'
 except (ValueError,TypeError,KeyError,AttributeError):return 'NOT_OBSERVED'
 finally:
  # urllib's parser cache must not retain additional diagnostic-only URLs.
  urlsplit.cache_clear()


def _json_gap(error,raw_fact_url_policy='NOT_OBSERVED'):
 diagnostic={'category':error.category,'reason':error.reason}
 if error.bound_subtype is not None:diagnostic['boundSubtype']=error.bound_subtype
 if error.bound_region is not None:diagnostic['boundRegion']=error.bound_region
 value=project_profile_diagnostic(diagnostic)
 policy=project_raw_fact_url_policy(raw_fact_url_policy)
 if value is None or policy is None:raise DetailAdapterRejected()
 return None,{'status':'GAP_DETAIL_PUBLIC_JSON','profileDiagnostic':value,'rawFactUrlPolicy':policy}


def _json(raw):
 def pairs(items):
  value={}
  for key,item in items:
   if key in value:raise DetailAdapterRejected()
   value[key]=item
  return value
 try:return json.loads(raw,object_pairs_hook=pairs,parse_constant=lambda _:(_ for _ in ()).throw(DetailAdapterRejected()))
 except (ValueError,UnicodeError,TypeError,RecursionError,OverflowError):raise DetailAdapterRejected() from None


def _bounded(value,depth=0):
 position,region=_BOUND_CONTEXT.get()
 if depth>12:raise DetailAdapterRejected('BOUND_EXCEEDED',bound_subtype='DEPTH')
 if value is None or type(value) is bool:return
 if type(value) in (int,float):
  if not math.isfinite(value) or abs(value)>9007199254740991:raise DetailAdapterRejected('BOUND_EXCEEDED',bound_subtype='JS_SAFE_NUMBER')
 elif type(value) is str:
  if len(value.encode())>65536:raise DetailAdapterRejected('BOUND_EXCEEDED',bound_subtype='STRING_BYTES')
  if re.search(r'-----BEGIN .*PRIVATE KEY|eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.',value):raise DetailAdapterRejected('SENSITIVE_PATTERN')
 elif type(value) is list:
  if len(value)>2000:raise DetailAdapterRejected('BOUND_EXCEEDED',bound_subtype='ARRAY_COUNT')
  for child in value:
   with _bound_scope('FACT_ROW' if position=='FACT_LIST' else 'DESCENDANT','METADATA_OTHER' if position=='METADATA_MAP' else region):_bounded(child,depth+1)
 elif type(value) is dict:
  if len(value)>128:raise DetailAdapterRejected('BOUND_EXCEEDED',bound_subtype='OBJECT_COUNT',bound_region=region)
  for key,child in value.items():
   if type(key) is not str or len(key)>128:raise DetailAdapterRejected('BOUND_EXCEEDED',bound_subtype='KEY_BOUND')
   with _bound_scope(*_bound_child(position,region,key)):_bounded(child,depth+1)
 else:raise DetailAdapterRejected('FIELD_TYPE')


def _keys(value,allowed,required=()):
 if type(value) is not dict:raise DetailAdapterRejected('OBJECT_TYPE')
 if not set(value)<=set(allowed.split()):raise DetailAdapterRejected('UNSUPPORTED_FIELD')
 if not set(required.split() if isinstance(required,str) else required)<=set(value):raise DetailAdapterRejected('MISSING_FIELD')


def _url(value):
 if value is None:return
 if type(value) is not str:raise DetailAdapterRejected('URL_POLICY')
 p=urlsplit(value)
 if p.scheme!='https' or not p.hostname or p.username or p.password or p.fragment:raise DetailAdapterRejected('URL_POLICY')
 if p.query:
  allowed={'date','response','stockNo','selectType','year','month','season','co_id','TYPEK','step','firstin'}
  if p.hostname not in ('www.twse.com.tw','www.tpex.org.tw','mops.twse.com.tw','mopsov.twse.com.tw'):raise DetailAdapterRejected('URL_QUERY_HOST_POLICY')
  try:params=parse_qsl(p.query,strict_parsing=True,max_num_fields=12)
  except ValueError:raise DetailAdapterRejected('URL_POLICY') from None
  if len(dict(params))!=len(params) or any(k not in allowed or not re.fullmatch('[A-Za-z0-9_-]{1,32}',v) for k,v in params):raise DetailAdapterRejected('URL_POLICY')


# Private staging pins. All three must match the genuine restored clone.
_PINNED_HISTORICAL_SOURCE_SCOPE=(
 '1a2c6998470e3978b1e8aa96029b47b5084116101eea6a2c35bdc9065316e4e7',
 '56ea4878e70260f11ce6570584616b75c0abf00f58926dec8a844d51274ef239',
 '58b3e425635a601a4b761d8901cb0b1a7c3404d1314cd7c89bb075e661013cd8',
)
_HISTORY_HTTPS_VENDOR_QUERY=re.compile(r'^https://(?:[a-z0-9.-]+\.)?finmindtrade\.com/[^?#]+\?[^#]+$',re.I)


def _omit_pinned_historical_fact_links(rows,observation):
 """Keep source URLs unavailable on one restored historical revision only."""
 observed=tuple(observation[key] for key in ('snapshotSha256','detailSha256','factsSha256'))
 if observed!=_PINNED_HISTORICAL_SOURCE_SCOPE:return 0
 facts=rows['facts']
 if (len(facts)!=9 or observation['factIds']!=9 or rows['detail']['id']!=observation['revisionId']
     or rows['stock']['symbol']!=observation['stockSymbol']
     or rows['detail']['session_date']!=observation['sessionDate']):return 0
 rejected=[]
 for fact in facts:
  value=fact['source_url']
  try:_url(value)
  except DetailAdapterRejected as error:
   if error.reason!='URL_QUERY_HOST_POLICY' or not _HISTORY_HTTPS_VENDOR_QUERY.fullmatch(value):return 0
   rejected.append(fact)
 if len(rejected)!=4:return 0
 # The adapter owns this copy. SQL rows and the persisted revision are untouched.
 for fact in rejected:fact['source_url']=None
 return len(rejected)


def _typed(value,kind):
 if value is None:return
 if kind=='number':
  if type(value) not in (int,float):raise DetailAdapterRejected('FIELD_TYPE')
 elif kind=='text':
  if type(value) is not str:raise DetailAdapterRejected('FIELD_TYPE')
 elif kind=='bool':
  if type(value) is not bool:raise DetailAdapterRejected('FIELD_TYPE')
 elif kind=='strings':
  if type(value) is not list or any(type(x) is not str for x in value):raise DetailAdapterRejected('FIELD_TYPE')
 else:raise DetailAdapterRejected('FIELD_TYPE')


def _fields(value,numbers='',texts='',booleans='',strings=''):
 _keys(value,' '.join((numbers,texts,booleans,strings)))
 for keys,kind in ((numbers,'number'),(texts,'text'),(booleans,'bool'),(strings,'strings')):
  for key in keys.split():
   if key in value:_typed(value[key],kind)


# A staging-only raw-map budget, NOT a larger general object bound and NOT an
# assertion about cumulative historical map cardinality. The wire/SQL byte caps
# still apply before this map is examined. Unknown entries are never discarded.
RAW_MARKET_MAP_MAX_ENTRIES=4096
_MARKET_DATASETS=('daily_price','daily_valuation')
_RAW_DATASET_KEY=re.compile(r'(daily_price|daily_valuation|monthly_revenue|financial_statement|institutional_flow|margin_short|market_index|stock_master|trading_calendar):(TWSE|TPEX)(:[0-9]{4})?')
_RAW_TERMINALS=frozenset(('complete','empty','timeout','usage_limited','auth_failed','http_error','network_error','schema_invalid','not_configured','conflict','stale'))
_RAW_ENTRY_FIELDS='terminal actionEligible selectedProvider selectedAuthorityTier persistence'
_PROGRESS_COUNTS=('expected','completed','failed','failedCandidate','failedCritical','queued','running','missing','retrying')
_PROGRESS_BOOLS=('ready','settled','researchReady')


def _metadata_timestamp(value):
 # Validate, never normalize/replace an official source date.
 if (type(value) is not str or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})',value)):
  raise DetailAdapterRejected('FIELD_TYPE')
 try:
  parsed=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
  offset=value[-6:]
  if value.endswith('Z'):return
  hours,minutes=int(offset[1:3]),int(offset[4:])
  if minutes>59 or hours>14 or (hours==14 and minutes):raise ValueError()
  if parsed.utcoffset() is None:raise ValueError()
 except ValueError:raise DetailAdapterRejected('FIELD_TYPE') from None


def _raw_refresh_progress(entry):
 fields=set(_PROGRESS_COUNTS+_PROGRESS_BOOLS+('scopeSource','cutoffAt'))
 if type(entry) is not dict:raise DetailAdapterRejected('OBJECT_TYPE')
 if set(entry) not in (fields,fields|{'contractVersion'}):raise DetailAdapterRejected('UNSUPPORTED_FIELD')
 if any(type(entry[k]) is not int or not 0<=entry[k]<=9007199254740991 for k in _PROGRESS_COUNTS):raise DetailAdapterRejected('FIELD_TYPE')
 if any(type(entry[k]) is not bool for k in _PROGRESS_BOOLS):raise DetailAdapterRejected('FIELD_TYPE')
 source=entry['scopeSource']
 if type(source) is not str or source not in ('registered_scope','phase_queue'):raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
 if source=='registered_scope':_metadata_timestamp(entry['cutoffAt'])
 elif entry['cutoffAt'] is not None:raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
 if 'contractVersion' in entry:
  version=entry['contractVersion']
  if source=='phase_queue':
   if version is not None:raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
  elif type(version) is not str or not re.fullmatch(r'taiwan-data-provider-v[0-9]{1,4}',version):raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
 expected,completed,failed=(entry[k] for k in ('expected','completed','failed'))
 settled=expected>0 and completed+failed==expected
 if (expected!=completed+failed+entry['queued']+entry['running']+entry['missing']
     or failed!=entry['failedCandidate']+entry['failedCritical'] or entry['retrying']>entry['queued']
     or entry['ready']!=(expected>0 and completed==expected) or entry['settled']!=settled
     or entry['researchReady']!=(settled and entry['failedCritical']==0)):
  raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')


def _project_market_metadata(rows):
 """Fully validate private raw metadata, then emit only fixed reader terminals.

 No raw mutation, caller selector, SQL, RPC, authority, URL rewrite or public raw
 diagnostics. All raw entries (including ignored datasets/progress) are checked.
 """
 with _profile('ENVELOPE'):_keys(rows,'stock detail facts metadata','stock detail facts metadata')
 with _profile('METADATA'):
  metadata=rows['metadata']
  _keys(metadata,'publicationPhase dataCutoffAt datasetCompleteness datasetCompletenessPct shadowEligible','publicationPhase dataCutoffAt datasetCompleteness datasetCompletenessPct shadowEligible')
  _fields({k:v for k,v in metadata.items() if k!='datasetCompleteness'},numbers='datasetCompletenessPct',texts='publicationPhase dataCutoffAt',booleans='shadowEligible')
  if type(metadata['datasetCompletenessPct']) not in (int,float) or type(metadata['shadowEligible']) is not bool:raise DetailAdapterRejected('FIELD_TYPE')
  if not 0<=metadata['datasetCompletenessPct']<=100:raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
  if metadata['publicationPhase']!='final':raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
  _metadata_timestamp(metadata['dataCutoffAt'])
  raw_map=metadata['datasetCompleteness']
  if type(raw_map) is not dict:raise DetailAdapterRejected('OBJECT_TYPE')
  if len(json.dumps(metadata,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode())>MAX_BYTES:raise DetailAdapterRejected('BOUND_EXCEEDED')
  if len(raw_map)>RAW_MARKET_MAP_MAX_ENTRIES:raise DetailAdapterRejected('BOUND_EXCEEDED')
 states={dataset:[] for dataset in _MARKET_DATASETS};progress=None
 for key,entry in raw_map.items():
  with _profile('BOUNDS'):
   if type(key) is not str or len(key)>128:raise DetailAdapterRejected('BOUND_EXCEEDED',bound_subtype='KEY_BOUND')
   # Same depth/size/sensitive/number checks on ALL raw entry contents, before
   # omission. Only the exact raw dataset-map container has a separate budget.
   with _bound_scope('DESCENDANT','METADATA_OTHER'):_bounded(entry,3)
  with _profile('METADATA_DATASET'):
   if key=='_refresh_scope_v6':_raw_refresh_progress(entry);progress=entry;continue
   matched=_RAW_DATASET_KEY.fullmatch(key)
   if matched is None:raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
   _keys(entry,_RAW_ENTRY_FIELDS,_RAW_ENTRY_FIELDS)
   _fields(entry,texts='terminal selectedProvider selectedAuthorityTier persistence',booleans='actionEligible')
   if type(entry['terminal']) is not str:raise DetailAdapterRejected('FIELD_TYPE')
   if entry['terminal'] not in _RAW_TERMINALS:raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
   if type(entry['actionEligible']) is not bool:raise DetailAdapterRejected('FIELD_TYPE')
   provider,tier=entry['selectedProvider'],entry['selectedAuthorityTier']
   if provider is None:
    if tier is not None:raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
   elif (type(provider) is not str or provider not in ('twse','tpex','finmind') or type(tier) is not str
         or tier!=('finmind_fallback' if provider=='finmind' else 'official_primary')
         or (provider in ('twse','tpex') and provider!=matched[2].lower())):
    raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
   if type(entry['persistence']) is not str or entry['persistence'] not in ('persisted','not_persisted'):raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
   if entry['terminal']=='complete':
    if entry['actionEligible'] is not True or entry['persistence']!='persisted' or provider is None:raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
   elif entry['actionEligible'] is not False or entry['persistence']!='not_persisted':raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
   dataset=matched[1]
   if dataset in states:states[dataset].append(entry['terminal'])
 if progress is not None:
  # Exact nonnegative HALF_UP rounding from the fixed SQL writer, with no float
  # recomputation of an emitted value. Scope is validated, never exposed/used to
  # manufacture a terminal or replace the preserved original percent.
  expected,completed=progress['expected'],progress['completed']
  hundredths=(0 if not expected else 10000 if completed==expected
    else min(9999,(20000*completed+expected)//(2*expected)))
  with _profile('METADATA'):
   if metadata['shadowEligible'] is not False or metadata['datasetCompletenessPct']!=hundredths/100:raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
 summary={}
 for dataset,terminals in states.items():
  terminal=('missing' if not terminals else 'complete' if all(x=='complete' for x in terminals)
    else 'conflict' if 'conflict' in terminals else 'stale' if 'stale' in terminals
    else next(x for x in terminals if x!='complete'))
  summary[dataset]={'terminal':terminal}
 return {**rows,'metadata':{**metadata,'datasetCompleteness':summary}}


def _public_shapes(rows):
 with _profile('ENVELOPE'):
  _keys(rows,'stock detail facts metadata','stock detail facts metadata')
 with _profile('STOCK'):
  _keys(rows['stock'],'id symbol name','id symbol name')
 d=rows['detail'];facts=rows['facts']
 with _profile('DETAIL'):
  _keys(d,DETAIL_SELECT.replace(',',' '),DETAIL_SELECT.replace(',',' '))
 with _profile('SECTION'):
  for section in d['sections']:
   _keys(section,'key title body factIds','key title body factIds');_fields(section,texts='key title body',strings='factIds')
   if not set(section['factIds'])<=set(d['fact_ids']):raise DetailAdapterRejected('REFERENCE_SCOPE')
 with _profile('SOURCE_LINK'):
  for source in d['source_links']:
   _keys(source,'label url publishedAt published_at platform factIds fact_ids factId fact_id mentionIds mention_ids mentionId mention_id','label url')
   _fields(source,texts='label url publishedAt published_at platform factId fact_id mentionId mention_id',strings='factIds fact_ids mentionIds mention_ids');_url(source['url'])
 v=d['valuation'];t=d['technical']
 with _profile('VALUATION'):
  _keys(v,'status currentPrice bearTarget baseTarget bullTarget probabilityWeightedTarget baseUpsidePct bearDownsidePct rewardRiskRatio method basis monthsCovered next12mBridgeComplete epsTtm forwardEps normalizedEps bookValuePerShare currentPe currentPb fairMultiple historicalPercentile historicalMultiples historicalPrices forwardBvps targetPeriodEnd researchCoverage businessProfile forwardCommonEquityBridge earningsBridge forwardCommonIncomeBridge factorEvidence unmetConditions missing')
 with _profile('TECHNICAL'):
  _fields(t,numbers='close ma20 ma60 ma120 ma240 rsi14 atr14 volumeRatio20Median',texts='sessionDate marketRegime',booleans='hardGatePassed')
 with _profile('VALUATION'):
  nested={'historicalMultiples','historicalPrices','forwardBvps','researchCoverage','businessProfile','forwardCommonEquityBridge','earningsBridge','forwardCommonIncomeBridge','factorEvidence'}
  _fields({k:x for k,x in v.items() if k not in nested},numbers='currentPrice bearTarget baseTarget bullTarget probabilityWeightedTarget baseUpsidePct bearDownsidePct rewardRiskRatio monthsCovered epsTtm forwardEps normalizedEps bookValuePerShare currentPe currentPb fairMultiple historicalPercentile',texts='status method basis targetPeriodEnd',booleans='next12mBridgeComplete',strings='unmetConditions missing')
 with _profile('VALUATION_HISTORY'):
  for key in ('historicalMultiples','historicalPrices'):
   points=v.get(key)
   if points is not None and type(points) is not list:raise DetailAdapterRejected('FIELD_TYPE')
   for point in points or []:_fields(point,numbers='peRatio pbRatio close ma5 ma20 ma60 ma120 ma240',texts='date month frequency')
 with _profile('RESEARCH_COVERAGE'):
  if v.get('researchCoverage') is not None:
   coverage=v['researchCoverage'];_keys(coverage,'status requiredFieldPeriods verifiedFieldPeriods completenessPct missing evaluationAt')
   _fields({k:x for k,x in coverage.items() if k!='missing'},numbers='requiredFieldPeriods verifiedFieldPeriods completenessPct',texts='status evaluationAt')
   if type(coverage.get('missing',[])) is not list:raise DetailAdapterRejected('FIELD_TYPE')
   for missing in coverage.get('missing',[]):
    _keys(missing,'factKey periodEnd','factKey periodEnd');_fields(missing,texts='factKey periodEnd')
 with _profile('BUSINESS_PROFILE'):
  if v.get('businessProfile') is not None:_fields(v['businessProfile'],numbers='forecastHorizonMonths',texts='version businessModel primaryValuationMethod',strings='operatingSegments sourceRefs')
 with _profile('FORWARD_BVPS'):
  if v.get('forwardBvps') is not None:_fields(v['forwardBvps'],numbers='bear base bull')
 # Complete bridge/factor nested profiles are deliberately not yet reviewed.
 for key in ('earningsBridge','forwardCommonIncomeBridge'):
  with _profile('EARNINGS_BRIDGE' if key=='earningsBridge' else 'COMMON_INCOME_BRIDGE'):
   if v.get(key) is not None:
    _keys(v[key],'status missing','status');_fields(v[key],texts='status',strings='missing')
    if v[key]['status']!='insufficient':raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
 with _profile('EQUITY_BRIDGE'):
  if v.get('forwardCommonEquityBridge') is not None:raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
 with _profile('FACTOR'):
  if v.get('factorEvidence') is not None:
   factors=v['factorEvidence'];_keys(factors,'official broker industry_fundamentals industry_rotation_price overseas_peer overseas_price')
   for factor in factors.values():
    _keys(factor,'score evidenceCount coveredWeight evidenceGrade status asOf reasons','score evidenceCount coveredWeight evidenceGrade status asOf reasons')
    _fields(factor,numbers='score evidenceCount coveredWeight evidenceGrade',texts='status asOf',strings='reasons')
    if factor['status'] not in ('available','partial','missing'):raise DetailAdapterRejected('FACTOR_STATUS')
    if factor['evidenceGrade'] not in (0,25,50,75,100):raise DetailAdapterRejected('FACTOR_GRADE')
    if type(factor['evidenceCount']) is not int or factor['evidenceCount']<0:raise DetailAdapterRejected('FACTOR_COUNT')
    if any(type(factor[k]) not in (int,float) or not 0<=factor[k]<=100 for k in ('score','coveredWeight')):raise DetailAdapterRejected('FACTOR_RANGE')
    if type(factor['reasons']) is not list:raise DetailAdapterRejected('FIELD_TYPE')
 with _profile('REVISION_CONTEXT'):
  p=d['provenance']
  if type(p) is not dict or p.get('trade_plan') is not None:raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
  context=p['revision_context'];_keys(context,'version scores riskAction','version scores riskAction')
  _keys(context['scores'],'discovery research actionability dataConfidence','discovery research actionability dataConfidence')
  _keys(context['riskAction'],'state reasons','state reasons');_fields(context['riskAction'],texts='state',strings='reasons')
 # Explicit reduced public projection: these are the only provenance fields
 # consumed by the non-enriched pinned reader. No made-up replacement values.
 with _profile('REVISION_CONTEXT'):
  d['provenance']={'revision_context':context}
 with _profile('FACT'):
  for fact in facts:
   _keys(fact,FACT_SELECT.replace(',',' '),FACT_SELECT.replace(',',' '))
   _fields({k:x for k,x in fact.items() if k not in ('provenance','derivation')},numbers='value',texts='fact_id stock_id fact_key fact_kind period_end unit as_of available_at source_url')
   with _profile('FACT_URL'):_url(fact['source_url'])
   with _profile('PUBLIC_LOCATOR'):
    provenance=fact['provenance']
    if provenance is not None and type(provenance) is not dict:raise DetailAdapterRejected('OBJECT_TYPE')
    fact['provenance']={k:value for k,value in (provenance or {}).items() if k in ('locator','source_locator','page','section','field')}
    # Derivation is never read/rendered without an accepted dossier; omit it.
    fact.pop('derivation')
    if any(type(v) not in (str,int,float) for v in fact['provenance'].values()):raise DetailAdapterRejected('FIELD_TYPE')
 with _profile('METADATA'):
  m=rows['metadata'];_keys(m,'publicationPhase dataCutoffAt datasetCompleteness datasetCompletenessPct shadowEligible','publicationPhase dataCutoffAt datasetCompleteness datasetCompletenessPct shadowEligible')
  _fields({k:x for k,x in m.items() if k!='datasetCompleteness'},numbers='datasetCompletenessPct',texts='publicationPhase dataCutoffAt',booleans='shadowEligible')
  if type(m['datasetCompleteness']) is not dict:raise DetailAdapterRejected('OBJECT_TYPE')
 with _profile('METADATA_DATASET'):
  for key,entry in m['datasetCompleteness'].items():
   if not re.fullmatch(r'(daily_price|daily_valuation|monthly_revenue)(:(TWSE|TPEx)(:[0-9]{4})?)?',key):raise DetailAdapterRejected('UNSUPPORTED_SEMANTICS')
   _keys(entry,'terminal persistence recordsWritten recordCount rows sourceAsOf observedAt actionEligible selectedProvider selectedAuthorityTier','terminal')
   _fields(entry,numbers='recordsWritten recordCount rows',texts='terminal persistence sourceAsOf observedAt selectedProvider selectedAuthorityTier',booleans='actionEligible')
   if any(type(v) not in (str,int,float,bool,type(None)) for v in entry.values()):raise DetailAdapterRejected('FIELD_TYPE')


@dataclass(frozen=True,repr=False)
class _DetailRead:
 _payload:bytes=field(repr=False)
 historical_fact_source_links_withheld:int=0
 @property
 def rows(self):return _json(self._payload)  # independent private copy
 def response(self,method,target,body=b''):
  rows=self.rows;s=rows['stock'];d=rows['detail'];parts=target.partition('?')
  if method=='POST' and target==RPC_PATH:
   try:value=_json(body)
   except DetailAdapterRejected:return None
   if value!={'p_session_date':d['session_date'],'p_publication_phase':'final'}:return None
   return rows['metadata']
  if method!='GET' or not parts[1]:return None
  try:pairs=parse_qsl(parts[2],keep_blank_values=True,strict_parsing=True,max_num_fields=7,errors='strict')
  except (ValueError,UnicodeError):return None
  q=dict(pairs)
  if len(q)!=len(pairs):return None
  cases={
   '/rest/v1/stocks':({'select':STOCK_SELECT,'symbol':'eq.'+s['symbol'],'market':'eq.TW'},[s]),
   '/rest/v1/candidate_detail_snapshots':({'select':DETAIL_SELECT,'stock_id':'eq.'+s['id'],'id':'eq.'+d['id'],'order':'session_date.desc,available_at.desc,id.desc','limit':'1'},[d]),
   '/rest/v1/candidate_research_dossiers':({'select':DOSSIER_SELECT,'detail_snapshot_id':'eq.'+d['id'],'narrative_kind':'eq.codex_enriched','validation_status':'eq.valid','order':'created_at.desc','limit':'1'},[]),
   '/rest/v1/candidate_dossier_submission_receipts':({'select':RECEIPT_SELECT,'revision_id':'eq.'+d['id'],'status':'eq.accepted','order':'received_at.desc','limit':'20'},[])}
  if parts[0] in cases:
   expected,value=cases[parts[0]];return value if q==expected else None
  if parts[0]!='/rest/v1/candidate_official_facts' or set(q)!={'select','fact_id','order','limit'} or q['select']!=FACT_SELECT or q['order']!='period_end.desc':return None
  expr=q['fact_id']
  if not expr.startswith('in.(') or not expr.endswith(')'):return None
  ids=expr[4:-1].split(',')
  if not 1<=len(ids)<=40 or len(set(ids))!=len(ids) or q['limit']!=str(len(ids)) or not set(ids)<=set(d['fact_ids']):return None
  return [f for f in rows['facts'] if f['fact_id'] in ids]


def prepare_detail_read(sql):
 """Only the live scoped engine calls this; no exported pin/readiness selector."""
 raw=sql(PROJECTION_SQL)
 if type(raw) not in (str,bytes):raise DetailAdapterRejected()
 if len(raw)>MAX_BYTES*2:raise DetailAdapterRejected()
 try:
  if type(raw) is bytes:raw=raw.decode('utf-8')
  if len(raw.encode('utf-8'))>MAX_BYTES*2:raise DetailAdapterRejected()
 except UnicodeError:raise DetailAdapterRejected() from None
 value=_json(raw);_keys(value,'observation projection','observation projection');observation=project_candidate_detail_observation(value.get('observation'))
 if observation is None:raise DetailAdapterRejected()
 status='GAP_DETAIL_SCOPE'
 if observation['status']!='OBSERVED_PINNED_DETAIL_SCOPE':return None,{'status':status}
 if observation['factIds']>40:return None,{'status':'GAP_DETAIL_BOUND'}
 if observation['dossierRows'] or observation['acceptedReceiptRows']:return None,{'status':'GAP_AUGMENTED_DETAIL'}
 rows=value.get('projection')
 if rows is None:return None,{'status':'GAP_DETAIL_BOUND'}
 raw_fact_url_policy='NOT_OBSERVED'
 try:
  rows=_project_market_metadata(rows)
  with _profile('BOUNDS'):_bounded(rows)
  raw_fact_url_policy=_raw_fact_url_policy(rows)
  with _profile('STOCK'):
   if type(rows['stock']['name']) is not str or not rows['stock']['name'].strip():raise DetailAdapterRejected('FIELD_TYPE')
  with _profile('DETAIL'):
   if rows['detail']['lifecycle_stage'] not in ('found','waiting') or rows['detail']['provenance'].get('trade_plan') is not None:
    return None,{'status':'GAP_DETAIL_ACTION_SURFACE'}
  withheld=0
  if raw_fact_url_policy=='REJECTED_QUERY_HOST_POLICY':
   withheld=_omit_pinned_historical_fact_links(rows,observation)
  _public_shapes(rows)
 except DetailAdapterRejected as error:return _json_gap(error,raw_fact_url_policy)
 except (ValueError,TypeError,KeyError,AttributeError):
  error=DetailAdapterRejected();error.category='ENVELOPE'
  return _json_gap(error,raw_fact_url_policy)
 data=json.dumps(rows,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
 if len(data)>MAX_BYTES:return None,{'status':'GAP_DETAIL_BOUND'}
 return _DetailRead(data,withheld),{'status':'PREPARED_PRIVATE_HISTORICAL_DETAIL'}
