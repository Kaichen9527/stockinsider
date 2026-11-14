import {launchRankingEnabled} from './launch-ranking-read.ts';
/** Shared lowest-level legacy publication fence. Reads and historical rows
 * remain available; no writer/lease/source is created by this mode check. */
export function assertLegacyPublicationAllowed(){
  if(launchRankingEnabled())throw Error('launch_ranking_legacy_publication_forbidden');
}
