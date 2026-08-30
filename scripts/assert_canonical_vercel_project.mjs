const EXPECTED_PROJECT_ID = 'prj_cYNVwaGMMbgAeCnw6UqbIrLvlKYC';
const EXPECTED_PROJECT_NAME = 'stockinsider';
const EXPECTED_PRODUCTION_HOST = 'stockinsider-three.vercel.app';

if (process.env.VERCEL === '1') {
  const actualProjectId = String(process.env.VERCEL_PROJECT_ID || '');
  const actualProductionHost = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').replace(/^https?:\/\//u, '').replace(/\/$/u, '');
  if (actualProjectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`deployment_project_mismatch: expected ${EXPECTED_PROJECT_NAME}/${EXPECTED_PROJECT_ID}, received ${actualProjectId || 'missing'}`);
  }
  if (actualProductionHost !== EXPECTED_PRODUCTION_HOST) {
    throw new Error(`deployment_canonical_host_mismatch: expected ${EXPECTED_PRODUCTION_HOST}, received ${actualProductionHost || 'missing'}`);
  }
}
