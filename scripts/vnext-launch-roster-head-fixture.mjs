import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

export const rosterHeadBaselinePath = 'migrations/20261115_vnext_launch_ranking_v1.sql';
export const rosterHeadMigrationPath = 'migrations/20261116_28_vnext_launch_roster_heads_v1.sql';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const internalHead = 'public.vnext_launch_instrument_v1(text,timestamptz)';

export function rosterHeadFixtureSql() {
  const baseline = read(rosterHeadBaselinePath);
  const startMarker = 'CREATE FUNCTION public.vnext_launch_instrument_v1(';
  const endMarker = 'CREATE FUNCTION public.vnext_launch_selected_score_v1(';
  assert.equal(baseline.split(startMarker).length, 2);
  assert.equal(baseline.split(endMarker).length, 2);
  const start = baseline.indexOf(startMarker);
  const end = baseline.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start);
  // Recreate only the reviewed predecessor and its original role grants in the
  // engineering database. The migration verifies the predecessor body itself.
  const predecessor = baseline.slice(start, end) + `
ALTER FUNCTION ${internalHead} OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION ${internalHead} FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION ${internalHead} TO stockinsider_vnext_owner;`;
  return {predecessor, migration:read(rosterHeadMigrationPath)};
}
