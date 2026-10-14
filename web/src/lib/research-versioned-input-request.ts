// Original15d4 ten-key parser; new module identity, unchanged request contract.
import {completeEnsure as ensure,completeCanonical} from './research-v3-material-canonical.ts';
type Row=Record<string,unknown>;
export type CompleteRequest={owner:string;jobId:string;attempt:number;reservationId:string;scope:'research_observed_v1';snapshotHash:string;preparationId:string;preparationHash:string;expectedArtifactManifestHash:string;expectedCalculatorExecutionHash:string};
const keys=['owner','jobId','attempt','reservationId','scope','snapshotHash','preparationId','preparationHash','expectedArtifactManifestHash','expectedCalculatorExecutionHash'];
export function parseCompleteRequest(value:unknown):CompleteRequest {
 ensure(value&&typeof value==='object'&&!Array.isArray(value));const v=value as Row;
 ensure(Object.keys(v).sort().join(',')===keys.slice().sort().join(',')&&v.scope==='research_observed_v1'&&typeof v.owner==='string'&&/^[A-Za-z0-9:_-]{3,120}$/u.test(v.owner)&&Number.isInteger(v.attempt)&&Number(v.attempt)>=1&&Number(v.attempt)<=3);
 for(const key of ['jobId','reservationId','preparationId'])ensure(typeof v[key]==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v[key]));
 for(const key of ['snapshotHash','preparationHash','expectedArtifactManifestHash','expectedCalculatorExecutionHash'])ensure(typeof v[key]==='string'&&/^[a-f0-9]{64}$/u.test(v[key]));
 completeCanonical(v);return v as CompleteRequest;
}
