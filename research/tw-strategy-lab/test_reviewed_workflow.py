"""Exercise the workflow's real shell argv without running a study or network."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / '.github/workflows/reviewed-robustness.yml'


def execution_step():
    text = WORKFLOW.read_text()
    start = text.index('      - name: Execute exactly the reviewed finite R1-R4 paths\n')
    end = text.index('      - name: Retain real outcomes', start)
    step = text[start:end]
    body = textwrap.dedent(step.split('        run: |\n', 1)[1])
    return step, body


class ReviewedWorkflowTests(unittest.TestCase):
    def invoke_shell(self, comment_id):
        _, shell = execution_step()
        with tempfile.TemporaryDirectory(prefix='workflow contract with spaces ') as tmp:
            root = Path(tmp)
            spy = root / 'python'
            spy.write_text('#!' + sys.executable + '\n' +
                           'import json, os, sys\n' +
                           'with open(os.environ["ARG_LOG"], "a") as f:\n' +
                           ' f.write(json.dumps(sys.argv[1:]) + "\\n")\n')
            spy.chmod(0o700)
            log = root / 'argv.jsonl'
            env = {'PATH': str(root) + os.pathsep + '/usr/bin:/bin',
                   'RUNNER_TEMP': str(root), 'REVIEW_ID': '5324139141',
                   'REVIEW_COMMENT_ID': comment_id, 'ARG_LOG': str(log)}
            result = subprocess.run(['/bin/bash', '-euo', 'pipefail', '-c', shell],
                                    env=env, capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            calls = [json.loads(line) for line in log.read_text().splitlines()]
            self.assertEqual(len(calls), 1, 'Only one finite runner invocation is allowed')
            args = calls[0]
            self.assertEqual(args.count('--execute'), 1)
            self.assertEqual(args.count('--apply-reviewed-calendar-amendment'), 1)
            self.assertEqual(args[args.index('--data') + 1],
                             str(root / 'frozen-replay-inputs/replay-recovery'))
            self.assertEqual(args[args.index('--output') + 1],
                             str(root / 'robustness-evidence/execution'))
            self.assertEqual(args[args.index('--review-id') + 1], '5324139141')
            self.assertNotIn('--skip-review', args)
            self.assertNotIn('--force', args)
            return args

    def test_native_inline_review_id_preserved(self):
        args = self.invoke_shell('4109827781')
        self.assertEqual(args[args.index('--review-comment-id') + 1], '4109827781')

    def test_submitted_review_without_inline_comment(self):
        args = self.invoke_shell('')
        self.assertNotIn('--review-comment-id', args)

    def test_execution_is_gated_and_not_implicitly_retriggered_by_review(self):
        step, _ = execution_step()
        self.assertIn("if: steps.admission.outputs.execute == 'true'", step)
        trigger = WORKFLOW.read_text().split('permissions:', 1)[0]
        self.assertNotIn('pull_request_review:', trigger)
        self.assertNotIn('issue_comment:', trigger)
        self.assertIn('types: [opened, synchronize, reopened]', trigger)


if __name__ == '__main__':
    unittest.main()
