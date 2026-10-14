import {assertPublicationTailSelection,TAIL_ORDERED_SHA256}from './research-publication-tail-extraction.mjs';
import {assertPublicationTailPredecessor}from './research-publication-tail-entry-guard.mjs';
import {migrationBodyInAtomicTransaction}from './atomic-migration-chain.mjs';
import {assertResearchPublicationCatalog}from './research-publication-catalog.mjs';
import {verifyFinancialHistoryPostconditions}from './financial-history-install-guard.mjs';
export const TAIL_SHARED_LOCK="SELECT pg_try_advisory_lock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0)) AS locked";
const unlock="SELECT pg_advisory_unlock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0))";
/** Exclusive injected engineering client only; no connection/CLI/attestation/production authorization. */
export async function applyPublicationTailToEngineeringClient(client,rows){
 let locked=false,open=false,primary;
 try{
  // Materialize immutable SQL strings before the first query; caller buffers cannot change later.
  if(!Array.isArray(rows))throw Error('publication_tail_selection_invalid');
  const owned=rows.map(r=>{const {relativePath,sha256,bytes}=r;if(!Buffer.isBuffer(bytes))throw Error('publication_tail_selection_invalid');return{relativePath,sha256,bytes:Buffer.from(bytes)};});
  const bodies=assertPublicationTailSelection(owned).map(r=>({path:r.relativePath,sql:migrationBodyInAtomicTransaction(r.bytes.toString('utf8'))}));
  if((await client.query(TAIL_SHARED_LOCK)).rows?.[0]?.locked!==true)throw Error('publication_tail_install_busy');locked=true;
  await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');open=true;
  await client.query("SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s'");
  const predecessor=await assertPublicationTailPredecessor(client);
  for(const body of bodies)await client.query(body.sql);
  const installed=await assertResearchPublicationCatalog(client,'installed');
  await verifyFinancialHistoryPostconditions(client);
  await client.query('COMMIT');open=false;
  return Object.freeze({status:'committed',engineeringOnly:true,productionAuthorized:false,tailOrderedSha256:TAIL_ORDERED_SHA256,steps:26,predecessor,installed});
 }catch(e){primary=e;throw e;}finally{
  if(open)try{await client.query('ROLLBACK');}catch(e){if(primary)primary.cleanupIncomplete=true;}
  if(locked)try{await client.query(unlock);}catch(e){if(primary)primary.cleanupIncomplete=true;}
  try{await client.end();}catch(e){if(primary)primary.cleanupIncomplete=true;else throw e;}
 }
}
