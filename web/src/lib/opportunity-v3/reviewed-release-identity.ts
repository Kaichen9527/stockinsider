const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;

type ReleaseIdentityEnvironment = {
  [key: string]: string | undefined;
  STOCKINSIDER_REVIEWED_RELEASE_SHA?: string;
  VERCEL_GIT_COMMIT_SHA?: string;
};

export function resolveReviewedConsumerCommitSha(
  environment: ReleaseIdentityEnvironment = process.env,
): string | null {
  for (const candidate of [
    environment.STOCKINSIDER_REVIEWED_RELEASE_SHA,
    environment.VERCEL_GIT_COMMIT_SHA,
  ]) {
    if (typeof candidate === 'string' && COMMIT_SHA_PATTERN.test(candidate)) return candidate;
  }
  return null;
}
