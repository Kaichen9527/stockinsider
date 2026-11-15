"""Synthetic CSV/clock/private-directory/real child reap; no external requests."""
import copy
import csv
from datetime import datetime,timedelta
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
SCRIPT=ROOT/'docs/operations/2026-11-15/launch-radar/collect-close-control-samples.py'
spec=importlib.util.spec_from_file_location('public_close_control_samples',SCRIPT);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
DAY='2026-11-16';CLOCK=datetime.fromisoformat('2026-11-16T13:26:10+00:00')
CANARY='PUBLIC_ROW_HOST_URL_FILE_ID_MUST_NOT_ESCAPE'
def raw(dataset,rows):
 out=io.StringIO(newline='');w=csv.writer(out);w.writerow(m.HEADERS[dataset]);w.writerows(rows);return out.getvalue().encode('utf-8-sig')
def fixture(dataset):
 return raw(dataset,{29082:[['1','1151116','0000','PUBLIC','','','','','','']],11396:[['1151116','00000','PUBLIC','','','']],48664:[['1151115','','','','']]}[dataset])
def base():
 return {'schema':'stockinsider-close-public-input-observation-v1','session':DAY,'cutoff':m.cutoff(DAY).isoformat(),'captureStartedAt':'2026-11-16T13:26:00+00:00','captureFinishedAt':'2026-11-16T13:26:02+00:00','publishOrWriterInvoked':False,'sources':{k:{'datasetId':v,'requestedAt':'2026-11-16T13:26:00+00:00','observedAt':'2026-11-16T13:26:01+00:00'} for k,v in m.BASE_IDS.items()}}


