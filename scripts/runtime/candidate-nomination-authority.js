'use strict';

// Candidate nomination is intentionally narrower than enrichment authority.
// Official exchange data can verify a KOL-nominated company, but it cannot
// itself make a company appear in the research funnel.
const NOMINATION_AUTHORITIES = Object.freeze(new Set([
  'approved_kol_transcript',
  'approved_kol_threads_api',
  'public_telegram_channel',
  'investanchors_structured_claim',
  'research_inbox_rights_attested',
]));

const SOURCE_KEY_AUTHORITIES = Object.freeze({
  threads: 'approved_kol_threads_api',
  podcast: 'approved_kol_transcript',
  youtube: 'approved_kol_transcript',
  telegram: 'public_telegram_channel',
  investanchors: 'investanchors_structured_claim',
  research_inbox: 'research_inbox_rights_attested',
});

function nominationAuthorityForSource({ sourceKey, structuredClaim = false, rightsAttested = false } = {}) {
  const key = String(sourceKey ?? '');
  const authority = SOURCE_KEY_AUTHORITIES[key] ?? null;
  if (!authority) return null;
  // Public Telegram channels are a first-class public source.  Only paid or
  // otherwise permissioned material needs the explicit structured-claim
  // attestation; private Telegram channels never enter acquisition at all.
  if ((key === 'investanchors' || key === 'research_inbox') && !(structuredClaim && rightsAttested)) return null;
  return authority;
}

function hasCandidateNominationAuthority(outcome) {
  const declared = typeof outcome?.nominationAuthority === 'string' ? outcome.nominationAuthority : null;
  if (!declared || !NOMINATION_AUTHORITIES.has(declared)) return false;
  return declared === nominationAuthorityForSource({
    sourceKey: outcome?.sourceKey,
    structuredClaim: outcome?.structuredClaim === true,
    rightsAttested: outcome?.rightsAttested === true,
  }) || (['approved_kol_transcript', 'approved_kol_threads_api'].includes(declared)
    && declared === SOURCE_KEY_AUTHORITIES[String(outcome?.sourceKey ?? '')]);
}

function nominationRejectionReason(outcome) {
  return hasCandidateNominationAuthority(outcome) ? null : 'nomination_authority_revoked';
}

module.exports = { NOMINATION_AUTHORITIES, SOURCE_KEY_AUTHORITIES, nominationAuthorityForSource,
  hasCandidateNominationAuthority, nominationRejectionReason };
