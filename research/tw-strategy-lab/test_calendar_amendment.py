"""Synthetic correction boundaries only; actual market paths require native review."""
import copy
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import calendar_amendment as c
import run_robustness as r
from run_research import canonical


def fixture():
    spec=c.load_amendment();old=spec['transformation']['original_event']
    actions={'1216':[copy.deepcopy(old)]}
    corrected=copy.deepcopy(actions);corrected['1216'][0]['session']='2023-08-04'
    # Pure-component fixture hashes are not admitted by the public CLI.
    spec['original_included_actions_sha256']=c.digest(canonical(actions))
    spec['corrected_included_actions_sha256']=c.digest(canonical(corrected))
    bars={'1216':[dict(date='2023-08-02',close=76.2),dict(date='2023-08-04',open=73.1,close=71.1)]}
    return bars,actions,['2023-08-02','2023-08-04'],spec


class CalendarAmendmentTests(unittest.TestCase):
    def test_exact_event_only_and_no_mutation(self):
        values=fixture();before=copy.deepcopy(values)
        corrected,receipt=c.validate_and_apply(*values)
        self.assertEqual(values,before)
        self.assertEqual(corrected['1216'][0]['session'],'2023-08-04')
        old=dict(corrected['1216'][0],session='2023-08-03')
        self.assertEqual(old,values[1]['1216'][0])
        self.assertFalse(receipt['original_dataset_files_modified'])
        self.assertTrue(receipt['original_R1_equality_requirements_unchanged'])

    def test_source_action_change_cannot_borrow_frozen_correction(self):
        for field,value in (('cash_dividend',3.2),('price_factor',1),('source_sha256','x'),('payment_date','2023-08-04')):
            values=fixture();values[1]['1216'][0][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):c.validate_and_apply(*values)

    def test_corrupted_target_digest_rejected(self):
        values=fixture();values[3]['corrected_included_actions_sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'corrected_actions'):c.validate_and_apply(*values)

    def test_present_original_session_is_not_shifted(self):
        values=fixture();values[2].insert(1,'2023-08-03')
        with self.assertRaises(ValueError):c.validate_and_apply(*values)

    def test_missing_target_session_is_not_filled(self):
        values=fixture();values[2].remove('2023-08-04')
        with self.assertRaises(ValueError):c.validate_and_apply(*values)

    def test_changed_adjacent_recorded_session_is_rejected(self):
        values=fixture();values[2][0]='2023-08-01'
        with self.assertRaises(ValueError):c.validate_and_apply(*values)

    def test_price_anchor_or_duplicate_price_cannot_support_correction(self):
        for field,value in (('open',73.2),('close',72.1)):
            values=fixture();values[0]['1216'][1][field]=value
            with self.assertRaises(ValueError):c.validate_and_apply(*values)
        values=fixture();values[0]['1216'].append(dict(values[0]['1216'][1]))
        with self.assertRaises(ValueError):c.validate_and_apply(*values)

    def test_duplicate_actions_or_new_anomaly_cannot_be_hidden(self):
        for extra in (dict(session='2023-08-03'),dict(session='2023-08-04'),dict(session='2023-07-31')):
            values=fixture();values[1]['1216'].append(extra)
            values[3]['original_included_actions_sha256']=c.digest(canonical(values[1]))
            with self.assertRaises(ValueError):c.validate_and_apply(*values)

    def test_approval_requires_separate_exact_marker(self):
        raw=json.dumps({'body':'ROBUSTNESS_V2_1_ACCEPTED old contracts only'})
        receipt=dict(acceptance_location='review_body',native_review_response_utf8=raw,response_sha256=c.digest(raw.encode()),id=1)
        with self.assertRaisesRegex(ValueError,'explicit_acceptance'):c.verify_additional_acceptance(receipt)
        raw=json.dumps({'body':c.MARKER});receipt.update(native_review_response_utf8=raw,response_sha256=c.digest(raw.encode()))
        self.assertFalse(c.verify_additional_acceptance(receipt)['release_gate_authority'])

    def test_inline_and_review_body_are_not_combined(self):
        raw=json.dumps({'body':'not accepted'})
        receipt=dict(acceptance_location='native_review_comment',native_comment_response_utf8=raw,
                     review_comment_response_sha256=c.digest(raw.encode()),native_review_response_utf8=json.dumps({'body':c.MARKER}),id=1)
        with self.assertRaises(ValueError):c.verify_additional_acceptance(receipt)

    def test_tampered_native_response_or_wrong_amendment_fails(self):
        for body,sha in ((c.MARKER,'0'*64),(c.MARKER.replace(c.SHA256,'0'*64),None)):
            raw=json.dumps({'body':body});receipt=dict(acceptance_location='review_body',native_review_response_utf8=raw,response_sha256=sha or c.digest(raw.encode()),id=1)
            with self.assertRaises(ValueError):c.verify_additional_acceptance(receipt)

    def test_frozen_amendment_cannot_be_changed_silently(self):
        with patch.object(c,'read_bytes',return_value=b'{}'),self.assertRaisesRegex(ValueError,'hash_mismatch'):c.load_amendment()

    def test_amendment_cannot_run_in_inspection_mode(self):
        with tempfile.TemporaryDirectory() as folder,contextlib.redirect_stderr(io.StringIO()),self.assertRaises(SystemExit) as exc:
            r.main(['--apply-reviewed-calendar-amendment','--output',str(Path(folder)/'new')])
        self.assertEqual(exc.exception.code,2)

    def test_execution_requires_native_amendment_acceptance_before_dataset_read(self):
        review=dict(acceptance_location='review_body',native_review_response_utf8='{}',response_sha256=c.digest(b'{}'),id=1)
        with patch.object(r,'source_identity',return_value={'commit':'a'*40}),patch.object(r,'fetch_contract_review',return_value=review):
            with patch('action_calendar_audit.load_frozen_dataset') as data,self.assertRaises(ValueError):
                r.execute('unused','unused',1,apply_calendar_amendment=True)
            data.assert_not_called()

if __name__=='__main__':unittest.main()
