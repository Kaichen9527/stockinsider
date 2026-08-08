'use strict';

const { activateTrackedRuntimeRelease, validateRuntimeInstallationManifest } = require('./auth-source-worker-installation');

async function installTrackedAuthSourceWorker({ manifest, reviewedRelease, filesystem, scheduler, journal,
  activationAuthority, verifyActivationAuthority, install = false }) {
  if (install) {
    // Activation owns validation and staging.  Passing the enriched validation
    // result back as a manifest would violate the manifest's closed schema.
    return activateTrackedRuntimeRelease({ manifest, reviewedRelease, filesystem, scheduler, journal,
      activationAuthority, verifyActivationAuthority });
  }
  const validated = validateRuntimeInstallationManifest(manifest, reviewedRelease);
  await filesystem.stage(validated);
  await filesystem.verifyStaged(validated);
  return Object.freeze({ disposition: 'prepared', manifestSha256: validated.manifestSha256 });
}

module.exports = { installTrackedAuthSourceWorker };
