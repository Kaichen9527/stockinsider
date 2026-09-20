import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const prefix = '/preview/auo-2409-assets';
const server = readFileSync(path.join(root, 'server.js'), 'utf8');
const required = JSON.parse(readFileSync(path.join(root, '.next/required-server-files.json'), 'utf8'));

assert.match(server, /"assetPrefix":"\/preview\/auo-2409-assets"/u,
  'standalone server must embed the AUO preview asset prefix at build time');
assert.equal(required.config?.assetPrefix, prefix,
  'standalone config must retain the isolated static namespace');
process.stdout.write('AUO preview artifact verified\n');
