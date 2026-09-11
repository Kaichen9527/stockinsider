import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOHO_IMAGE_POLICY_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../deployment/vps/soho-image-retention-policy.json');
export const SOHO_VPS_HOST = '5.104.83.211';
const REF = /^soho(?:-rollback\/soho)?-[a-z0-9-]+:(?:latest|\d{8}T\d{6}Z)$/u;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/u;

export const canonical = value => value && typeof value === 'object'
  ? Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  : JSON.stringify(value);

const exactMap = (value, count, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== count) throw new Error(`${label}_invalid`);
  for (const [ref, id] of Object.entries(value)) {
    if (!REF.test(ref) || !IMAGE_ID.test(id)) throw new Error(`${label}_identity_invalid`);
  }
};

export function validateSohoImagePolicy(policy) {
  if (policy?.schema !== 'stockinsider-soho-image-retention-v1' || policy.host !== SOHO_VPS_HOST
    || typeof policy.policy !== 'string' || !policy.policy.includes('Broad prune is forbidden')) {
    throw new Error('soho_image_policy_invalid');
  }
  exactMap(policy.current, 13, 'soho_current');
  exactMap(policy.retainedRollbacks, 21, 'soho_retained_rollbacks');
  exactMap(policy.obsoleteCandidates, 11, 'soho_obsolete_candidates');
  const groups = [policy.current, policy.retainedRollbacks, policy.obsoleteCandidates];
  const refs = groups.flatMap(group => Object.keys(group));
  if (new Set(refs).size !== refs.length) throw new Error('soho_policy_ref_overlap');
  const protectedIds = new Set([...Object.values(policy.current), ...Object.values(policy.retainedRollbacks)]);
  if (Object.values(policy.obsoleteCandidates).some(id => protectedIds.has(id))) {
    throw new Error('soho_candidate_image_is_protected');
  }
  return { policy, policySha256: createHash('sha256').update(canonical(policy)).digest('hex'),
    candidateRefs: Object.keys(policy.obsoleteCandidates).sort(),
    protectedRefs: [...Object.keys(policy.current), ...Object.keys(policy.retainedRollbacks)].sort() };
}

export async function loadSohoImagePolicy() {
  return validateSohoImagePolicy(JSON.parse(await readFile(SOHO_IMAGE_POLICY_PATH, 'utf8')));
}
