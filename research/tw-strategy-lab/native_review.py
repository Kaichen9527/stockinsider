"""Verify native GitHub contract-review receipts, never author-authored approval.

Supports a submitted review body OR that same reviewer's native inline comment.
The review commit and comment ORIGINAL commit bind the source. GitHub may retarget
comment.commit_id on later pushes, so that mutable field is never source authority.
No local JSON receipt can be supplied to the execution CLI. No release authority.
"""
from datetime import datetime, timezone
import hashlib
import re
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from replay_inputs import strict_json

BASE = 'https://api.github.com/repos/Kaichen9527/stockinsider'
PULL = BASE + '/pulls/284'
FREEZE = datetime(2026, 9, 25, 6, 48, 36, tzinfo=timezone.utc)
BOTS = {'chatgpt-codex-connector[bot]', 'copilot-pull-request-reviewer[bot]', 'Copilot'}
PATHS = {'research/tw-strategy-lab/proposals/robustness-study-v2.1.json',
         'research/tw-strategy-lab/proposals/robustness-study-v2.1-clarification-1.json'}


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def positive_id(value):
    return type(value) is int and value > 0


def timestamp(value, now):
    if not isinstance(value, str):
        raise ValueError('review_timestamp_invalid')
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if result.tzinfo is None or not FREEZE <= result <= now:
            raise ValueError('review_timestamp_invalid')
    except (ValueError, TypeError):
        raise ValueError('review_timestamp_invalid') from None
    return result


def verify(review, commit, proposal, clarification, now=None, comment=None):
    now = now or datetime.now(timezone.utc)
    marker = 'ROBUSTNESS_V2_1_ACCEPTED ' + proposal + ' ' + clarification
    if (not isinstance(commit, str) or not re.fullmatch('[0-9a-f]{40}', commit)
            or not isinstance(review, dict) or not isinstance(review.get('user'), dict)
            or not isinstance(review.get('body'), str) or not positive_id(review.get('id'))):
        raise ValueError('invalid_review_payload')
    user = review['user']
    eligible = ((user.get('type') == 'Bot' and user.get('login') in BOTS)
                or review.get('author_association') in {'OWNER', 'MEMBER', 'COLLABORATOR'})
    if (not eligible or user.get('login') == 'Kaichen9527' or review.get('commit_id') != commit
            or review.get('state') not in {'APPROVED', 'COMMENTED'}):
        raise ValueError('independent_exact_head_contract_acceptance_missing')
    timestamp(review.get('submitted_at'), now)
    receipt = {'id': review['id'], 'reviewer': user['login'], 'commit': commit,
               'submitted_at': review['submitted_at'], 'proposal_sha256': proposal,
               'clarification_sha256': clarification,
               'review_body_sha256': digest(review['body'].encode()), 'release_gate_authority': False}
    if comment is None:
        if marker not in review['body'].splitlines():
            raise ValueError('independent_exact_head_contract_acceptance_missing')
        return {**receipt, 'acceptance_location': 'review_body'}
    if (not isinstance(comment, dict) or not isinstance(comment.get('user'), dict)
            or not isinstance(comment.get('body'), str) or not positive_id(comment.get('id'))):
        raise ValueError('invalid_review_comment_payload')
    # Both objects are retrieved from fixed GitHub endpoints. Matching display
    # names alone is insufficient; preserve the native parent review and user ID.
    commenter = comment['user']
    if (not positive_id(user.get('id')) or not positive_id(commenter.get('id'))
            or not positive_id(comment.get('pull_request_review_id')) or commenter.get('id') != user['id']
            or commenter.get('login') != user['login'] or commenter.get('type') != user.get('type')
            or comment.get('pull_request_review_id') != review['id']
            or comment.get('pull_request_url') != PULL or review.get('pull_request_url') != PULL
            or comment.get('original_commit_id') != commit or comment.get('path') not in PATHS
            or comment.get('in_reply_to_id') is not None or marker not in comment['body'].splitlines()):
        raise ValueError('independent_exact_head_inline_acceptance_missing')
    created = timestamp(comment.get('created_at'), now)
    updated = timestamp(comment.get('updated_at'), now)
    if updated < created:
        raise ValueError('review_comment_timestamp_invalid')
    return {**receipt, 'acceptance_location': 'native_review_comment',
            'review_comment_id': comment['id'], 'review_comment_body_sha256': digest(comment['body'].encode()),
            'review_comment_original_commit': comment['original_commit_id'],
            'review_comment_created_at': comment['created_at'], 'review_comment_updated_at': comment['updated_at']}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('review_redirect_rejected')


def get(url):
    # Only these native endpoints, no redirects, cookies, credentials or files.
    if not re.fullmatch(re.escape(BASE) + r'/pulls/(?:284/reviews/[1-9][0-9]*|comments/[1-9][0-9]*)', url):
        raise ValueError('review_endpoint_invalid')
    request = Request(url, headers={'Accept': 'application/vnd.github+json',
                                  'User-Agent': 'StockInsider-contract-review-verifier/2'})
    with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=15) as response:
        if response.url != url or response.status != 200:
            raise ValueError('review_transport_invalid')
        raw = response.read(1024 * 1024 + 1)
    if len(raw) > 1024 * 1024:
        raise ValueError('review_response_bound')
    value = strict_json(raw)
    if not isinstance(value, dict):
        raise ValueError('review_response_shape')
    return value, raw


def fetch(review_id, commit, proposal, clarification, comment_id=None):
    if not positive_id(review_id) or (comment_id is not None and not positive_id(comment_id)):
        raise ValueError('review_id_required')
    if not isinstance(commit, str) or not re.fullmatch('[0-9a-f]{40}', commit):
        raise ValueError('review_commit_invalid')
    url = PULL + '/reviews/' + str(review_id)
    review, raw = get(url)
    if review.get('id') != review_id:
        raise ValueError('review_id_mismatch')
    comment, comment_raw, comment_url = None, None, None
    if comment_id is not None:
        comment_url = BASE + '/pulls/comments/' + str(comment_id)
        comment, comment_raw = get(comment_url)
        if comment.get('id') != comment_id:
            raise ValueError('review_comment_id_mismatch')
    receipt = {**verify(review, commit, proposal, clarification, comment=comment),
               'url': url, 'response_sha256': digest(raw), 'native_review_response_utf8': raw.decode('utf-8')}
    if comment is not None:
        receipt.update(review_comment_url=comment_url, review_comment_response_sha256=digest(comment_raw),
                       native_comment_response_utf8=comment_raw.decode('utf-8'))
    return receipt
