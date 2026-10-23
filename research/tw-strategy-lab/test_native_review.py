"""Synthetic transport/identity tests; never create a real approval or run research."""
import copy
from datetime import datetime, timezone
import json
import unittest
from unittest.mock import patch
import native_review as n
import run_robustness as r


class NativeReviewTests(unittest.TestCase):
    def setUp(self):
        self.head = 'a' * 40
        self.now = datetime(2026, 9, 26, 1, tzinfo=timezone.utc)
        self.marker = 'ROBUSTNESS_V2_1_ACCEPTED ' + r.PROPOSAL_SHA256 + ' ' + r.CLARIFICATION_SHA256
        self.review = dict(id=123, user=dict(id=199175422, type='Bot', login='chatgpt-codex-connector[bot]'),
                           commit_id=self.head, state='COMMENTED', body='The native acceptance is inline.',
                           submitted_at='2026-09-25T15:22:29Z', pull_request_url=n.PULL)
        self.comment = dict(id=456, user=copy.deepcopy(self.review['user']), body=self.marker,
                            pull_request_review_id=123, original_commit_id=self.head, commit_id='b' * 40,
                            pull_request_url=n.PULL, path=sorted(n.PATHS)[0],
                            created_at='2026-09-25T15:22:30Z', updated_at='2026-09-25T15:22:30Z')

    def verify(self):
        return r.verify_review_payload(self.review, self.head, self.now, self.comment)

    def test_real_inline_shape_retains_both_distinct_bodies(self):
        result = self.verify()
        self.assertEqual(result['acceptance_location'], 'native_review_comment')
        self.assertEqual(result['review_body_sha256'], n.digest(self.review['body'].encode()))
        self.assertEqual(result['review_comment_body_sha256'], n.digest(self.marker.encode()))
        self.assertNotEqual(result['review_body_sha256'], result['review_comment_body_sha256'])
        self.assertFalse(result['release_gate_authority'])

    def test_retargeted_comment_does_not_authorize_new_head(self):
        # Native comment.commit_id may move when a PR is pushed; original does not.
        with self.assertRaises(ValueError):
            r.verify_review_payload(self.review, 'b' * 40, self.now, self.comment)
        self.assertEqual(self.verify()['commit'], self.head)

    def test_original_commit_cannot_be_missing_or_different(self):
        for value in (None, '', 'b' * 40):
            with self.subTest(value=value):
                self.comment['original_commit_id'] = value
                with self.assertRaises(ValueError): self.verify()

    def test_parent_review_must_be_native_matching_id(self):
        self.comment['pull_request_review_id'] = 124
        with self.assertRaises(ValueError): self.verify()

    def test_author_comment_never_authorizes_study(self):
        self.comment['user'] = dict(id=205199640, type='User', login='Kaichen9527')
        with self.assertRaises(ValueError): self.verify()

    def test_spoofed_bot_display_name_with_different_id_fails(self):
        self.comment['user']['id'] = 199175423
        with self.assertRaises(ValueError): self.verify()

    def test_commenter_and_reviewer_login_and_type_must_match(self):
        for key, value in (('login', 'Copilot'), ('type', 'User')):
            with self.subTest(key=key):
                self.comment['user'] = {**self.review['user'], key: value}
                with self.assertRaises(ValueError): self.verify()

    def test_dismissed_pending_or_changes_requested_review_fails(self):
        for state in ('DISMISSED', 'PENDING', 'CHANGES_REQUESTED'):
            with self.subTest(state=state):
                self.review['state'] = state
                with self.assertRaises(ValueError): self.verify()

    def test_wrong_repository_or_pr_cannot_supply_inline_acceptance(self):
        for field in ('review', 'comment'):
            with self.subTest(field=field):
                obj = getattr(self, field)
                obj['pull_request_url'] = n.BASE + '/pulls/228'
                with self.assertRaises(ValueError): self.verify()
                obj['pull_request_url'] = n.PULL

    def test_issue_comment_or_reply_not_review_acceptance(self):
        self.comment['in_reply_to_id'] = 99
        with self.assertRaises(ValueError): self.verify()

    def test_unrelated_file_or_missing_exact_marker_fails(self):
        for path in ('README.md', None):
            with self.subTest(path=path):
                self.comment['path'] = path
                with self.assertRaises(ValueError): self.verify()
        self.comment['path'] = sorted(n.PATHS)[0]
        self.comment['body'] = 'Not accepted: ' + self.marker
        with self.assertRaises(ValueError): self.verify()

    def test_contract_hash_substitution_fails(self):
        self.comment['body'] = self.marker.replace(r.CLARIFICATION_SHA256, 'f' * 64)
        with self.assertRaises(ValueError): self.verify()

    def test_invalid_or_future_comment_timestamps_fail(self):
        for value in ('2027-01-01T00:00:00Z', '2026-09-25T15:22:30', 'invalid', None):
            with self.subTest(value=value):
                self.comment['created_at'] = value
                with self.assertRaises(ValueError): self.verify()

    def test_timestamp_order_must_be_consistent(self):
        self.comment['updated_at'] = '2026-09-25T15:00:00Z'
        with self.assertRaises(ValueError): self.verify()

    def test_formal_review_body_path_still_requires_exact_marker(self):
        self.review['body'] = self.marker
        result = r.verify_review_payload(self.review, self.head, self.now)
        self.assertEqual(result['acceptance_location'], 'review_body')
        self.assertNotIn('review_comment_id', result)

    def test_fetch_retrieves_and_hashes_native_objects_separately(self):
        raw_review, raw_comment = (json.dumps(value).encode() for value in (self.review, self.comment))
        with patch.object(n, 'get', side_effect=[(self.review, raw_review), (self.comment, raw_comment)]) as get:
            result = r.fetch_contract_review(123, self.head, 456)
        self.assertEqual([c.args[0] for c in get.call_args_list], [n.PULL + '/reviews/123', n.BASE + '/pulls/comments/456'])
        self.assertEqual(result['response_sha256'], n.digest(raw_review))
        self.assertEqual(result['review_comment_response_sha256'], n.digest(raw_comment))

    def test_invalid_review_or_comment_id_never_contacts_network(self):
        for rid, cid in ((True, 1), (1, True), (0, 1), (1, 0), ('1', 1), (1, '../2')):
            with self.subTest(rid=rid,cid=cid), patch.object(n, 'get') as get:
                with self.assertRaises(ValueError): r.fetch_contract_review(rid, self.head, cid)
                get.assert_not_called()

    def test_wrong_native_object_id_fails_even_with_good_text(self):
        for wrong_review, wrong_comment in ((True, False), (False, True)):
            review, comment = copy.deepcopy(self.review), copy.deepcopy(self.comment)
            if wrong_review: review['id'] = 124
            if wrong_comment: comment['id'] = 457
            with patch.object(n, 'get', side_effect=[(review, b'review'), (comment, b'comment')]):
                with self.assertRaises(ValueError): r.fetch_contract_review(123, self.head, 456)

    def test_untrusted_endpoints_are_rejected_before_network(self):
        for url in ('file:///tmp/receipt.json', n.BASE + '/issues/284/comments', n.PULL + '/reviews/123?token=secret', 'https://evil.example/123'):
            with self.subTest(url=url), patch.object(n, 'build_opener') as opener:
                with self.assertRaises(ValueError): n.get(url)
                opener.assert_not_called()

    def test_redirect_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'review_redirect_rejected'):
            n.NoRedirect().redirect_request(None, None, None, None, None, 'https://evil.example')

    def test_boolean_native_ids_and_missing_user_id_rejected(self):
        for field, target in (('id', self.review), ('id', self.comment), ('id', self.review['user'])):
            previous = target[field]; target[field] = True
            with self.subTest(target=target), self.assertRaises(ValueError): self.verify()
            target[field] = previous

if __name__ == '__main__':
    unittest.main()
