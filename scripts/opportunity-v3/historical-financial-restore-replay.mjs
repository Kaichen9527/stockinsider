import {SOURCE_SEED_MIGRATION,lockSatisfiedV320SourceSeed,verifySatisfiedV320SourceSeed} from './v320-source-seed-replay.mjs';
import {v320ConstraintReplays,lockV320Constraint,preserveV320Constraints,verifyV320Constraint} from './legacy-v320-constraint-replay.mjs';

export function historicalFinancialRestoreReplay(client) {
  const retainedChecks=new Map();
  let retainedSourceSeed=null;
  return {
    async assertRestoredBackend() {
      const result=await client.query(`SELECT (
        current_database()='t17_restored' AND inet_server_addr() IS NULL
        AND current_setting('listen_addresses')=''
      ) AS isolated`);
      if(result.rows[0]?.isolated!==true)throw new Error('historical_financial_restore_backend_required');
    },
    async migrationSql(migration) {
      for(const profile of v320ConstraintReplays) {
        if(migration.relativePath!==profile.firstMigration)continue;
        const oid=await lockV320Constraint(client,profile);
        if(oid!==null)retainedChecks.set(profile,oid);
      }
      if(migration.relativePath===SOURCE_SEED_MIGRATION) {
        retainedSourceSeed=await lockSatisfiedV320SourceSeed(client,migration);
        if(retainedSourceSeed)return null;
      }
      return preserveV320Constraints(migration,retainedChecks);
    },
    async verify() {
      for(const [profile,oid] of retainedChecks)await verifyV320Constraint(client,profile,oid);
      if(retainedSourceSeed)await verifySatisfiedV320SourceSeed(client,retainedSourceSeed);
      return Object.freeze(retainedSourceSeed?[SOURCE_SEED_MIGRATION]:[]);
    },
  };
}
