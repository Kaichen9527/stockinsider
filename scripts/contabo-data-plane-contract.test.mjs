import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration=readFileSync(new URL('../migrations/20260911_contabo_data_plane_v1.sql',import.meta.url),'utf8');
const bootstrap=readFileSync(new URL('../deployment/vps/bootstrap-stockinsider-postgres.sql',import.meta.url),'utf8');
const service=readFileSync(new URL('../deployment/vps/systemd/stockinsider-postgrest.service',import.meta.url),'utf8');
const config=readFileSync(new URL('../deployment/vps/postgrest-stockinsider.conf',import.meta.url),'utf8');
const activation=readFileSync(new URL('../deployment/vps/activate-contabo-data-plane.sql',import.meta.url),'utf8');

test('portable bootstrap recreates required role names without a plaintext Vault shim',()=>{
  for(const role of ['anon','authenticated','service_role','authenticator','opportunity_v3_rpc_owner','legacy_correctness_rpc_owner','dashboard_user','stockinsider_runtime_v319'])
    assert.match(bootstrap,new RegExp(`'${role}'`,'u'));
  assert.doesNotMatch(bootstrap,/vault[.]decrypted_secrets|CREATE SCHEMA vault|PASSWORD\s+/iu);
  assert.match(bootstrap,/ALTER ROLE service_role BYPASSRLS/u);
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
  assert.match(migration,/generation=generation\+1,status='revoked'/u);
  assert.ok((migration.match(/ENABLE ROW LEVEL SECURITY/gu)??[]).length>=4);
  assert.match(migration,/FROM PUBLIC,anon,authenticated,service_role/u);
  assert.match(migration,/GRANT EXECUTE[\s\S]*TO service_role/u);
});

test('PostgREST is loopback-only and receives secrets through encrypted credentials',()=>{
  assert.match(config,/server-host = "127[.]0[.]0[.]1"/u);
  assert.match(config,/db-uri = "@\/run\/credentials/u);
  assert.match(service,/LoadCredentialEncrypted=database-uri:/u);
  assert.match(service,/LoadCredentialEncrypted=jwt-secret:/u);
  assert.match(service,/IPAddressDeny=any/u);
  assert.match(service,/IPAddressAllow=localhost/u);
  assert.doesNotMatch(service,/Environment=.*(?:PASSWORD|SECRET|TOKEN|URI)/u);
  assert.match(activation,/production_writer_releases[\s\S]*writer_kind='vps'/u);
  assert.match(activation,/internal_principal_role_is_exact_v3_internal/u);
  assert.match(activation,/identity_fence_enabled=true/u);
});
