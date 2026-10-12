'use strict';

const { RunnerError, assert } = require('./artifacts');
const { canonicalJson, parseJsonWithNoDuplicateKeys } = require('./canonicalJson');
const { validateTerminalResult } = require('./seal');

const RESULT_PROTOCOL = 'loop-model-result-v3.5';
const ORACLE_PROTOCOL = 'model-runner-oracle-v2';
const USAGE_KEYS = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens'];

function exactKeys(value, keys) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 12);
  const actual = Object.keys(value);
  assert(actual.length === keys.length && actual.every(key => keys.includes(key)), 12);
}

function text(value) {
  assert(typeof value === 'string' && !value.includes('\0')
    && Buffer.from(value, 'utf8').toString('utf8') === value, 12);
}

function decodeLines(stdout) {
  assert(typeof stdout === 'string' || Buffer.isBuffer(stdout), 12);
  const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout, 'utf8');
  assert(bytes.length <= 16_777_216 && !bytes.includes(0), 12);
  const decoded = bytes.toString('utf8');
  // A replacement character introduced by decoding must never hide invalid bytes.
  assert(Buffer.from(decoded, 'utf8').equals(bytes), 12);
  if (typeof stdout === 'string') assert(decoded === stdout, 12);
  const lines = decoded.split('\n');
  if (lines.at(-1) === '') lines.pop();
  assert(lines.length > 0 && lines.length <= 100_000, 12);
  for (const line of lines) assert(line.length > 0 && Buffer.byteLength(line) <= 1_048_576, 12);
  return lines;
}

function terminalFromText(value, protocol, operation) {
  let parsed;
  try {
    parsed = parseJsonWithNoDuplicateKeys(value);
  } catch {
    return null; // Non-JSON progress text cannot supply result bytes.
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (protocol === ORACLE_PROTOCOL) {
    if (!Object.hasOwn(parsed, 'modelAttempt')) return null;
    exactKeys(parsed, ['modelAttempt', 'operation']);
    assert(parsed.modelAttempt === 'completed' && parsed.operation === operation, 12);
  } else {
    if (!Object.hasOwn(parsed, 'protocol')) return null;
    validateTerminalResult(parsed, {
      operation: operation ?? parsed.operation,
      requestSha256: parsed.requestSha256,
      sourceViewSha256: parsed.sourceViewSha256,
    });
  }
  canonicalJson(parsed); // Includes recursive Unicode and canonical-value checks.
  return parsed;
}

function validateItem(item) {
  assert(item && typeof item === 'object', 12);
  assert(typeof item.id === 'string' && /^[\x01-\x7f]{1,128}$/.test(item.id), 12);
  if (item.type === 'reasoning' || item.type === 'agent_message') {
    exactKeys(item, ['id', 'type', 'text']);
    text(item.text);
  } else {
    assert(item.type === 'command_execution', 12);
    exactKeys(item, ['id', 'type', 'command', 'aggregated_output', 'exit_code', 'status']);
    text(item.command);
    text(item.aggregated_output);
    assert(item.exit_code === null || Number.isInteger(item.exit_code)
      && item.exit_code >= -2_147_483_648 && item.exit_code <= 2_147_483_647, 12);
    assert(['in_progress', 'completed', 'failed', 'declined'].includes(item.status), 12);
  }
}

function parse(stdout, options) {
  assert(options && typeof options === 'object' && !Array.isArray(options)
    && Object.keys(options).every(key => ['terminalProtocol', 'operation'].includes(key)), 12);
  const protocol = options.terminalProtocol ?? RESULT_PROTOCOL;
  assert([RESULT_PROTOCOL, ORACLE_PROTOCOL].includes(protocol), 12);
  assert(options.operation === undefined || ['make', 'review', 'verify'].includes(options.operation), 12);
  if (protocol === ORACLE_PROTOCOL) assert(options.operation !== undefined, 12);
  let state = 'thread';
  let terminal = null;
  const items = new Map();
  const lines = decodeLines(stdout);
  for (let index = 0; index < lines.length; index++) {
    assert(state !== 'done', 12);
    const event = parseJsonWithNoDuplicateKeys(lines[index]);
    assert(event && typeof event === 'object' && !Array.isArray(event), 12);
    if (event.type === 'error' || event.type === 'turn.failed') {
      exactKeys(event, event.type === 'error' ? ['type', 'message'] : ['type', 'error']);
      if (event.type === 'turn.failed') exactKeys(event.error, ['message']);
      text(event.type === 'error' ? event.message : event.error.message);
      assert(index === lines.length - 1, 12);
      throw new RunnerError(10);
    }
    if (state === 'thread') {
      exactKeys(event, ['type', 'thread_id']);
      assert(event.type === 'thread.started'
        && typeof event.thread_id === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(event.thread_id), 12);
      state = 'turn';
    } else if (state === 'turn') {
      exactKeys(event, ['type']);
      assert(event.type === 'turn.started', 12);
      state = 'items';
    } else if (event.type === 'turn.completed') {
      exactKeys(event, ['type', 'usage']);
      exactKeys(event.usage, USAGE_KEYS);
      assert(USAGE_KEYS.every(key => Number.isSafeInteger(event.usage[key]) && event.usage[key] >= 0), 12);
      assert(terminal && [...items.values()].every(item => item.completed), 12);
      state = 'done';
    } else {
      assert(['item.started', 'item.updated', 'item.completed'].includes(event.type), 12);
      exactKeys(event, ['type', 'item']);
      const item = event.item;
      validateItem(item);
      const prior = items.get(item.id);
      assert(!prior || !prior.completed && prior.type === item.type, 12);
      if (event.type === 'item.started') assert(!prior, 12);
      if (event.type === 'item.updated') assert(prior, 12);
      items.set(item.id, { type: item.type, completed: event.type === 'item.completed' });
      if (event.type === 'item.completed' && item.type === 'agent_message') {
        assert(!terminal, 12); // The unique terminal must be the final completed agent message.
        terminal = terminalFromText(item.text, protocol, options.operation);
      }
    }
  }
  assert(state === 'done' && terminal, 12);
  return terminal;
}

function terminalResultFromJsonl(stdout, options = {}) {
  try {
    return parse(stdout, options);
  } catch (error) {
    if (error instanceof RunnerError && error.exit === 10) throw error;
    throw new RunnerError(12);
  }
}

module.exports = { terminalResultFromJsonl };
