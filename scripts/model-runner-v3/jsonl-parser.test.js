'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { terminalResultFromJsonl } = require('./execution');
const result = { protocol: 'loop-model-result-v3.5', operation: 'make', requestSha256: '1'.repeat(64),
  sourceViewSha256: '2'.repeat(64), status: 'proposal', patch: 'diff --git a/a b/a\n',
  findings: [], evidence: [], summary: 'proposal' };
const thread = { type: 'thread.started', thread_id: '123e4567-e89b-42d3-a456-426614174000' };
const turn = { type: 'turn.started' };
const usage = { input_tokens: 1, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 };
const end = { type: 'turn.completed', usage };
const agent = (id = 'final', text = JSON.stringify(result)) => ({ type: 'item.completed', item: { id, type: 'agent_message', text } });
const encode = (events) => events.map(JSON.stringify).join('\n') + '\n';
const good = () => [thread, turn, agent(), end];
const reject = (input, options) => assert.throws(() => terminalResultFromJsonl(input, options), error => error?.exit === 12);

test('closed JSONL accepts a sealed completed-only terminal with optional final LF', () => {
  assert.equal(JSON.stringify(terminalResultFromJsonl(encode(good()))), JSON.stringify(result));
  assert.equal(JSON.stringify(terminalResultFromJsonl(Buffer.from(encode(good()).trimEnd()))), JSON.stringify(result));
});
const invalid = {
  missing_starts: [agent(), end], missing_turn: [thread, agent(), end], missing_thread: [turn, agent(), end],
  duplicate_thread: [thread, thread, turn, agent(), end], duplicate_turn: [thread, turn, turn, agent(), end],
  unknown_event: [thread, turn, { type: 'unknown' }, agent(), end],
  unknown_member: [{ ...thread, extra: true }, turn, agent(), end],
  invalid_uuid: [{ ...thread, thread_id: 'not-a-uuid' }, turn, agent(), end],
  uppercase_uuid: [{ ...thread, thread_id: thread.thread_id.toUpperCase() }, turn, agent(), end],
  missing_usage: [thread, turn, agent(), { type: 'turn.completed' }],
  negative_usage: [thread, turn, agent(), { ...end, usage: { ...usage, input_tokens: -1 } }],
  unsafe_usage: [thread, turn, agent(), { ...end, usage: { ...usage, input_tokens: 2 ** 53 } }],
  extra_usage: [thread, turn, agent(), { ...end, usage: { ...usage, extra: 0 } }],
  duplicate_terminal: [thread, turn, agent(), agent('second'), end],
  duplicate_item_id: [thread, turn, agent(), agent(), end],
  progress_after_terminal: [thread, turn, agent(), agent('progress', 'Still working'), end],
  duplicate_end: [...good(), end], trailing_event: [...good(), turn],
  no_terminal: [thread, turn, agent('progress', 'Working'), end],
  arbitrary_json_terminal: [thread, turn, agent('final', '{"arbitrary":true}'), end],
  invalid_result_schema: [thread, turn, agent('final', JSON.stringify({ ...result, extra: true })), end],
  incomplete_turn: [thread, turn, agent()],
  unknown_item: [thread, turn, { type: 'item.completed', item: { id: 'tool', type: 'mcp_tool_call' } }, agent(), end],
  extra_item_member: [thread, turn, { type: 'item.completed', item: { ...agent().item, extra: true } }, end],
  update_without_start: [thread, turn, { type: 'item.updated', item: agent().item }, agent(), end],
  unfinished_item: [thread, turn, { type: 'item.started', item: { id: 'pending', type: 'reasoning', text: '' } }, agent(), end],
  changed_item_type: [thread, turn, { type: 'item.started', item: { id: 'final', type: 'reasoning', text: '' } }, agent(), end],
  non_ascii_id: [thread, turn, agent('名稱'), end], long_id: [thread, turn, agent('x'.repeat(129)), end],
  surrogate_text: [thread, turn, agent('progress', '\ud800'), agent(), end],
  error_extra_member: [{ type: 'error', message: 'failed', extra: true }],
  failed_extra_member: [{ type: 'turn.failed', error: { message: 'failed', extra: true } }],
};
for (const [name, events] of Object.entries(invalid)) test(`closed JSONL rejects ${name}`, () => reject(encode(events)));
for (const type of ['file_change', 'web_search', 'collab_tool_call', 'todo_list', 'error']) {
  test(`closed JSONL rejects prohibited item ${type}`, () => reject(encode([thread, turn,
    { type: 'item.completed', item: { id: 'tool', type } }, agent(), end])));
}
test('closed JSONL validates ordered item lifecycle and command diagnostic only', () => {
  const item = { id: 'reason', type: 'reasoning', text: 'thinking' };
  const command = { id: 'command', type: 'command_execution', command: 'read', aggregated_output: JSON.stringify(result), exit_code: 0, status: 'completed' };
  const events = [thread, turn, { type: 'item.started', item }, { type: 'item.updated', item },
    { type: 'item.completed', item }, { type: 'item.completed', item: command }, agent(), end];
  assert.equal(terminalResultFromJsonl(encode(events)).summary, 'proposal');
  reject(encode(events.filter(e => e !== events[6])));
  reject(encode([thread, turn, { type: 'item.completed', item: { ...command, exit_code: 2 ** 31 } }, agent(), end]));
  reject(encode([thread, turn, { type: 'item.completed', item: { ...command, status: 'unknown' } }, agent(), end]));
});
test('closed JSONL rejects invalid bytes, duplicate JSON keys and byte/line bounds', () => {
  reject(Buffer.concat([Buffer.from(encode(good())), Buffer.from([0xff])]));
  reject(encode(good()).replace('proposal', '\u0000'));
  reject(encode(good()).replace('"type":"thread.started"', '"type":"thread.started","type":"thread.started"'));
  reject(' '.repeat(1_048_577));
  reject(Buffer.alloc(16_777_217, 32));
  reject('\n'.repeat(100_001));
  reject('\n' + encode(good()));
});
test('closed JSONL recognizes typed model failure without accepting malformed failure', () => {
  for (const event of [{ type: 'error', message: 'failure' }, { type: 'turn.failed', error: { message: 'failure' } }]) {
    assert.throws(() => terminalResultFromJsonl(encode([thread, turn, event])), error => error?.exit === 10);
  }
});
test('diagnostic oracle terminal requires explicit bounded protocol and exact operation', () => {
  const events = [thread, turn, agent('final', JSON.stringify({ modelAttempt: 'completed', operation: 'make' })), end];
  reject(encode(events));
  const options = { terminalProtocol: 'model-runner-oracle-v2', operation: 'make' };
  assert.equal(terminalResultFromJsonl(encode(events), options).modelAttempt, 'completed');
  reject(encode(events), { ...options, operation: 'review' });
  reject(encode(events), { ...options, terminalProtocol: 'arbitrary' });
  reject(encode(good()), options);
});

