'use strict';

const { selectBiasTechnicalHistory } = require('./bias-technical-history');
const { buildBiasUniverseManifest } = require('./bias-universe-manifest');

function buildFactorSnapshot({ stockId, history, asOf, roster, histories }) {
  const own = selectBiasTechnicalHistory({ rows: history, asOf });
  if (own.availability !== 'available') return own;
  const manifest = buildBiasUniverseManifest({ roster, histories });
  if (manifest.availability !== 'available') return manifest;
  return Object.freeze({ availability: 'available', stockId, asOf, own, manifest, factorContractVersion: 'v3.11.3' });
}

module.exports = { buildFactorSnapshot };
