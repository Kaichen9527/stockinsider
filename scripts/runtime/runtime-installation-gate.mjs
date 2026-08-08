import installer from './auth-source-worker-installer.js';
import reviewedRuntimeRelease from './reviewed-runtime-release.js';

export function runRuntimeInstallation(input) {
  const { repositoryRoot, sourceCommit, attestationCommit, ...installation } = input;
  if ('reviewedRelease' in installation) throw new Error('caller_reviewed_release_forbidden');
  const reviewedRelease = reviewedRuntimeRelease.resolveReviewedRuntimeRelease({
    repositoryRoot,
    sourceCommit,
    attestationCommit,
  });
  return installer.installTrackedAuthSourceWorker({ ...installation, reviewedRelease });
}
