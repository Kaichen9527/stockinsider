'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadHostPins } = require('./hostPreflight');
const { executeModel, prepareTransport } = require('./execution');

async function runRealModelAttempt() {
  const fixture = path.resolve(__dirname, '../../.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-host-pins-v3.json');
  const pins = loadHostPins(fixture);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-v3-model-attempt-'));
  const view = path.join(directory, 'view');
  const scratch = path.join(directory, 'scratch');
  const transport = path.join(directory, 'transport');
  fs.mkdirSync(view, { mode: 0o700 });
  fs.mkdirSync(scratch, { mode: 0o700 });
  fs.writeFileSync(path.join(view, 'tracked.txt'), 'tracked\n', { mode: 0o400 });
  const source = { view };
  prepareTransport({ source, scratch, transport });
  try {
    const result = await executeModel({
      pins,
      source,
      scratch,
      transport,
      route: { model: 'gpt-5.6-terra', reasoningEffort: 'high' },
      request: {
        protocol: 'loop-model-v3.5',
        operation: 'make',
        task: 'Do not call tools. Return exactly {"modelAttempt":"completed"} as the final JSON object.',
        acceptanceCriteria: ['One exact JSON object and no tool call.'],
      },
      timeout: 90,
    });
    if (JSON.stringify(result) !== JSON.stringify({ modelAttempt: 'completed' })) {
      throw new Error('real model attempt returned an unexpected terminal object');
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

module.exports = { runRealModelAttempt };
