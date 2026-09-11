export const VPS_HOST = '5.104.83.211';
const STANDARD_RELEASE_PATH = /^\/opt\/([a-z0-9._-]+)\/releases\/([A-Za-z0-9._-]+)$/;
const APPROVED_LEGACY_RELEASE_PATH = /^\/opt\/(minday-admin-console)-releases\/([A-Za-z0-9._-]+)$/;

export function validateReleaseExportInput({ host, releasePath }) {
  if (host !== VPS_HOST) throw new Error('vps_host_not_allowed');
  const match = STANDARD_RELEASE_PATH.exec(releasePath || '')
    || APPROVED_LEGACY_RELEASE_PATH.exec(releasePath || '');
  if (!match) throw new Error('explicit_absolute_release_path_required');
  return { application: match[1], release: match[2] };
}
