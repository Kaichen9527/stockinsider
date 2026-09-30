'use strict';

const { RunnerError, assert } = require('./artifacts');

function routeOperation(operation, strategy) {
  assert(['make', 'review', 'verify'].includes(operation), 2);
  assert(strategy === 'astra-only', 5);
  return { model: 'gpt-6-astra', reasoningEffort: 'high', waiverRequired: false };
}

function routeManifest(parsed, taskId, strategy) {
  const effectiveStrategy = strategy || parsed.manifest.defaultStrategy;
  const tasks = taskId ? parsed.manifest.tasks.filter((task) => task.id === taskId) : parsed.manifest.tasks;
  assert(tasks.length > 0, 3);
  const route = (operation) => {
    try {
      return routeOperation(operation, effectiveStrategy);
    } catch (error) {
      if (error instanceof RunnerError && error.code === 'ROUTING_BLOCKED') return { blocked: error.code };
      throw error;
    }
  };
  return {
    protocol: 'loop-model-route-v3.6',
    manifestSha256: parsed.manifestSha256,
    strategy: effectiveStrategy,
    routes: tasks.map((task) => ({
      taskId: task.id,
      assurance: task.assurance,
      make: route('make'),
      review: route('review'),
      verify: route('verify'),
    })),
  };
}

module.exports = { routeOperation, routeManifest };
