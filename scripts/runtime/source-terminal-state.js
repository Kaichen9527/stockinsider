'use strict';

const approvedSourceRoster = require('../../config/runtime/approved-source-roster-v3.13.json');
const { canonicalJson, invariant, sha256 } = require('./codec');
const { CONNECTOR_ATTEMPT, SOURCE_CONNECTORS } = require('./official-source-acquisition');

const SUCCESSFUL_ATTEMPTS = new Set(['items_found', 'successful_empty', 'metadata_only']);

// This is intentionally derived from the complete persisted connector-attempt
// plane.  A caller-supplied `totalOutage` boolean is not authority: production
// must prove that every approved profile/connector pair reached a terminal
// unavailable state before the publisher can suppress all cards.
function deriveSourceTerminalState(input) {
  if (input === null || input === undefined) return null;
  invariant(input?.schema === 'source-terminal-state-input-v3.20'
    && input.sourceAcquisitionSchema === 'official-source-acquisition-v3.20'
    && Array.isArray(input.connectorAttempts), 'source terminal state input');
  const expectedProfiles = approvedSourceRoster.profiles.map((profile) => profile.id).sort();
  const expectedKeys = expectedProfiles.flatMap((profileId) => SOURCE_CONNECTORS
    .map((sourceKey) => `${profileId}:${sourceKey}`)).sort();
  const attempts = input.connectorAttempts.map((row) => {
    invariant(row && typeof row === 'object' && !Array.isArray(row)
      && expectedProfiles.includes(row.profileId)
      && SOURCE_CONNECTORS.includes(row.sourceKey)
      && CONNECTOR_ATTEMPT.has(row.status)
      && typeof row.reasonCode === 'string' && /^[a-z0-9_]{2,80}$/u.test(row.reasonCode),
    'source terminal attempt');
    return Object.freeze({ profileId: row.profileId, sourceKey: row.sourceKey,
      status: row.status, reasonCode: row.reasonCode });
  }).sort((left, right) => left.profileId.localeCompare(right.profileId)
    || left.sourceKey.localeCompare(right.sourceKey));
  const observedKeys = attempts.map((row) => `${row.profileId}:${row.sourceKey}`);
  invariant(attempts.length === expectedKeys.length
    && canonicalJson(observedKeys) === canonicalJson(expectedKeys), 'source terminal attempt conservation');
  const successfulAttemptCount = attempts.filter((row) => SUCCESSFUL_ATTEMPTS.has(row.status)).length;
  const terminalStatus = successfulAttemptCount === 0 ? 'total_outage' : 'available';
  return Object.freeze({ schema: 'source-terminal-state-v3.20', terminalStatus,
    successfulAttemptCount, unavailableAttemptCount: attempts.length - successfulAttemptCount,
    terminalAttemptCount: attempts.length,
    acquisitionEvidenceRoot: sha256(canonicalJson(['source-terminal-state-v3.20', attempts])),
    blockers: terminalStatus === 'total_outage' ? Object.freeze(['approved_source_total_outage']) : Object.freeze([]) });
}

module.exports = { deriveSourceTerminalState };
