import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration=readFileSync(new URL('../migrations/20260911_contabo_data_plane_v1.sql',import.meta.url),'utf8');
const bootstrap=readFileSync(new URL('../deployment/vps/bootstrap-stockinsider-postgres.sql',import.meta.url),'utf8');
const service=readFileSync(new URL('../deployment/vps/systemd/stockinsider-postgrest.service',import.meta.url),'utf8');
const webService=readFileSync(new URL('../deployment/vps/systemd/stockinsider-web-standalone.service',import.meta.url),'utf8');
const config=readFileSync(new URL('../deployment/vps/postgrest-stockinsider.conf',import.meta.url),'utf8');
const nginx=readFileSync(new URL('../deployment/vps/nginx/stockinsider-postgrest-loopback.conf',import.meta.url),'utf8');
const installer=readFileSync(new URL('../deployment/vps/install-contabo-data-plane.sh',import.meta.url),'utf8');
const activation=readFileSync(new URL('../deployment/vps/activate-contabo-data-plane.sql',import.meta.url),'utf8');
const acquisition=readFileSync(new URL('../web/src/lib/candidate-financial-document-acquisition.ts',import.meta.url),'utf8');
const provisioner=readFileSync(new URL('../deployment/vps/provision-contabo-data-plane-credentials.mjs',import.meta.url),'utf8');
const health=readFileSync(new URL('../web/src/app/api/internal/health-check/route.ts',import.meta.url),'utf8');
const localProvisioner=readFileSync(new URL('./provision-contabo-data-plane-credentials.mjs',import.meta.url),'utf8');
const cutover=readFileSync(new URL('../deployment/vps/activate-contabo-cutover.sh',import.meta.url),'utf8');
const schedules=readFileSync(new URL('../deployment/vps/install-systemd-schedules.sh',import.meta.url),'utf8');
const writerActivation=readFileSync(new URL('../web/src/app/api/internal/writer-release-activate/route.ts',import.meta.url),'utf8');

test('portable bootstrap recreates required role names without a plaintext Vault shim',()=>{
  for(const role of ['anon','authenticated','service_role','authenticator','opportunity_v3_rpc_owner','legacy_correctness_rpc_owner','dashboard_user','stockinsider_runtime_v319'])
    assert.match(bootstrap,new RegExp(`'${role}'`,'u'));
  assert.doesNotMatch(bootstrap,/vault[.]decrypted_secrets|CREATE SCHEMA vault/iu);
  assert.doesNotMatch(bootstrap,/PASSWORD\s+(?!NULL\b)/u);
  assert.match(bootstrap,/ALTER ROLE service_role BYPASSRLS/u);
  assert.match(bootstrap,/CREATE ROLE stockinsider LOGIN NOINHERIT NOSUPERUSER/u);
  assert.match(bootstrap,/ALTER ROLE stockinsider LOGIN NOINHERIT NOSUPERUSER/u);
  assert.match(bootstrap,/PASSWORD NULL CONNECTION LIMIT 20/u);
  assert.match(bootstrap,/GRANT anon, authenticated, service_role TO stockinsider/u);
  assert.match(bootstrap,/CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions/u);
});

test('Contabo migration is additive, RLS guarded and generation-CAS protected',()=>{
  assert.doesNotMatch(migration,/DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE/u);
  assert.doesNotMatch(migration,/vault[.]|decrypted_secrets/u);
  assert.match(migration,/identity_fence_enabled boolean NOT NULL DEFAULT false/u);
  assert.match(migration,/request[.]jwt[.]claims/u);
  assert.match(migration,/x-stockinsider-backend-id/u);
  assert.match(migration,/internal_principal_role_is_exact_v3_internal/u);
  assert.match(migration,/provider_credential_generation_conflict/u);
  assert.match(migration,/activate_stockinsider_backend_release_v1/u);
  assert.match(migration,/PERFORM public[.]register_production_writer_release/u);
  assert.match(migration,/generation=generation\+1,status='revoked'/u);
  assert.ok((migration.match(/ENABLE ROW LEVEL SECURITY/gu)??[]).length>=4);
  assert.match(migration,/FROM PUBLIC,anon,authenticated,service_role/u);
  assert.match(migration,/GRANT EXECUTE[\s\S]*TO service_role/u);
});

