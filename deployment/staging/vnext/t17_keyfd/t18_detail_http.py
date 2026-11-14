"""Fixed genuine Next API/page probes. Counts/hashes only; no body is exported."""
import hashlib
import html.parser
import json
import re
import time
from .t18_readpoint_diagnostics import readpoint_phase

STATUSES=('GAP_DETAIL_SCOPE','GAP_AUGMENTED_DETAIL','GAP_DETAIL_BOUND','GAP_DETAIL_ACTION_SURFACE','GAP_DETAIL_PUBLIC_JSON','HISTORICAL_DETAIL_HTTP_VERIFIED')


class _VisibleText(html.parser.HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.skip=0;self.text=[];self.articles=0
 def handle_starttag(self,tag,attrs):
  if tag in ('script','style'):self.skip+=1
  if tag=='article':self.articles+=1
 def handle_endtag(self,tag):
  if tag in ('script','style'):self.skip=max(0,self.skip-1)
 def handle_data(self,data):
  if not self.skip:self.text.append(data)


def _same_time(a,b):
 from .t18_same_clone import _timestamp
 return _timestamp(a)==_timestamp(b)


def _check_payload(body,rows):
 from .t18_same_clone import FixedRollbackRejected
 value=json.loads(body);d=rows['detail'];stock=rows['stock'];p=value.get('detail')
 if type(p) is not dict or value.get('ok') is not True:raise FixedRollbackRejected('historical_detail_json_rejected')
 exact={'revisionId':d['id'],'symbol':stock['symbol'],'chineseName':stock['name'],'sessionDate':d['session_date'],
 'lifecycleStage':d['lifecycle_stage'],'detailKind':d['detail_kind'],'title':d['title'],'summary':d['summary'],
 'valuation':d['valuation'],'technical':d['technical'],'narrativeKind':'deterministic_fact','scores':d['provenance']['revision_context']['scores']}
 if any(p.get(k)!=v for k,v in exact.items()) or p.get('tradePlan') is not None or p.get('claims')!=[]:raise FixedRollbackRejected('historical_detail_values_changed')
 if not _same_time(p.get('asOf'),d['as_of']) or not _same_time(p.get('availableAt'),d['available_at']):raise FixedRollbackRejected('historical_detail_dates_changed')
 if type(p.get('sections')) is not list or len(p['sections'])!=len(d['sections']):raise FixedRollbackRejected('historical_detail_sections_changed')
 for actual,expected in zip(p['sections'],d['sections']):
  if any(actual.get(k)!=expected[k] for k in ('key','title','body')):raise FixedRollbackRejected('historical_detail_prose_changed')
 if len(p.get('facts',[]))!=len(rows['facts']):raise FixedRollbackRejected('historical_detail_fact_count_changed')
 # Compare each genuine public fact's identity/value/date, not only the count.
 for actual,expected in zip(p['facts'],rows['facts']):
  if (any(actual.get(k)!=expected[v] for k,v in (('factKey','fact_key'),('periodEnd','period_end'),('value','value'),('unit','unit')))
      or not _same_time(actual.get('availableAt'),expected['available_at'])):raise FixedRollbackRejected('historical_detail_facts_changed')
 return p


def exercise_detail_http(app,releases,read):
 from .t18_same_clone import _http,FixedRollbackRejected
 rows=read.rows;d=rows['detail'];symbol=rows['stock']['symbol'];revision=d['id']
 api='/api/stocks/'+symbol+'/candidate-detail?revision='+revision
 page='/stock/'+symbol+'?candidateRevision='+revision
 steps=[];deadline=time.monotonic()+60
 with readpoint_phase('candidate_detail_http'):
  primary_error=None
  try:
   for op,release in zip(('START_A','START_B'),releases):
    response=app.request(op)
    if response['sourceCommit']!=release['sourceCommit']:raise FixedRollbackRejected('historical_detail_release_binding_failed')
    last_timeout=False
    for _ in range(40):
     if time.monotonic()>deadline:raise TimeoutError()
     try:
      status,headers,body=_http(3000,'GET',api);last_timeout=False
      if status==200:break
     except TimeoutError:last_timeout=True
     except OSError:last_timeout=False
     time.sleep(.1)
    else:
     if last_timeout:raise TimeoutError()
     raise FixedRollbackRejected('historical_detail_api_not_ready')
    detail=_check_payload(body,rows)
    status,_,markup=_http(3000,'GET',page)
    parser=_VisibleText();parser.feed(markup.decode('utf-8'));visible=' '.join(parser.text)
    def normalized(x):return re.sub(r'\s+',' ',x).strip()
    def public_text(x):return re.sub(r'[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}','尚待確認',x,flags=re.I)
    sections=[x for x in d['sections'] if x['key']!='sources']
    from datetime import datetime,timezone,timedelta
    dates=[datetime.fromisoformat(d[k].replace('Z','+00:00')).replace(tzinfo=timezone.utc) if k=='session_date' else datetime.fromisoformat(d[k].replace('Z','+00:00')) for k in ('session_date','as_of','available_at')]
    labels=[str(x.astimezone(timezone(timedelta(hours=8))).year)+'/'+str(x.astimezone(timezone(timedelta(hours=8))).month)+'/'+str(x.astimezone(timezone(timedelta(hours=8))).day) for x in dates]
    if (status!=200 or parser.articles<len(sections) or 'REVISION-BOUND RESEARCH' not in visible
        or any(normalized(public_text(x[k])) not in normalized(visible) for x in sections for k in ('title','body'))
        or symbol not in visible or any(x not in visible for x in labels)):raise FixedRollbackRejected('historical_detail_page_content_failed')
    other_symbol='0001' if symbol=='0000' else '0000'
    negatives=(api+'&revision='+revision,api.replace(revision,'invalid'),api.replace(revision,'00000000-0000-4000-8000-000000000000'),api.replace('/'+symbol+'/', '/'+other_symbol+'/'))
    for index,target in enumerate(negatives):
     denied,_,refusal=_http(3000,'GET',target)
     if denied==200 or d['summary'].encode() in refusal:raise FixedRollbackRejected('historical_detail_revision_boundary_failed')
    steps.append({'sourceCommit':release['sourceCommit'],'apiStatus':200,'pageStatus':200,
     'apiSha256':hashlib.sha256(body).hexdigest(),'pageSha256':hashlib.sha256(markup).hexdigest(),
     'sections':len(detail['sections']),'facts':len(detail['facts']),'revisionNegatives':len(negatives)})
    app.request('STOP_NEXT')
  except BaseException as error:primary_error=error;raise
  finally:
   try:app.request('STOP_NEXT')
   except Exception:
    if primary_error is None:raise
 return {'status':'HISTORICAL_DETAIL_HTTP_VERIFIED','steps':steps,'originalDatesPreserved':True,
  'identityScope':'SINGLE_PUBLISHED_REVISION','readerTransport':'VALIDATED_CLONE_SQL_PRIVATE_ADAPTER',
  'detailPostgrestAcceptance':'NOT_RUN','originalRpcExecution':'NOT_GRANTED_NOT_CALLED',
  'freshnessActionAcceptance':'GAP_FIXED_UI_HAS_NO_AGE_FENCE','siteAcceptance':'NOT_RUN','newRadarAcceptance':'NOT_RUN'}


def project_detail_http(value):
 if type(value) is not dict or value.get('status') not in STATUSES:return None
 if value['status']!='HISTORICAL_DETAIL_HTTP_VERIFIED':return dict(value) if set(value)=={'status'} else None
 from .t18_release_assets import RELEASE_PINS
 expected={'status','steps','originalDatesPreserved','identityScope','readerTransport','detailPostgrestAcceptance','originalRpcExecution','freshnessActionAcceptance','siteAcceptance','newRadarAcceptance'}
 if set(value)!=expected or value['originalDatesPreserved'] is not True:return None
 constants={'identityScope':'SINGLE_PUBLISHED_REVISION','readerTransport':'VALIDATED_CLONE_SQL_PRIVATE_ADAPTER','detailPostgrestAcceptance':'NOT_RUN',
 'originalRpcExecution':'NOT_GRANTED_NOT_CALLED','freshnessActionAcceptance':'GAP_FIXED_UI_HAS_NO_AGE_FENCE','siteAcceptance':'NOT_RUN','newRadarAcceptance':'NOT_RUN'}
 if any(value[k]!=v for k,v in constants.items()) or type(value['steps']) is not list or len(value['steps'])!=2:return None
 for step,pin in zip(value['steps'],RELEASE_PINS):
  if type(step) is not dict or set(step)!={'sourceCommit','apiStatus','pageStatus','apiSha256','pageSha256','sections','facts','revisionNegatives'} or step['sourceCommit']!=pin[0]:return None
  if any(type(step[k]) is not int or step[k]!=v for k,v in (('apiStatus',200),('pageStatus',200),('revisionNegatives',4))):return None
  if any(type(step[k]) is not str or not re.fullmatch('[0-9a-f]{64}',step[k]) for k in ('apiSha256','pageSha256')):return None
  if any(type(step[k]) is not int or not 1<=step[k]<=2000 for k in ('sections','facts')):return None
 return json.loads(json.dumps(value))
