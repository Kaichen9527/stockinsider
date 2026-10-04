"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { profileToml } = require('./codexAdapter');
const deny = (paths) => assert.throws(() => profileToml(...paths), (error) => error.exitCode === 5 || error.code === 'ROUTING_BLOCKED');

test('profile explicitly closes parent and transport while only reopening source and scratch', () => {
  const text = profileToml('/private/operation/view', '/private/operation/scratch', '/private/operation/transport');
  assert.ok(text.includes('"/private/operation" = "deny"'));
  assert.ok(text.includes('"/private/operation/transport" = "deny"'));
  assert.ok(text.includes('"/private/operation/view" = "read"'));
  assert.ok(text.includes('"/private/operation/scratch" = "write"'));
  assert.equal(text.split(' = "write"').length - 1, 1);
  assert.ok(text.includes('enabled = false'));
});

test('source and scratch cannot overlap', () => deny(['/private/op/view', '/private/op/view', '/private/op/transport']));
test('transport cannot be source or scratch', () => {
  deny(['/private/op/view', '/private/op/scratch', '/private/op/view']);
  deny(['/private/op/view', '/private/op/scratch', '/private/op/scratch']);
});
test('transport cannot be an ancestor or descendant of an allowed root', () => {
  deny(['/private/op/view', '/private/op/scratch', '/private/op']);
  deny(['/private/op/view', '/private/op/scratch', '/private/op/view/auth']);
});
test('three roots must belong to the same private operation', () => deny(['/private/op/view', '/private/another/scratch', '/private/op/transport']));
test('filesystem root cannot become an operation parent', () => deny(['/view', '/scratch', '/transport']));
test('relative, noncanonical and control-character roots fail closed', () => {
  for (const view of ['view', '/private/op/../view', '/private/op/view/', '/private/op/view\n', '/private/op/view\0']) {
    deny([view, '/private/op/scratch', '/private/op/transport']);
  }
});
test('quoted directory names are TOML-escaped rather than inserted as raw policy', () => {
  const parent = '/private/operation "quoted"';
  const text = profileToml(parent+'/view', parent+'/scratch', parent+'/transport');
  assert.ok(text.includes(JSON.stringify(parent)+' = "deny"'));
  assert.ok(text.includes(JSON.stringify(parent+'/transport')+' = "deny"'));
  assert.ok(text.includes(JSON.stringify(parent+'/view')+' = "read"'));
});

test('the normative profile template reproduces the actual adapter byte-for-byte', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const filename = path.resolve(__dirname, '../../.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-contract.md');
  const section = fs.readFileSync(filename, 'utf8').split('## 8. Exact permission profile and Codex invocation')[1];
  const block = section.match(/```toml\n([\s\S]*?)```/u)[1];
  const parent = '/private/operation "quoted"';
  let rendered = block;
  for (const [placeholder, value] of [
    ['absolute-private-operation-parent', parent],
    ['absolute-private-transport', parent + '/transport'],
    ['absolute-sanitized-view', parent + '/view'],
    ['absolute-private-scratch', parent + '/scratch'],
  ]) rendered = rendered.replace('"<' + placeholder + '>"', JSON.stringify(value));
  assert.equal(rendered, profileToml(parent + '/view', parent + '/scratch', parent + '/transport'));
});
