'use strict';

const { bounded, immutableBundle, invariant, sha256 } = require('./codec');

function extractRevisionMentions({ revision, mentions, resolveInstrument }) {
  invariant(revision && revision.revisionId, 'frozen revision required');
  invariant(Array.isArray(mentions) && mentions.length <= 1000, 'mention bound');
  let linkedClaims = 0;
  const outcomes = mentions.map((mention, ordinal) => {
    let link;
    try {
      link = resolveInstrument(mention);
    } catch (error) {
      link = { disposition: 'source_resolution_failed', reason: error instanceof Error ? error.message : String(error) };
    }
    const claimEligible = link?.disposition === 'linked' && linkedClaims < 200;
    if (link?.disposition === 'linked') linkedClaims += 1;
    return {
      ordinal,
      raw: mention.raw,
      link,
      claimEligible,
      rejectionReason: link?.disposition === 'linked' && !claimEligible ? 'claim_cap_exceeded' : link?.disposition === 'linked' ? null : link?.disposition ?? 'unknown_link_outcome',
      claimId: sha256(`claim:${revision.revisionId}:${ordinal}:${mention.raw}`),
      mentionId: sha256(`mention:${revision.revisionId}:${ordinal}:${mention.raw}`),
    };
  });
  const claims = outcomes.filter((row) => row.claimEligible);
  const result = { revisionId: revision.revisionId, documentOutcome: 'parsed', claimCount: claims.length, mentionCount: outcomes.length, outcomes };
  bounded(result, 3 * 1024 * 1024, 'parse outcome');
  return Object.freeze({ ...result, parseOutcomeRoot: immutableBundle('parse_outcome_v3_11', outcomes).hash });
}

function writeRevisionEvidenceOutcomes(input) {
  return extractRevisionMentions(input);
}

module.exports = { extractRevisionMentions, writeRevisionEvidenceOutcomes };
