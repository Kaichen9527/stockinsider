'use strict';

const { RunnerError, assert } = require('./artifacts');
const { parseJsonWithNoDuplicateKeys, canonicalJson, sha256, validScalarString } = require('./canonicalJson');

const TOP_LEVEL_KEYS = ['protocol', 'checkpoint', 'changeId', 'base', 'inputHead', 'defaultStrategy', 'tasks'];
const TASK_KEYS = ['id', 'sequence', 'assurance', 'dependsOn', 'task', 'acceptanceCriteria', 'allowedPaths', 'inspectionPaths', 'promptFiles', 'timeLimits'];
const CHANGE_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const OID = /^[0-9a-f]{40}$/;
const FORBIDDEN_COMPONENT = /^(?:.*[._-])?(?:agent|agents|codex|mcp|plugin|plugins|hook|hooks|skill|skills|rule|rules|config|configuration|secret|secrets|credential|credentials|token|tokens|api[-_]?key|private[-_]?key|certificate|certificates|cert|certs|keystore|shell[-_]?snapshot)(?:[._-].*)?$/;
const FORBIDDEN_EXACT = new Set(['.git', '.agent', '.agents', '.codex', '.mcp', '.plugin', '.plugins', '.hook', '.hooks', '.skill', '.skills', 'node_modules', '.next', '.turbo', '.cache', 'coverage', 'dist', 'build', '.vercel', 'secret', 'secrets', '.secret', '.secrets', 'credential', 'credentials', '.credential', '.credentials', 'cert', 'certs', 'certificate', 'certificates', 'key', 'keys', 'token', 'tokens']);

function sortedUnique(values) {
  return Array.isArray(values) && values.every((item, index) => typeof item === 'string' && (index === 0 || values[index - 1] < item));
}

function exactKeys(value, keys) {
  return value && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function pathForbidden(path) {
  const components = path.split('/');
  return components.some((component) => {
    const fold = component.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
    return FORBIDDEN_EXACT.has(fold)
      || /^agents.*\.md$/.test(fold)
      || /^skill.*\.md$/.test(fold)
      || fold === '.env'
      || fold.startsWith('.env.')
      || ['.mcp.json', 'mcp.json', 'mcp.yaml', 'mcp.yml', 'plugin.json', 'plugins.json', 'codex.json', 'hooks.json', 'execpolicy.rules'].includes(fold)
      || /\.(?:rules|pem|key|p12|pfx|mobileprovision|crt|cer|der|jks|keystore)$/.test(fold)
      || FORBIDDEN_COMPONENT.test(fold);
  }) || path === '.loop-engineering/runtime' || path.startsWith('.loop-engineering/runtime/');
}

function validatePath(path, selector = false) {
  assert(typeof path === 'string' && validScalarString(path) && Buffer.byteLength(path) >= 1 && Buffer.byteLength(path) <= 1024, 3);
  const value = selector && path.endsWith('/**') ? path.slice(0, -3) : path;
  assert(value === path || selector, 3);
  assert(!path.startsWith('/') && !path.endsWith('/') && !path.includes('\\') && !path.includes('\0'), 3);
  const components = value.split('/');
  assert(components.every((component) => component && component !== '.' && component !== '..' && Buffer.byteLength(component) <= 255 && !/[\u0000-\u001f]/.test(component) && !/[. ]$/.test(component)), 3);
  assert(!pathForbidden(value), 3);
  if (selector) assert(!path.includes('*') || path.endsWith('/**') && path.indexOf('*') === path.length - 2, 3);
  return path;
}

function validateTask(task, index) {
  assert(exactKeys(task, TASK_KEYS), 3);
  assert(typeof task.id === 'string' && CHANGE_ID.test(task.id), 3);
  assert(task.sequence === index && Number.isSafeInteger(task.sequence), 3);
  assert(task.assurance === 'critical', 3);
  assert(Array.isArray(task.dependsOn) && task.dependsOn.length <= 32 && sortedUnique(task.dependsOn), 3);
  assert(task.dependsOn.every((dependency) => CHANGE_ID.test(dependency)), 3);
  assert(typeof task.task === 'string' && validScalarString(task.task) && Buffer.byteLength(task.task) >= 1 && Buffer.byteLength(task.task) <= 32768, 3);
  assert(Array.isArray(task.acceptanceCriteria) && task.acceptanceCriteria.length >= 1 && task.acceptanceCriteria.length <= 128, 3);
  assert(task.acceptanceCriteria.every((entry) => typeof entry === 'string' && validScalarString(entry) && Buffer.byteLength(entry) >= 1 && Buffer.byteLength(entry) <= 4096), 3);
  assert(Buffer.byteLength(task.acceptanceCriteria.join('')) <= 65536, 3);
  for (const field of ['allowedPaths', 'inspectionPaths', 'promptFiles']) {
    assert(Array.isArray(task[field]) && task[field].length <= (field === 'promptFiles' ? 32 : 128) && sortedUnique(task[field]), 3);
  }
  task.allowedPaths.forEach((path) => validatePath(path, true));
  task.inspectionPaths.forEach((path) => validatePath(path, true));
  task.promptFiles.forEach((path) => validatePath(path, false));
  assert(!task.allowedPaths.some((path) => task.inspectionPaths.includes(path)), 3);
  assert(task.allowedPaths.length + task.inspectionPaths.length + task.promptFiles.length > 0, 3);
  assert(exactKeys(task.timeLimits, ['makeSeconds', 'reviewSeconds', 'verifySeconds']), 3);
  for (const value of Object.values(task.timeLimits)) assert(Number.isSafeInteger(value) && value >= 60 && value <= 1800, 3);
}

function parseManifest(buffer) {
  assert(Buffer.isBuffer(buffer) && buffer.length >= 2 && buffer.length <= 1048576 && buffer[buffer.length - 1] === 0x0a && buffer[buffer.length - 2] !== 0x0a, 3);
  const raw = buffer.subarray(0, -1).toString('utf8');
  assert(!raw.includes('\r') && Buffer.from(raw, 'utf8').equals(buffer.subarray(0, -1)), 3);
  let manifest;
  try {
    manifest = parseJsonWithNoDuplicateKeys(raw);
  } catch {
    throw new RunnerError(3);
  }
  assert(canonicalJson(manifest) === raw && exactKeys(manifest, TOP_LEVEL_KEYS), 3);
  assert(manifest.protocol === 'loop-model-manifest-v3.5' && manifest.checkpoint === 'model_runner_v3', 3);
  assert(typeof manifest.changeId === 'string' && CHANGE_ID.test(manifest.changeId), 3);
  assert(typeof manifest.base === 'string' && OID.test(manifest.base) && typeof manifest.inputHead === 'string' && OID.test(manifest.inputHead), 3);
  assert(['hybrid', 'sol-only', 'terra-only'].includes(manifest.defaultStrategy), 3);
  assert(Array.isArray(manifest.tasks) && manifest.tasks.length >= 1 && manifest.tasks.length <= 128, 3);
  manifest.tasks.forEach(validateTask);
  const ids = new Set(manifest.tasks.map((task) => task.id));
  assert(ids.size === manifest.tasks.length, 3);
  manifest.tasks.forEach((task, index) => assert(task.dependsOn.every((dependency) => ids.has(dependency) && manifest.tasks.findIndex((item) => item.id === dependency) < index), 3));
  return Object.freeze({ manifest, manifestSha256: sha256(raw), bytes: buffer.length });
}

module.exports = { parseManifest, validatePath, pathForbidden, CHANGE_ID, OID };
