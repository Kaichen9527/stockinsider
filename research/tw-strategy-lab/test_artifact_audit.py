"""Adversarial contract tests; synthetic mutations are never market evidence."""
import copy
import hashlib
import json
import io
import os
from contextlib import redirect_stdout
from pathlib import Path
import shutil
import socket
import stat
import tempfile
import unittest
from unittest.mock import patch

import artifact_audit as audit

TEMP_ROOT = Path(tempfile.gettempdir()).resolve()


class ArtifactAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle, _ = audit.load_pinned_bundle(audit.BASELINE, audit.INVENTORY)

    def result(self):
        return copy.deepcopy(self.bundle['S1-baseline.json'])

    def recompute(self, result, checks=None):
        return audit.recompute_derived(result, self.bundle['S1-signals.json'], 'baseline', checks or audit.Checks())

    def test_real_retained_bundle_audits_all_paths_without_promoting(self):
        with patch.object(socket, 'socket', side_effect=AssertionError('network forbidden')):
            report = audit.audit()
        self.assertEqual(report['exit_code'], 0)
        self.assertEqual(report['audit_status'], 'partial_derived_verified')
        self.assertEqual(len(report['artifacts']), 24)
        self.assertEqual(len(report['trials']), 15)
        self.assertEqual(report['coverage']['requested_panel'], audit.PANEL)
        self.assertEqual(len(report['coverage']['exclusions']), 3)
        self.assertEqual([r['strategy_id'] for r in report['blocked_hypotheses']], ['S5', 'S7'])
        self.assertEqual(len([r for r in report['trials'] if r['strategy'] == 'S4'
                              and r['recomputed']['metrics']['completed_trades'] == 0]), 3)
        self.assertTrue(any(r['recomputed']['metrics']['net_cagr'] < 0 for r in report['trials']))
        self.assertEqual(report['investment_validation'], 'failed_insufficient_evidence')
        self.assertFalse(report['promotion_eligible'])
        self.assertFalse(report['holdout_and_forward_checked'])
        self.assertTrue(report['submission_blocked'])
        self.assertEqual({row['status'] for row in report['unavailable']}, {'unavailable'})

    def test_input_allowlist_never_opens_normalized_holdout_or_code(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as temp:
            path = Path(temp) / 'artifact'
            shutil.copytree(audit.BASELINE, path)
            (path / 'holdout-2024.json').write_text('private holdout sentinel')
            (path / 'engine.py').write_text('raise RuntimeError("never execute artifact code")')
            reads = []
            original = audit.read_regular

            def observe(file, **kwargs):
                reads.append(Path(file).name)
                return original(file, **kwargs)

            with patch.object(audit, 'read_regular', side_effect=observe):
                report = audit.audit(path)
            self.assertEqual(report['exit_code'], 0)
            self.assertEqual(set(reads), set(audit.FILE_NAMES) | {audit.INVENTORY.name})

    def test_tampering_frozen_cost_or_result_bytes_fails_admission(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as temp:
            path = Path(temp) / 'artifact'
            shutil.copytree(audit.BASELINE, path)
            changed = self.result()
            changed['metrics']['net_cagr'] = 1.0
            (path / 'S1-baseline.json').write_bytes(audit.canonical(changed))
            report = audit.audit(path)
            self.assertEqual(report['exit_code'], 2)
            self.assertIn('frozen_artifact_hash_mismatch', report['admission_error'])
            self.assertEqual(report['trials'], [])

    def test_modified_inventory_cannot_bless_modified_results(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as temp:
            inventory = Path(temp) / 'inventory.json'
            entries = json.loads(audit.INVENTORY.read_bytes())
            entries['S1-baseline.json'] = 'a' * 64
            inventory.write_bytes(audit.canonical(entries))
            report = audit.audit(inventory=inventory)
            self.assertEqual(report['admission_error'], 'frozen_inventory_hash_mismatch')
            self.assertEqual(report['exit_code'], 2)

    def test_missing_or_symlink_artifact_cannot_become_verified(self):
        for mode in ('missing', 'symlink'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory(dir=TEMP_ROOT) as temp:
                path = Path(temp) / 'artifact'
                shutil.copytree(audit.BASELINE, path)
                target = path / 'S1-baseline.json'
                target.unlink()
                if mode == 'symlink':
                    target.symlink_to(audit.BASELINE / target.name)
                report = audit.audit(path)
                self.assertEqual(report['exit_code'], 2)
                self.assertFalse(report['promotion_eligible'])

    def test_symlink_in_any_input_ancestor_is_rejected(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as temp:
            alias = Path(temp) / 'alias'
            alias.symlink_to(audit.BASELINE.parent, target_is_directory=True)
            report = audit.audit(alias / audit.BASELINE.name)
            self.assertEqual(report['exit_code'], 2)
            self.assertEqual(report['admission_error'], 'input_ancestor_not_directory')
            self.assertEqual(report['artifacts'], [])
            alias.unlink()
            alias.symlink_to(audit.INVENTORY.parent, target_is_directory=True)
            self.assertEqual(audit.audit(inventory=alias / audit.INVENTORY.name)['exit_code'], 2)
            with self.assertRaisesRegex(ValueError, 'parent_path_traversal_refused'):
                audit.read_regular(alias / '..' / 'other.json')

    def test_ancestor_symlink_swap_between_stat_and_open_fails_closed(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as temp:
            parent = Path(temp) / 'parent'
            parent.mkdir()
            (parent / 'input').write_bytes(b'original')
            original_open = os.open
            replaced = False

            def racing_open(path, flags, *args, **kwargs):
                nonlocal replaced
                if path == 'parent' and kwargs.get('dir_fd') is not None and not replaced:
                    replaced = True
                    parent.rename(Path(temp) / 'old')
                    parent.symlink_to(Path(temp) / 'old', target_is_directory=True)
                return original_open(path, flags, *args, **kwargs)

            supported = os.supports_dir_fd | {racing_open}
            with patch.object(os, 'open', racing_open), patch.object(os, 'supports_dir_fd', supported):
                with self.assertRaises(OSError):
                    audit.read_regular(parent / 'input')
            self.assertTrue(replaced)

    def test_parent_rename_after_open_cannot_redirect_pinned_read(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as temp:
            parent, other = Path(temp) / 'parent', Path(temp) / 'other'
            parent.mkdir()
            other.mkdir()
            (parent / 'input').write_bytes(b'original')
            (other / 'input').write_bytes(b'redirected')
            original_read = audit.read_regular_at

            def redirect(name, descriptor):
                parent.rename(Path(temp) / 'old')
                parent.symlink_to(other, target_is_directory=True)
                return original_read(name, descriptor)

            with patch.object(audit, 'read_regular_at', side_effect=redirect):
                self.assertEqual(audit.read_regular(parent / 'input'), b'original')

    def test_ancestor_directory_identity_swap_is_rejected(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as temp:
            parent = Path(temp) / 'parent'
            parent.mkdir()
            (parent / 'input').write_bytes(b'original')
            original_open = os.open
            replaced = False

            def racing_open(path, flags, *args, **kwargs):
                nonlocal replaced
                if path == 'parent' and kwargs.get('dir_fd') is not None and not replaced:
                    replaced = True
                    parent.rename(Path(temp) / 'old')
                    parent.mkdir()
                    (parent / 'input').write_bytes(b'redirected')
                return original_open(path, flags, *args, **kwargs)

            supported = os.supports_dir_fd | {racing_open}
            with patch.object(os, 'open', racing_open), patch.object(os, 'supports_dir_fd', supported):
                with self.assertRaisesRegex(ValueError, 'input_ancestor_replaced'):
                    audit.read_regular(parent / 'input')
            self.assertTrue(replaced)

    def test_unsupported_runtime_refuses_before_audit_or_output_creation(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as temp:
            output = Path(temp) / 'new'
            with patch.object(os, 'supports_dir_fd', set()), patch.object(audit, 'audit') as run:
                with redirect_stdout(io.StringIO()) as captured:
                    code = audit.main(['--output', str(output)])
                run.assert_not_called()
                self.assertEqual(code, 2)
                message = json.loads(captured.getvalue())
                self.assertEqual(message['program_status'], 'unsupported_runtime')
                self.assertFalse(message['output_created'])
                with self.assertRaises(audit.UnsupportedRuntime):
                    audit.write_report(output, {})
            self.assertFalse(output.exists())

    def test_runtime_operation_probe_rejects_not_implemented_without_output(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as temp:
            output = Path(temp) / 'new'
            original_open = os.open

            def unsupported_open(path, flags, *args, **kwargs):
                if kwargs.get('dir_fd') is not None:
                    raise NotImplementedError('dir_fd unavailable')
                return original_open(path, flags, *args, **kwargs)

            supported = os.supports_dir_fd | {unsupported_open}
            with patch.object(os, 'open', unsupported_open), patch.object(os, 'supports_dir_fd', supported):
                with redirect_stdout(io.StringIO()) as captured:
                    self.assertEqual(audit.main(['--output', str(output)]), 2)
                self.assertEqual(json.loads(captured.getvalue())['program_status'], 'unsupported_runtime')
                self.assertFalse(output.exists())

    def test_strict_parser_rejects_duplicate_keys_nonfinite_and_size(self):
        for raw in (b'{"x":1,"x":2}', b'{"x":NaN}', b'{"x":Infinity}', b'{"x":1e999}'):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                audit.strict_json(raw)
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as temp:
            file = Path(temp) / 'large.json'
            file.write_bytes(b'12345')
            with patch.object(audit, 'MAX_BYTES', 4), self.assertRaisesRegex(ValueError, 'size_bound'):
                audit.read_regular(file)

    def test_sealed_dates_and_duplicate_curve_dates_are_rejected(self):
        for replacement in ('2024-01-02', '2023-02-30', self.result()['curve'][-2]['date']):
            with self.subTest(date=replacement):
                result = self.result()
                result['curve'][-1]['date'] = replacement
                with self.assertRaises(ValueError):
                    self.recompute(result)

    def test_boolean_numeric_values_and_negative_cash_fail(self):
        for value in (True, -1.0, float('nan')):
            with self.subTest(value=value):
                result = self.result()
                result['curve'][2]['cash'] = value
                with self.assertRaises(ValueError):
                    self.recompute(result)

    def test_metric_discrepancy_is_reported_instead_of_repaired(self):
        result = self.result()
        result['metrics']['net_cagr'] += .001
        checks = audit.Checks()
        self.recompute(result, checks)
        self.assertIn({'check': 'metric:net_cagr', 'status': 'failed'}, checks.rows)

    def test_cost_discrepancy_is_reported_and_assumption_change_is_rejected(self):
        result = self.result()
        result['metrics']['costs_twd']['commission'] += 1
        checks = audit.Checks()
        self.recompute(result, checks)
        self.assertIn({'check': 'cost:commission', 'status': 'failed'}, checks.rows)
        result['assumptions']['commission'] = 0
        with self.assertRaisesRegex(ValueError, 'unregistered_assumptions'):
            self.recompute(result)

    def test_same_session_signal_and_duplicate_fills_are_rejected(self):
        result = self.result()
        result['fills'][0]['signal_date'] = result['fills'][0]['date']
        with self.assertRaisesRegex(ValueError, 'buy_signal_or_recorded_session_invalid'):
            self.recompute(result)
        result = self.result()
        result['fills'].insert(1, copy.deepcopy(result['fills'][0]))
        with self.assertRaisesRegex(ValueError, 'duplicate_fill'):
            self.recompute(result)

    def test_missing_terminal_holding_or_duplicate_trade_is_rejected(self):
        result = self.result()
        result['open_positions'] = {}
        with self.assertRaisesRegex(ValueError, 'terminal_positions_missing'):
            self.recompute(result)
        result = self.result()
        result['trades'][1] = copy.deepcopy(result['trades'][0])
        with self.assertRaisesRegex(ValueError, 'completed_trade_fill_binding_invalid'):
            self.recompute(result)

    def test_report_is_private_bound_and_not_overwritten(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as temp:
            output = Path(temp) / 'new'
            report = audit.audit()
            receipt = audit.write_report(output, report)
            raw = (output / 'report.json').read_bytes()
            self.assertEqual(receipt['report_sha256'], hashlib.sha256(raw).hexdigest())
            self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o700)
            for name in ('report.json', 'receipt.json'):
                self.assertEqual(stat.S_IMODE((output / name).stat().st_mode), 0o600)
            self.assertFalse(receipt['submission_performed'])
            with self.assertRaises(FileExistsError):
                audit.write_report(output, report)
            self.assertEqual((output / 'report.json').read_bytes(), raw)
            link = Path(temp) / 'alias'
            link.symlink_to(output, target_is_directory=True)
            with self.assertRaises(FileExistsError):
                audit.write_report(link, report)

    def test_output_ancestor_symlink_is_refused_before_mkdir(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as temp:
            real, alias = Path(temp) / 'real', Path(temp) / 'alias'
            real.mkdir()
            alias.symlink_to(real, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, 'input_ancestor_not_directory'):
                audit.write_report(alias / 'output', {})
            self.assertFalse((real / 'output').exists())

    def test_failed_admission_still_has_a_truthful_immutable_receipt(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as temp:
            output = Path(temp) / 'failed'
            report = audit.audit(Path(temp) / 'missing')
            receipt = audit.write_report(output, report)
            self.assertEqual(receipt['program_exit_code'], 2)
            self.assertEqual(receipt['audit_status'], 'failed')
            self.assertEqual(receipt['investment_validation'], 'failed_insufficient_evidence')


if __name__ == '__main__':
    unittest.main()
