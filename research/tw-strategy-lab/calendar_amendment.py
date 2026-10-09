"""One explicit, independently reviewed closure correction; never a date fallback.

The immutable raw dataset retains its original hash. Corrected in-memory actions
have a distinct digest. All original R1 equality expectations remain unchanged.
"""
import copy
import json
from pathlib import Path
from replay_inputs import read_bytes, digest, strict_json
from run_research import canonical
from action_calendar_audit import inspect_actions

PATH = Path(__file__).resolve().parent / 'proposals/action-calendar-amendment-v1.json'
SHA256 = 'df9113b7fd64fda6e8e7efd204d193c93a0cc70a8c6154d08f2088ff4936ed54'
MARKER = 'CALENDAR_AMENDMENT_ACCEPTED ' + SHA256


def load_amendment():
    raw=read_bytes(PATH)
    if digest(raw) != SHA256:
        raise ValueError('calendar_amendment_hash_mismatch')
    return strict_json(raw)


def verify_additional_acceptance(receipt):
    """Called only after live native_review.fetch has verified exact-head identity.

    Keep review/comment sources separate. Do not graft an author's explanatory
    text onto the actual reviewer response or reinterpret generic approval.
    """
    location=receipt.get('acceptance_location')
    if location=='native_review_comment':
        raw=receipt.get('native_comment_response_utf8'); expected=receipt.get('review_comment_response_sha256')
    elif location=='review_body':
        raw=receipt.get('native_review_response_utf8'); expected=receipt.get('response_sha256')
    else:
        raise ValueError('calendar_amendment_native_acceptance_required')
    if not isinstance(raw,str) or digest(raw.encode()) != expected:
        raise ValueError('calendar_amendment_review_receipt_mismatch')
    value=strict_json(raw)
    body=value.get('body') if isinstance(value,dict) else None
    if not isinstance(body,str) or MARKER not in body.splitlines():
        raise ValueError('calendar_amendment_explicit_acceptance_missing')
    return {'amendment_sha256':SHA256, 'acceptance_location':location,
            'review_id':receipt['id'], 'review_comment_id':receipt.get('review_comment_id'),
            'release_gate_authority':False}


def validate_and_apply(bars, actions, sessions, amendment):
    """Pure transformation; the execution CLI owns frozen-contract/live-review admission."""
    if digest(canonical(actions)) != amendment['original_included_actions_sha256']:
        raise ValueError('calendar_amendment_original_actions_mismatch')
    tx=amendment['transformation']
    symbol,old,new=tx['symbol'],tx['reported_session'],tx['effective_session']
    audit=inspect_actions(actions,sessions)
    expected_issue=(symbol,old,'action_not_on_calendar')
    if (len(audit['issues']) != 1 or
        tuple(audit['issues'][0][key] for key in ('symbol','reported_session','reason')) != expected_issue):
        raise ValueError('calendar_amendment_requires_exact_single_anomaly')
    issue=audit['issues'][0]
    if issue['previous_recorded_session'] != tx['previous_recorded_session'] or issue['next_recorded_session'] != new:
        raise ValueError('calendar_amendment_neighbor_sessions_mismatch')
    rows=actions.get(symbol,[])
    selected=[row for row in rows if row.get('session')==old]
    if len(selected)!=1 or canonical(selected[0])!=canonical(tx['original_event']) or any(row.get('session')==new for row in rows):
        raise ValueError('calendar_amendment_event_or_target_collision')
    proof=next(source['bounded_fact'] for source in amendment['source_receipts'] if source['id']=='twse-1216-prices')
    for session, fields in ((tx['previous_recorded_session'], {'close':proof['previous_close']}),
                            (new, {'open':proof['next_open'],'close':proof['next_close']})):
        prices=[row for row in bars.get(symbol,[]) if row.get('date')==session]
        if len(prices)!=1 or any(prices[0].get(key)!=value for key,value in fields.items()):
            raise ValueError('calendar_amendment_source_price_mismatch')
    corrected=copy.deepcopy(actions)
    selected=[row for row in corrected[symbol] if row['session']==old]
    selected[0]['session']=new
    corrected_hash=digest(canonical(corrected))
    if corrected_hash!=amendment['corrected_included_actions_sha256']:
        raise ValueError('calendar_amendment_corrected_actions_mismatch')
    if inspect_actions(corrected,sessions)['status']!='consistent':
        raise ValueError('calendar_amendment_unresolved_calendar')
    receipt={'schema':'action-calendar-overlay-receipt-v1','amendment_sha256':SHA256,
        'original_actions_sha256':amendment['original_included_actions_sha256'],
        'effective_actions_sha256':corrected_hash,'changed_events':1,'changed_fields':['session'],
        'symbol':symbol,'reported_session':old,'effective_session':new,
        'original_dataset_files_modified':False,'historical_collection_time_fabricated':False,
        'reconstructed_now':True,'original_R1_equality_requirements_unchanged':True}
    return corrected,receipt