test('PostgREST is loopback-only and receives secrets through encrypted credentials',()=>{
  assert.match(config,/server-host = "127[.]0[.]0[.]1"/u);
  assert.match(config,/db-uri = "@\/run\/credentials/u);
  assert.match(config,/db-pool = 10/u);
  assert.match(service,/LoadCredentialEncrypted=database-uri:/u);
  assert.match(service,/LoadCredentialEncrypted=jwt-secret:/u);
  assert.match(service,/Requires=postgresql@17-stockinsider[.]service/u);
  assert.match(service,/IPAddressDeny=any/u);
  assert.match(service,/IPAddressAllow=localhost/u);
  assert.doesNotMatch(service,/Environment=.*(?:PASSWORD|SECRET|TOKEN|URI)/u);
  assert.match(webService,/LoadCredentialEncrypted=postgrest-service-role[.]jwt:/u);
  assert.match(webService,/LoadCredentialEncrypted=provider-secrets-v1[.]key:/u);
  assert.match(webService,/EnvironmentFile=\/etc\/stockinsider\/data-plane[.]env/u);
  assert.match(webService,/Requires=stockinsider-postgrest[.]service/u);
  assert.match(webService,/ReadWritePaths=\/var\/lib\/stockinsider\/artifacts/u);
  assert.doesNotMatch(webService,/StateDirectory=stockinsider(?:\n|$)/u);
  assert.doesNotMatch(webService,/Environment=.*(?:PASSWORD|SECRET|TOKEN|URI)/u);
  assert.match(nginx,/listen 127[.]0[.]0[.]1:3302/u);
  assert.match(nginx,/location \/rest\/v1\//u);
  assert.match(nginx,/proxy_pass http:\/\/127[.]0[.]0[.]1:3301\//u);
  assert.match(nginx,/location \/[\s\S]*return 404/u);
  assert.doesNotMatch(nginx,/listen\s+(?:0[.]0[.]0[.]0:)?3302|listen\s+3302/u);
  assert.match(installer,/nginx -t/u);
  assert.match(installer,/data-plane[.]env/u);
  assert.match(installer,/install -d -o stockinsider -g stockinsider -m 0700 \/var\/lib\/stockinsider\/artifacts/u);
  assert.doesNotMatch(installer,/systemctl (?:start|restart|enable(?: --now)?) stockinsider-(?:postgrest|web)/u);
  for(const name of ['stockinsider-postgrest-database-uri','stockinsider-postgrest-jwt-secret',
    'stockinsider-postgrest-service-role-jwt','stockinsider-provider-secrets-v1-key'])
    assert.match(installer,new RegExp(name,'u'));
  assert.match(activation,/production_writer_releases[\s\S]*writer_kind='vps'/u);
  assert.match(activation,/internal_principal_role_is_exact_v3_internal/u);
  assert.match(activation,/identity_fence_enabled=true/u);
  assert.match(provisioner,/credential payload on stdin/u);
  assert.match(provisioner,/\['encrypt', `--name=\$\{credentialName\}`/u);
  assert.match(provisioner,/\['decrypt', `--name=\$\{credentialName\}`/u);
  assert.match(provisioner,/data-plane[.]env/u);
  assert.doesNotMatch(provisioner,/process[.]argv.*(?:jwt|secret|token)|console[.]log\([^)]*(?:jwtSecret|providerSecretsKey|serviceRoleJwt)/iu);
  assert.match(health,/DATA_PLANE_MODE: dataPlaneMode/u);
  assert.match(health,/DATA_PLANE_CONFIGURED:/u);
  assert.match(health,/STOCKINSIDER_POSTGREST_URL === 'http:\/\/127[.]0[.]0[.]1:3302\/'/u);
  assert.match(localProvisioner,/writeEncryptedBackupArtifact/u);
  assert.match(localProvisioner,/remoteInput/u);
  assert.match(localProvisioner,/\['pipe', 'pipe', 'pipe'\]/u);
  assert.doesNotMatch(localProvisioner,/console[.]log\([^)]*(?:jwtSecret|providerSecretsKey|serviceRoleJwt)/u);
  assert.match(cutover,/activate-contabo-data-plane[.]sql/u);
  assert.match(cutover,/systemctl enable --now "\$postgrest_service"/u);
  assert.match(cutover,/systemctl enable --now "\$web_service"/u);
  assert.match(cutover,/api\/radar\/daily/u);
  assert.ok(cutover.indexOf('systemctl stop "$legacy_service"') < cutover.indexOf('systemctl enable --now "$web_service"'));
  assert.match(schedules,/stockinsider-web-standalone[.]service/u);
  assert.match(schedules,/STOCKINSIDER_DATA_PLANE=contabo/u);
  assert.doesNotMatch(schedules,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_PROJECT_REF/u);
  assert.match(writerActivation,/activate_stockinsider_backend_release_v1/u);
  assert.doesNotMatch(writerActivation,/register_production_writer_release[\s\S]*activate_stockinsider_backend_release_v1/u);
});

test('every official financial-document write uses the portable immutable artifact boundary',()=>{
  assert.match(acquisition,/putCandidateFinancialArtifact/u);
  assert.doesNotMatch(acquisition,/[.]storage[.]from/u);
});
