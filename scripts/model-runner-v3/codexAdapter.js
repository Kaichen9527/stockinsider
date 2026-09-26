'use strict';

const path = require('node:path');
const { assert } = require('./artifacts');

const DISABLES = [
  'skill_search', 'plugins', 'apps', 'remote_plugin', 'hooks', 'multi_agent',
  'browser_use', 'browser_use_external', 'browser_use_full_cdp_access',
  'computer_use', 'shell_snapshot', 'skill_mcp_dependency_install',
  'tool_suggest', 'enable_mcp_apps',
];

function profileToml(viewPath, scratchPath, transportPath) {
  const roots = [viewPath, scratchPath, transportPath];
  assert(roots.every((value) => typeof value === 'string' && path.isAbsolute(value)
    && path.resolve(value) === value && !/[\u0000-\u001f\u007f]/u.test(value)), 5);
  const parent = path.dirname(viewPath);
  assert(parent !== path.parse(parent).root
    && roots.every((value) => path.dirname(value) === parent)
    && new Set(roots).size === 3, 5);
  // Minimal runtime access may include the temporary parent. Explicitly close
  // the owned operation and transport, then reopen only view and scratch.
  return [
    'default_permissions = "model-runner-v3"',
    '',
    '[permissions.model-runner-v3.filesystem]',
    '":root" = "deny"',
    '":minimal" = "read"',
    JSON.stringify(parent) + ' = "deny"',
    JSON.stringify(transportPath) + ' = "deny"',
    JSON.stringify(viewPath) + ' = "read"',
    JSON.stringify(scratchPath) + ' = "write"',
    '',
    '[permissions.model-runner-v3.network]',
    'enabled = false',
    '',
  ].join('\n');
}

function codexArgs({ model, reasoningEffort, viewPath }) {
  assert(
    (
      (model === 'gpt-5.6-sol' && reasoningEffort === 'xhigh') ||
      (model === 'gpt-5.6-terra' && reasoningEffort === 'high')
    ) &&
    path.isAbsolute(viewPath),
    5,
  );
  const args = [
    '--model', model, '--profile', 'model-runner-v3', '--ask-for-approval', 'never',
    '--strict-config', '-c', 'project_doc_max_bytes=0', '-c', 'project_doc_fallback_filenames=[]',
    '-c', 'web_search=disabled', '-c', 'allow_login_shell=false',
    '-c', `model_reasoning_effort="${reasoningEffort}"`,
  ];
  for (const disable of DISABLES) args.push('--disable', disable);
  args.push('exec', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--color', 'never', '--json', '-');
  assert(!args.includes('--sandbox') && !args.includes('-s'), 5);
  return args;
}

function sanitizedEnvironment({ scratchPath, transportPath }) {
  assert(path.isAbsolute(scratchPath) && path.isAbsolute(transportPath), 5);
  return {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin',
    HOME: scratchPath,
    TMPDIR: scratchPath,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    CODEX_HOME: transportPath,
  };
}

module.exports = { DISABLES, profileToml, codexArgs, sanitizedEnvironment };
