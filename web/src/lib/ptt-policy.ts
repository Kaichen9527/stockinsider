import type { SourceFetchFailureCode } from './source-fetch';

export function isExpectedPttArticleMissing(code: SourceFetchFailureCode) {
  return code === 'http_404' || code === 'http_410';
}
