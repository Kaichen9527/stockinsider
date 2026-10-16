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
import datetime, hashlib, json, os, pathlib, subprocess, tempfile
root=pathlib.Path(tempfile.mkdtemp(prefix='stockinsider-official-2327-oct16-',dir='/tmp'))
os.chmod(root,0o700)
source='https://mopsov.twse.com.tw/server-java/FileDownLoad?functionName=t164sb01&step=9&co_id=2327&year=2026&season=2&report_id=C'
listing_url='https://mopsov.twse.com.tw/mops/web/ajax_t203sb01'
out={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'symbol':'2327','periodEnd':'2026-06-30','acquisitionJobId':'8ad5b86e-183e-4ebe-9103-b595cb03a378','sourceUrl':source,'listingUrl':listing_url,'ownedDirectory':str(root),'dataWrite':False,'upload':False,'worker':False,'redirectsFollowed':False,'factsAdded':0}
def fetch(name,url,limit,fields=None):
 args=['/usr/bin/curl','--silent','--show-error','--proto','=https','--proto-redir','=https','--connect-timeout','5','--max-time','15','--max-filesize',str(limit),'--dump-header',str(root/(name+'.headers')),'--output',str(root/name),'--write-out','%{http_code}\n%{content_type}\n%{url_effective}']
 for k,v in (fields or {}).items():args+=['--data-urlencode',k+'='+v]
 args+=[url]
 c=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20)
 (root/(name+'.curl-stderr')).write_bytes(c.stderr)
 vals=c.stdout.decode('utf8','replace').splitlines();r={'exit':c.returncode,'status':vals[0] if vals else None,'contentType':vals[1] if len(vals)>1 else None,'effectiveUrl':vals[2] if len(vals)>2 else None}
 p=root/name
 if p.exists():
  b=p.read_bytes();r.update(bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
 return r
try:
 out['listing']=fetch('listing.html',listing_url,2097152,{'step':'1','firstin':'ture','off':'1','TYPEK':'all','keyword4':'','code1':'','TYPEK2':'','checkbtn':'','queryName':'co_id','inpuType':'co_id','co_id':'2327'})
 if out['listing']['exit'] or out['listing']['status']!='200' or out['listing']['effectiveUrl']!=listing_url:raise ValueError('listing_transport_not_accepted')
 listing=(root/'listing.html').read_bytes().decode('utf8','strict')
 relative='/server-java/FileDownLoad?functionName=t164sb01&step=9&co_id=2327&year=2026&season=2&report_id=C'
 if relative not in listing and relative.replace('&','&amp;') not in listing:raise ValueError('exact_official_listing_link_missing')
 out['exactOfficialListingLink']=True
 out['document']=fetch('2327.xhtml',source,5242880)
 if out['document']['exit'] or out['document']['status']!='200' or out['document']['effectiveUrl']!=source:raise ValueError('document_transport_not_accepted')
 b=(root/'2327.xhtml').read_bytes();text=b.decode('utf8','strict')
 import re,xml.etree.ElementTree as ET
 if re.search(r'<!ENTITY|<!DOCTYPE',text,re.I):raise ValueError('xml_declaration_not_accepted')
 if not 1000<len(b)<=5242880:raise ValueError('document_bound')
 if out['document']['contentType'].split(';')[0].strip().lower() not in ['application/xhtml+xml','application/xml','text/xml','text/html']:raise ValueError('mime_not_accepted')
 xml=ET.fromstring(text)
 ns={'x':'http://www.xbrl.org/2003/instance'}
 contexts=[]
 for c in xml.findall('.//x:context',ns):
  identifiers=[x.text for x in c.findall('./x:entity/x:identifier',ns)]
  dates=[x.text for x in c.findall('./x:period/x:endDate',ns)]+[x.text for x in c.findall('./x:period/x:instant',ns)]
  if '2327' in identifiers and '2026-06-30' in dates:contexts.append(c.attrib.get('id'))
 if not contexts:raise ValueError('issuer_period_context_missing')
 if not xml.findall('.//{http://www.xbrl.org/2013/inlineXBRL}header') and not xml.findall('.//{http://www.xbrl.org/2008/inlineXBRL}header'):raise ValueError('inline_header_missing')
 out.update(status='STRUCTURAL_IDENTITY_CAPTURED_NOT_VALIDATED',issuerPeriodContextCount=len(contexts),contextIdsSha256=hashlib.sha256(json.dumps(sorted(contexts),separators=(',',':')).encode()).hexdigest(),schemaAccountingValidation='NOT_RUN',publishedAt='NOT_REVERIFIED',readyToUpload=False)
except Exception as e:
 out.update(status='CAPTURE_STOPPED',errorType=type(e).__name__,error=str(e)[:200],readyToUpload=False)
out['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
(root/'capture.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(out,ensure_ascii=False))
PY
