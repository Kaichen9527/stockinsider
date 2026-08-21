'use strict';

function assessReleaseCompatibility({schema,releaseIdentity,expectedConsumerSha,expectedRuntimeManifestSha,
  requiredMigration='provider-acquisition-v3.16.21'}){
  if(!['legacy-radar-v3.14.0','legacy-radar-v3.17.0'].includes(schema))return Object.freeze({compatible:false,reason:'legacy_schema'});
  if(!releaseIdentity||typeof releaseIdentity!=='object'||Array.isArray(releaseIdentity))
    return Object.freeze({compatible:false,reason:'identity_missing'});
  if(!/^[0-9a-f]{40}$/u.test(String(expectedConsumerSha??''))||releaseIdentity.producerCommitSha!==expectedConsumerSha)
    return Object.freeze({compatible:false,reason:'consumer_mismatch'});
  if(!/^[0-9a-f]{64}$/u.test(String(expectedRuntimeManifestSha??''))
    ||releaseIdentity.runtimeManifestSha256!==expectedRuntimeManifestSha)
    return Object.freeze({compatible:false,reason:'runtime_mismatch'});
  const expectedMigration=requiredMigration??(schema==='legacy-radar-v3.18.0'
    ?'candidate-ledger-retention-v3.18':'provider-acquisition-v3.16.21');
  if(releaseIdentity.migrationLevel!==expectedMigration)
    return Object.freeze({compatible:false,reason:'migration_mismatch'});
  return Object.freeze({compatible:true,reason:'compatible'});
}

module.exports={assessReleaseCompatibility};