test('closed JSONL rejects every outer unknown member', () => {
  for (let index = 0; index < good().length; index++) {
    const events = good();
    events[index] = { ...events[index], extra: true };
    reject(encode(events));
  }
});
test('closed JSONL preserves progress text and completed agent lifecycle before terminal', () => {
  const item = { id: 'progress', type: 'agent_message', text: 'Reading source' };
  const events = [thread, turn, { type: 'item.started', item }, { type: 'item.updated', item },
    { type: 'item.completed', item }, agent('json-progress', '{"count":1}'), agent(), end];
  assert.equal(terminalResultFromJsonl(encode(events)).summary, 'proposal');
  reject(encode([thread, turn, { type: 'item.started', item }, { type: 'item.started', item }, agent(), end]));
  reject(encode([...events.slice(0, -2), { type: 'item.updated', item }, agent(), end]));
});
test('closed JSONL checks every usage field and UUID variant', () => {
  for (const key of Object.keys(usage)) for (const value of [-1, 0.5, '1', null, 2 ** 53]) {
    reject(encode([thread, turn, agent(), { ...end, usage: { ...usage, [key]: value } }]));
  }
  reject(encode([{ ...thread, thread_id: '123e4567-e89b-42d3-7456-426614174000' }, turn, agent(), end]));
});
test('closed JSONL rejects data after typed failures and malformed failure shapes', () => {
  for (const event of [{ type: 'error', message: 'failure' }, { type: 'turn.failed', error: { message: 'failure' } }]) {
    reject(encode([thread, turn, event, end]));
    reject(encode([...good(), event]));
  }
  reject(encode([{ type: 'error', message: null }]));
  reject(encode([{ type: 'turn.failed', error: { message: '\ud800' } }]));
});
test('closed JSONL validates original bytes inside otherwise valid progress and result', () => {
  const bytes = Buffer.from(encode([thread, turn, agent('progress', 'MARKER'), agent(), end]));
  bytes[bytes.indexOf('MARKER')] = 0xff;
  reject(bytes);
  reject(encode(good()).replace('proposal', '\ud800'));
  reject(encode([thread, turn, agent('final', JSON.stringify({ ...result, summary: '\ud800' })), end]));
  // A real UTF-8 replacement character is valid, unlike a decoder-inserted one.
  assert.equal(terminalResultFromJsonl(encode([thread, turn, agent('progress', '\ufffd'), agent(), end])).summary, 'proposal');
});
test('closed JSONL applies the exact line byte bound', () => {
  const first = JSON.stringify(thread);
  const tail = encode([turn, agent(), end]);
  assert.equal(terminalResultFromJsonl(first + ' '.repeat(1_048_576 - Buffer.byteLength(first)) + '\n' + tail).summary, 'proposal');
  reject(first + ' '.repeat(1_048_577 - Buffer.byteLength(first)) + '\n' + tail);
});
test('closed JSONL counts nonempty lines rather than allowing unbounded valid items', () => {
  const events = [thread, turn];
  for (let i = 0; i < 99_997; i++) events.push({ type: 'item.completed', item: { id: `r${i}`, type: 'reasoning', text: '' } });
  events.push(agent(), end);
  assert.equal(events.length, 100_001);
  reject(encode(events));
});
test('closed JSONL binds production operation and rejects diagnostic option expansion', () => {
  reject(encode(good()), { operation: 'review' });
  reject(encode(good()), { terminalProtocol: 'loop-model-result-v3.5', arbitrary: true });
  reject(encode(good()), { operation: 'arbitrary' });
  reject(encode(good()), null);
});
