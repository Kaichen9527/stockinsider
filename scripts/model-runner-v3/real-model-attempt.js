'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadHostPins } = require('./hostPreflight');
const { executeModel, prepareTransport } = require('./execution');
const { routeOperation } = require('./routing');

async function runRealModelAttempt() {
  const fixture = path.resolve(__dirname, '../../.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-host-pins-v3.json');
  const pins = loadHostPins(fixture);
  const completedRoutes = [];
  for (const operation of ['make', 'review', 'verify']) {
    // Separate transports/views prevent one successful operation from standing
    // in for either independently required reviewer/verifier invocation.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-v3-model-attempt-'));
    const view = path.join(directory, 'view');
    const scratch = path.join(directory, 'scratch');
    const transport = path.join(directory, 'transport');
    fs.mkdirSync(view, { mode: 0o700 });
    fs.mkdirSync(scratch, { mode: 0o700 });
    fs.writeFileSync(path.join(view, 'tracked.txt'), 'tracked\n', { mode: 0o400 });
    const source = { view };
    try {
      prepareTransport({ source, scratch, transport });
      const route = routeOperation(operation, 'sol61-make-astra-review');
      const terminal = { modelAttempt: 'completed', operation };
      const result = await executeModel({
        pins,
        source,
        scratch,
        transport,
        route,
        request: {
          protocol: 'loop-model-v3.5',
          operation,
          role: ({ make: 'maker', review: 'reviewer', verify: 'verifier' })[operation],
          model: route.model, reasoningEffort: route.reasoningEffort, strategy: 'sol61-make-astra-review', terraWaiver: null,
          task: `Do not call tools. Return exactly ${JSON.stringify(terminal)} as the final JSON object.`,
          acceptanceCriteria: ['One exact JSON object and no tool call.'],
        },
        timeout: 90,
        terminalProtocol: 'model-runner-oracle-v2',
      });
      if (JSON.stringify(result) !== JSON.stringify(terminal)) {
        throw new Error('real model attempt returned an unexpected terminal object');
      }
      completedRoutes.push({ operation, model: route.model, reasoningEffort: route.reasoningEffort });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
  return { protocol: 'model-runner-real-attempt-v2', status: 'pass', completedRoutes };
}

module.exports = { runRealModelAttempt };
