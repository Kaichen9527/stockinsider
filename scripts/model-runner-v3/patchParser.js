'use strict';

const { RunnerError, assert } = require('./artifacts');
const { validatePath, pathForbidden } = require('./manifest');
const { selectorMatches } = require('./sourceView');

function changedPaths(patch) {
  assert(typeof patch === 'string' && Buffer.byteLength(patch) >= 1 && Buffer.byteLength(patch) <= 4194304 && !patch.includes('\0'), 6);
  const lines = patch.split('\n');
  const paths = [];
  let currentPath = null;
  let oldHeaderSeen = false;
  let newHeaderSeen = false;
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      assert(match && match[1] === match[2], 6);
      try {
        validatePath(match[1], false);
      } catch (error) {
        if (error instanceof RunnerError) throw new RunnerError(6);
        throw error;
      }
      assert(!pathForbidden(match[1]), 6);
      currentPath = match[1];
      oldHeaderSeen = false;
      newHeaderSeen = false;
      paths.push(match[1]);
      continue;
    }
    if (line.startsWith('--- ')) {
      assert(currentPath !== null && !oldHeaderSeen && !newHeaderSeen, 6);
      const oldPath = line.slice(4);
      assert(oldPath === '/dev/null' || oldPath === `a/${currentPath}`, 6);
      oldHeaderSeen = true;
      continue;
    }
    if (line.startsWith('+++ ')) {
      assert(currentPath !== null && oldHeaderSeen && !newHeaderSeen, 6);
      const newPath = line.slice(4);
      assert(newPath === '/dev/null' || newPath === `b/${currentPath}`, 6);
      newHeaderSeen = true;
      continue;
    }
    if (line.startsWith('new file mode ')) assert(/^new file mode 100(?:644|755)$/u.test(line), 6);
    if (line.startsWith('deleted file mode ')) assert(/^deleted file mode 100(?:644|755)$/u.test(line), 6);
  }
  assert(paths.length >= 1 && paths.length <= 4096 && new Set(paths).size === paths.length, 6);
  // Additions and deletions carry `new file mode` / `deleted file mode` and
  // are part of the V3 proposal protocol. A bare old/new mode pair is a
  // mode-only change and remains unrepresentable.
  assert(!/^old mode /m.test(patch) && !/^new mode /m.test(patch) && !/^similarity index /m.test(patch) && !/^rename (?:from|to) /m.test(patch) && !/^(?:Binary files |GIT binary patch$)/m.test(patch), 6);
  return paths;
}

function validatePatch(patch, allowedPaths) {
  const paths = changedPaths(patch);
  assert(paths.every((value) => allowedPaths.some((selector) => selectorMatches(selector, value))), 6);
  return paths;
}

module.exports = { changedPaths, validatePatch };
