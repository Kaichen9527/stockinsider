export type ReleaseCompatibility = { compatible:boolean; reason:'compatible'|'legacy_schema'|'identity_missing'|'consumer_mismatch'|'runtime_mismatch'|'migration_mismatch' };
export function assessReleaseCompatibility(input:{schema:string;releaseIdentity:unknown;expectedConsumerSha?:string;
  expectedRuntimeManifestSha?:string;requiredMigration?:string}):ReleaseCompatibility;