class CloseControlTests(unittest.TestCase):
 def test_exact_three_registered_routes_date_selector_and_no_dated_tpex_site(self):
  for day in m.SESSIONS:
   urls=m.source_urls(day);self.assertEqual(set(urls),{29082,11396,48664})
   self.assertTrue(urls[29082].endswith('startDate='+day.replace('-','')+'&endDate='+day.replace('-','')))
   for dataset in (11396,48664):
    self.assertNotIn('startDate',urls[dataset]);self.assertNotIn('/www/',urls[dataset]);self.assertNotIn('/openapi/',urls[dataset])
  with self.assertRaises(m.SampleRejected):m.source_urls('2026-11-13')
 def test_metadata_only_rows_full_identity_counts_and_no_eligibility(self):
  r=m.parse_sample(11396,raw(11396,[['1151116','0000',CANARY,'','',''],['1151116','00000',CANARY,'','','']]))
  self.assertEqual((r['rowCount'],r['identityCount']),(2,2));self.assertEqual(r['sourceDateMin'],DAY);self.assertIsNone(r['responseDate'])
  self.assertNotIn(CANARY,json.dumps(r));self.assertEqual(r['status'],'CURRENT_LIST_UNBOUND_SESSION')
  r=m.parse_sample(29082,fixture(29082));self.assertEqual(r['status'],'DATED_SELECTOR_ROWS_OBSERVED');self.assertIsNone(r['responseDate'])
 def test_sentinel_named_date_exact_scope_and_undated_csv_remains_unknown(self):
  r=m.parse_sample(48664,fixture(48664));self.assertEqual(r['status'],'EMPTY_NAMED_DATE_OBSERVED');self.assertEqual(r['responseDate'],'2026-11-15')
  for rows in ([],[['','','','','']]):
   r=m.parse_sample(48664,raw(48664,rows));self.assertEqual(r['status'],'EMPTY_UNDATED_UNKNOWN');self.assertIsNone(r['responseDate'])
  for rows in ([['1151116','','','',''],['1151116','0000','PUBLIC','','']],[['1151116','','','',''],['1151116','','','','']]):
   with self.assertRaises(m.SampleRejected):m.parse_sample(48664,raw(48664,rows))
 def test_schema_encoding_dates_and_counts_refuse_without_rows_or_exceptions(self):
  cases=(b'\xff',b'unknown,header\n',raw(11396,[['1150230','0000','PUBLIC','','','']]),raw(11396,[['1151116','',CANARY,'','','']]),raw(48664,[['1151116','','',CANARY,'']]))
  for b in cases:
   with self.assertRaises(m.SampleRejected) as e:m.parse_sample(11396,b)
   self.assertNotIn(CANARY,str(e.exception));self.assertIn(e.exception.status,m.STATES)
  with patch.object(m,'MAX_ROWS',1):
   with self.assertRaises(m.SampleRejected):m.parse_sample(11396,raw(11396,[['1151116','0000','','','',''],['1151116','00000','','','','']]))
 def test_capture_request_observation_cutoff_mime_hash_and_no_unlicensed_fallback(self):
  seen=[]
  class Response:
   status=200;headers=SimpleNamespace(get_content_type=lambda:'application/csv')
   def __enter__(self):return self
   def __exit__(self,*_):pass
   def read(self,n):return fixture(48664)
  class Opener:
   def open(self,req,timeout):seen.append((req.full_url,timeout));return Response()
  with patch.object(m,'now',return_value=CLOCK),patch.object(m,'build_opener',return_value=Opener()):
   r=m.collect_sample(48664,m.source_urls(DAY)[48664],DAY)
  self.assertEqual(seen,[(m.source_urls(DAY)[48664],8)]);self.assertEqual(r['sha256'],hashlib.sha256(fixture(48664)).hexdigest());self.assertTrue(r['observedBeforeCutoff'])
  self.assertFalse(r['responseDateMatchesSession']);self.assertFalse(r['positiveEligibilityAuthority']);self.assertFalse(r['clearsOtherSessionSuspensions'])
  self.assertIsNotNone(m.project_samples({str(k):r if k==48664 else m.empty_sample(k,'OUTSIDE_WINDOW') for k in m.HEADERS}))
  with patch.object(m,'now',return_value=CLOCK.replace(hour=14)),patch.object(m,'build_opener',side_effect=AssertionError('must_not_contact')):
   self.assertEqual(m.collect_sample(48664,m.source_urls(DAY)[48664],DAY)['status'],'OUTSIDE_WINDOW')
 def test_strict_metadata_projection_rejects_extra_rows_unknown_status_and_authority(self):
  good={str(k):m.empty_sample(k,'OUTSIDE_WINDOW') for k in m.HEADERS}
  self.assertEqual(m.project_samples(good),good)
  for key,value in (('status',CANARY),('rowCount',True),('sha256',CANARY),('observedAt',CANARY),('positiveEligibilityAuthority',True),('clearsOtherSessionSuspensions',True),('responseDateMatchesSession',1)):
   bad=copy.deepcopy(good);bad['48664'][key]=value;self.assertIsNone(m.project_samples(bad))
  bad=copy.deepcopy(good);bad['48664']['rows']=CANARY;self.assertIsNone(m.project_samples(bad))
  for body in ('{"48664":1,"48664":2}','{"x":NaN}'):
   with self.assertRaises(m.SampleRejected):m.closed_json(body)
 def test_private_base_completion_and_output_do_not_modify_original(self):
  with tempfile.TemporaryDirectory(prefix='public-close-controls-') as directory:
   p=Path(directory);b=p/'receipt.json';b.write_text(json.dumps(base()));b.chmod(0o600);before=b.read_bytes()
   results={str(k):m.empty_sample(k,'OUTSIDE_WINDOW') for k in m.HEADERS}
   with patch.object(m,'now',return_value=CLOCK),patch.object(m,'bounded_worker',return_value=results):r=m.capture(DAY,p)
   self.assertEqual(b.read_bytes(),before);self.assertFalse(r['originalFiveReceiptChanged']);self.assertEqual((p/'controls-receipt.json').stat().st_mode&0o777,0o600)
   self.assertNotIn(directory,json.dumps(r));self.assertFalse(r['positiveEligibilityAuthority'])
   with patch.object(m,'now',return_value=CLOCK),patch.object(m,'bounded_worker',side_effect=AssertionError('duplicate_must_not_refetch')):
    with self.assertRaises(FileExistsError):m.capture(DAY,p)
 def test_no_base_wrong_owner_mode_or_symlink_never_starts_new_network(self):
  with tempfile.TemporaryDirectory(prefix='public-close-controls-') as directory:
   p=Path(directory)
   with patch.object(m,'now',return_value=CLOCK),patch.object(m,'bounded_worker',side_effect=AssertionError('must_not_start')):
    with self.assertRaises(FileNotFoundError):m.capture(DAY,p)
    (p/'receipt.json').write_text(json.dumps(base()));(p/'receipt.json').chmod(0o644)
    with self.assertRaises(m.SampleRejected):m.capture(DAY,p)
    (p/'receipt.json').unlink();(p/'receipt.json').symlink_to(p/'missing')
    with self.assertRaises(OSError):m.capture(DAY,p)
   link=p/'alias';link.symlink_to(p,target_is_directory=True)
   with self.assertRaises(OSError):m.private_directory(link)
 def test_wrong_base_identity_or_time_never_reads_new_endpoints(self):
  for mutate in (lambda b:b.update(session='2026-11-17'),lambda b:b.update(captureFinishedAt='2026-11-16T13:31:00+00:00'),lambda b:b['sources'].pop('twse_quotes'),lambda b:b['sources']['twse_quotes'].update(datasetId=1)):
   with tempfile.TemporaryDirectory(prefix='public-close-controls-') as directory:
    p=Path(directory);b=base();mutate(b);(p/'receipt.json').write_text(json.dumps(b));(p/'receipt.json').chmod(0o600)
    with patch.object(m,'now',return_value=CLOCK),patch.object(m,'bounded_worker',side_effect=AssertionError('must_not_start')):
     with self.assertRaises(m.SampleRejected):m.capture(DAY,p)
 def test_real_child_deadline_kills_reaps_and_preserves_base_pipeline(self):
  children=[];original=subprocess.Popen
  def fake_child(argv,**kwargs):
   p=original([sys.executable,'-I','-B','-c','import time; time.sleep(5)'],**kwargs);children.append(p);return p
  started=time.monotonic()
  with patch.object(m,'now',return_value=CLOCK),patch.object(m,'runtime_budget',return_value=40),patch.object(m,'WORKER_SECONDS',.1),patch.object(m.subprocess,'Popen',side_effect=fake_child):results=m.bounded_worker(DAY)
  self.assertTrue(all(p.poll() is not None for p in children));self.assertLess(time.monotonic()-started,3)
  self.assertTrue(all(x['status']=='WORKER_DEADLINE' for x in results.values()))
 def test_too_late_wrong_day_and_cli_errors_emit_only_closed_metadata(self):
  with patch.object(m,'now',return_value=datetime.fromisoformat('2026-11-16T13:29:50+00:00')),patch.object(m.subprocess,'Popen',side_effect=AssertionError('must_not_start')):
   self.assertTrue(all(x['status']=='OUTSIDE_WINDOW' for x in m.bounded_worker(DAY).values()))
  p=subprocess.run([sys.executable,'-I','-B',str(SCRIPT),CANARY],capture_output=True,timeout=5)
  self.assertEqual(p.returncode,2);self.assertEqual(p.stderr,b'');self.assertNotIn(CANARY,p.stdout.decode());self.assertEqual(json.loads(p.stdout)['status'],'NOT_CAPTURED')


if __name__=='__main__':unittest.main()
