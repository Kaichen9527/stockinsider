import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';
import { runCandidateFinancialLocalParser } from './candidate-financial-local-parser.ts';

test('local parser fails closed until the reviewed VPS interpreter is configured', async () => {
  await assert.rejects(runCandidateFinancialLocalParser({
    bytes: new TextEncoder().encode('<xbrl/>'), documentSha256: createHash('sha256').update('<xbrl/>').digest('hex'),
    format: 'xbrl', pythonPath: '/not/a/reviewed/python',
  }), /candidate_financial_local_parser_not_configured/u);
});

test('Arelle adapter returns hash-bound XBRL context locators when the local dependency exists', async (context) => {
  const python = process.env.STOCKINSIDER_DOCUMENT_PARSER_PYTHON || '';
  const parserScriptPath = process.env.STOCKINSIDER_DOCUMENT_PARSER_SCRIPT || '';
  if (!python || !existsSync(python) || !parserScriptPath || !existsSync(parserScriptPath)) return context.skip('reviewed parser virtualenv is not configured');
  const repositoryRoot = process.cwd().endsWith('/web') ? resolve(process.cwd(), '..') : process.cwd();
  const bytes = new Uint8Array(await readFile(resolve(repositoryRoot, 'scripts/fixtures/candidate-financial-document-parser/minimal-instance.xbrl')));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const parsed = await runCandidateFinancialLocalParser({ bytes, documentSha256: sha256, format: 'xbrl', pythonPath: python, parserScriptPath, spawn });
  assert.equal(parsed.inputSha256, sha256);
  assert.equal(parsed.parser, 'arelle');
  assert.equal(parsed.locators.some((locator) => locator.xbrl_context === 'instant-2026q2'), true);
});

test('offline parser implementation retains its local-only boundaries', async () => {
  const repositoryRoot = process.cwd().endsWith('/web') ? resolve(process.cwd(), '..') : process.cwd();
  const source = await readFile(resolve(repositoryRoot, 'scripts/candidate_financial_document_parser.py'), 'utf8');
  const requirements = await readFile(resolve(repositoryRoot, 'scripts/requirements-candidate-financial-document-parser.txt'), 'utf8');
  assert.match(source, /controller\.webCache\.workOffline\s*=\s*True/u);
  assert.match(source, /socket\.create_connection\s*=\s*blocked/u);
  assert.match(source, /import pdfplumber/u);
  assert.match(source, /from arelle import Cntlr/u);
  assert.match(source, /controller[.]modelManager[.]validate\(\)/u);
  assert.match(requirements, /^arelle-release==2\.44\.7$/mu);
  assert.match(requirements, /^pdfplumber==0\.11\.8$/mu);
  assert.doesNotMatch(requirements, /^docling==/mu);
});

test('production adapter uses an isolated Unix socket instead of spawning under the web identity', async () => {
  const source = await readFile(new URL('./candidate-financial-local-parser.ts', import.meta.url), 'utf8');
  const unit = await readFile(new URL('../../../deployment/vps/systemd/stockinsider-financial-parser.service', import.meta.url), 'utf8');
  const socket = await readFile(new URL('../../../deployment/vps/systemd/stockinsider-financial-parser.socket', import.meta.url), 'utf8');
  assert.match(source, /candidate-financial-parser[.]sock/u);
  assert.match(unit, /DynamicUser=true/u);
  assert.match(unit, /PrivateNetwork=true/u);
  assert.match(unit, /ProtectSystem=strict/u);
  assert.doesNotMatch(unit, /EnvironmentFile=/u);
  assert.match(socket, /SocketMode=0660/u);
  assert.match(socket, /SocketGroup=stockinsider/u);
});
