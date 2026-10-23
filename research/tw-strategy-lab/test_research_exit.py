"""Execution status regressions. All manufactured outcomes are synthetic only."""
import copy
import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import run_robustness as r


def complete():
    trials = [{**p, 'status': 'exploratory', 'result_file': p['id'].replace(':', '-') + '.json',
               **({'canonical_equality': dict(result=True, signals=True, ledger=True)} if p['work'] == 'R1' else {})}
              for p in r.registered_paths()]
    return dict(status='development_only_complete', R1_canonical_replay_passed=True,
                holdout_accessed=False, production_authorized=False, winner_selected=None,
                registered_simulation_paths=31, retained_path_records=31, completed_simulation_paths=31,
                trials=trials, R2={'status': 'exploratory_checks_failed'})


class ResearchExitTests(unittest.TestCase):
    def test_all_complete_execution_does_not_require_profitable_r2(self):
        self.assertEqual(r.execution_exit_code(complete()), 0)

    def test_original_failed_action_calendar_outcome_is_nonzero(self):
        result = complete()
        result.update(status='incomplete_or_failed', R1_canonical_replay_passed=False, completed_simulation_paths=0)
        for row in result['trials']:
            row.update(status='failed' if row['work'] == 'R1' else 'blocked', result_file=None)
        self.assertEqual(r.execution_exit_code(result), 2)

    def test_summary_cannot_hide_a_failed_or_blocked_trial(self):
        for status in ('failed', 'blocked', 'invalid_missing_marks', 'failed_canonical_equality'):
            with self.subTest(status=status):
                value = complete(); value['trials'][-1]['status'] = status
                self.assertEqual(r.execution_exit_code(value), 2)

    def test_duplicate_or_missing_path_cannot_count_as_complete(self):
        value = complete();value['trials'][-1] = copy.deepcopy(value['trials'][0])
        self.assertEqual(r.execution_exit_code(value), 2)
        value = complete();value['trials'].pop()
        self.assertEqual(r.execution_exit_code(value), 2)

    def test_exact_canonical_checks_are_not_truthy_coercions(self):
        for item in (False, 1, None, 'true'):
            value = complete();value['trials'][0]['canonical_equality']['ledger'] = item
            self.assertEqual(r.execution_exit_code(value), 2)

    def test_no_result_file_no_success(self):
        for item in ('', None, 42):
            value = complete();value['trials'][-1]['result_file'] = item
            self.assertEqual(r.execution_exit_code(value), 2)

    def test_frozen_path_configuration_cannot_be_substituted(self):
        value = complete();value['trials'][0]['scenario'] = 'unregistered'
        self.assertEqual(r.execution_exit_code(value), 2)

    def test_invalid_counts_and_unsafe_authority_never_pass(self):
        for key, value in (('retained_path_records', True), ('completed_simulation_paths', 30),
                           ('production_authorized', True), ('holdout_accessed', True),
                           ('winner_selected', 'S3'), ('R1_canonical_replay_passed', 1)):
            with self.subTest(key=key):
                data = complete();data[key] = value
                self.assertEqual(r.execution_exit_code(data), 2)

    def test_cli_returns_failure_after_retaining_its_real_outcome(self):
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder) / 'new'
            def fail(*args):
                out.mkdir(); value=complete();value['status']='incomplete_or_failed'
                (out/'results.json').write_text(json.dumps(value));return value
            with patch.object(r, 'execute', side_effect=fail), contextlib.redirect_stdout(io.StringIO()):
                code=r.main(['--execute', '--data', folder, '--review-id', '1', '--output', str(out)])
            self.assertEqual(code, 2)
            self.assertEqual(json.loads((out/'results.json').read_text())['status'], 'incomplete_or_failed')

    def test_real_process_propagates_main_nonzero_exit(self):
        # runpy supplies a synthetic execution return only. No historical paths.
        source = "import runpy,sys; from unittest.mock import patch; " \
                 "ns=runpy.run_path(sys.argv[1]); ns['main'].__globals__['execute']=lambda *a: {'status':'incomplete_or_failed'}; " \
                 "raise SystemExit(ns['main'](['--execute','--data','unused','--review-id','1','--output',sys.argv[2]]))"
        with tempfile.TemporaryDirectory() as folder:
            process=subprocess.run([sys.executable, '-c', source, str(Path(r.__file__)), str(Path(folder)/'new')],
                                   cwd=Path(r.__file__).parent, text=True, capture_output=True, timeout=10)
        self.assertEqual(process.returncode, 2, process.stderr)
        self.assertEqual(json.loads(process.stdout)['exit_code'], 2)

    def test_real_inspection_remains_zero_without_any_simulation(self):
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)/'new'
            process=subprocess.run([sys.executable, r.__file__, '--output', str(out)], text=True, capture_output=True, timeout=10)
            self.assertEqual(process.returncode,0,process.stderr)
            value=json.loads((out/'inspection.json').read_text())
            self.assertEqual(value['new_simulations'],0)
            self.assertFalse(value['R1_replay_verified'])

if __name__ == '__main__':
    unittest.main()
