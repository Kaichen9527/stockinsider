"""Adversarial contract tests; synthetic mutations are never market evidence."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import socket
import stat
import tempfile
import unittest
from unittest.mock import patch

import artifact_audit as audit


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
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'artifact'
            shutil.copytree(audit.BASELINE, path)
            (path / 'holdout-2024.json').write_text('private holdout sentinel')
            (path / 'engine.py').write_text('raise RuntimeError("never execute artifact code")')
            reads = []
            original = audit.read_regular

            def observe(file):
                reads.append(Path(file).name)
                return original(file)

            with patch.object(audit, 'read_regular', side_effect=observe):
                report = audit.audit(path)
            self.assertEqual(report['exit_code'], 0)
            self.assertEqual(set(reads), set(audit.FILE_NAMES) | {audit.INVENTORY.name})

    def test_tampering_frozen_cost_or_result_bytes_fails_admission(self):
        with tempfile.TemporaryDirectory() as temp:
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
        with tempfile.TemporaryDirectory() as temp:
            inventory = Path(temp) / 'inventory.json'
            entries = json.loads(audit.INVENTORY.read_bytes())
            entries['S1-baseline.json'] = 'a' * 64
            inventory.write_bytes(audit.canonical(entries))
            report = audit.audit(inventory=inventory)
            self.assertEqual(report['admission_error'], 'frozen_inventory_hash_mismatch')
            self.assertEqual(report['exit_code'], 2)

    def test_missing_or_symlink_artifact_cannot_become_verified(self):
        for mode in ('missing', 'symlink'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as temp:
                path = Path(temp) / 'artifact'
                shutil.copytree(audit.BASELINE, path)
                target = path / 'S1-baseline.json'
                target.unlink()
                if mode == 'symlink':
                    target.symlink_to(audit.BASELINE / target.name)
                report = audit.audit(path)
                self.assertEqual(report['exit_code'], 2)
                self.assertFalse(report['promotion_eligible'])

    def test_strict_parser_rejects_duplicate_keys_nonfinite_and_size(self):
        for raw in (b'{"x":1,"x":2}', b'{"x":NaN}', b'{"x":Infinity}', b'{"x":1e999}'):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                audit.strict_json(raw)
        with tempfile.TemporaryDirectory() as temp:
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
        with tempfile.TemporaryDirectory() as temp:
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

    def test_failed_admission_still_has_a_truthful_immutable_receipt(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'failed'
            report = audit.audit(Path(temp) / 'missing')
            receipt = audit.write_report(output, report)
            self.assertEqual(receipt['program_exit_code'], 2)
            self.assertEqual(receipt['audit_status'], 'failed')
            self.assertEqual(receipt['investment_validation'], 'failed_insufficient_evidence')


if __name__ == '__main__':
    unittest.main()
