import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import action_calendar_audit as a

class CalendarAuditTests(unittest.TestCase):
    def test_closed_session_exposes_identity_but_never_infers_correction(self):
        actions={'1216':[dict(session='2023-08-03',source_sha256='a'*64)]}
        original=copy.deepcopy(actions)
        result=a.inspect_actions(actions,['2023-08-02','2023-08-04'])
        self.assertEqual(result['status'],'blocked_input_inconsistency')
        self.assertEqual(result['issues'][0]['symbol'],'1216')
        self.assertEqual(result['issues'][0]['previous_recorded_session'],'2023-08-02')
        self.assertEqual(result['issues'][0]['next_recorded_session'],'2023-08-04')
        self.assertFalse(result['issues'][0]['automatic_correction'])
        self.assertEqual(actions,original)

    def test_consistent_session_passes_without_simulating(self):
        result=a.inspect_actions({'1216':[dict(session='2023-08-04')]},['2023-08-02','2023-08-04'])
        self.assertEqual(result['status'],'consistent'); self.assertEqual(result['new_simulations'],0)

    def test_duplicate_action_retained_as_error(self):
        result=a.inspect_actions({'1216':[dict(session='2023-08-04')]*2},['2023-08-04'])
        self.assertEqual(result['issues'][0]['reason'],'duplicate_action_session')

    def test_absent_neighbor_is_null_not_invented_date(self):
        for session in ('2023-01-01','2023-12-31'):
            value=a.inspect_actions({'1216':[dict(session=session)]},['2023-08-04'])['issues'][0]
            key='previous_recorded_session' if session<'2023-08-04' else 'next_recorded_session'
            self.assertIsNone(value[key])

    def test_unsorted_duplicate_or_noniso_calendar_rejected(self):
        for sessions in (['2023-08-04','2023-08-02'],['2023-08-04']*2,['20230804'],[True],['2023-02-30']):
            with self.subTest(sessions=sessions),self.assertRaises(ValueError): a.inspect_actions({},sessions)

    def test_holdout_tail_not_read_as_valid_calendar_or_event(self):
        with self.assertRaises(ValueError): a.inspect_actions({},['2024-01-02'])
        with self.assertRaises(ValueError): a.inspect_actions({'x':[dict(session='2024-01-02')]},['2023-12-29'])

    def test_wrong_manifest_rejected_before_loading_dataset(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(a,'load_dataset') as load:
            (Path(folder)/'manifest.json').write_text('{}')
            with self.assertRaisesRegex(ValueError,'exact_frozen_manifest'):a.load_frozen_dataset(folder)
            load.assert_not_called()

    def test_cli_blocked_status_is_nonzero_and_evidence_survives(self):
        result=dict(status='blocked_input_inconsistency',issues=[dict(symbol='1216')])
        with tempfile.TemporaryDirectory() as folder,patch.object(a,'inspect',return_value=result):
            out=Path(folder)/'audit.json'
            self.assertEqual(a.main(['--data',folder,'--output',str(out)]),2)
            self.assertTrue(out.exists())
            with self.assertRaises(FileExistsError):a.main(['--data',folder,'--output',str(out)])

if __name__=='__main__':unittest.main()
