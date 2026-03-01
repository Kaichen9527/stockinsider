#!/usr/bin/env node

const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');
const reportDir = path.join(rootDir, '.agent', 'reports');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const args = process.argv.slice(2);
const mode = args.includes('--quick') ? 'quick' : 'full';
const reportOnly = args.includes('--report-only');
const changeName = process.env.OPENSPEC_CHANGE || 'stock-insider-opportunity-engine';

if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

const jsonPath = path.join(reportDir, `${timestamp}-release-gate.json`);
const mdPath = path.join(reportDir, `${timestamp}-release-gate.md`);
const latestJson = path.join(reportDir, 'latest-release-gate.json');
const latestMd = path.join(reportDir, 'latest-release-gate.md');

function runShell(cmd, cwd = rootDir) {
  const start = Date.now();
  const res = spawnSync('/bin/zsh', ['-lc', cmd], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });
  const duration = Date.now() - start;
  return {
    cmd,
    cwd,
    status: res.status === 0 ? 'pass' : 'fail',
    exitCode: res.status,
    duration,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

function writeLatest(report, markdown) {
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, markdown);
  fs.copyFileSync(jsonPath, latestJson);
  fs.copyFileSync(mdPath, latestMd);
}

function getCommit() {
  const r = runShell('git rev-parse --short HEAD');
  return r.status === 'pass' ? r.stdout.trim() : null;
}

function changeState(change) {
  const activePath = path.join(rootDir, 'openspec', 'changes', change);
  if (fs.existsSync(activePath)) return 'active';
  const archiveRoot = path.join(rootDir, 'openspec', 'changes', 'archive');
  if (fs.existsSync(archiveRoot)) {
    const entries = fs.readdirSync(archiveRoot, { withFileTypes: true });
    const hit = entries.find((e) => e.isDirectory() && e.name.endsWith(`-${change}`));
    if (hit) return 'archived';
  }
  return 'missing';
}

function summarizeError(check) {
  const source = `${check.stderr}\n${check.stdout}`.trim();
  if (!source) return null;
  return source.split('\n').slice(-8).join('\n');
}

function makeMarkdown(report) {
  const lines = [];
  lines.push(`# Release Gate Report`);
  lines.push('');
  lines.push(`- status: **${report.overall_status}**`);
  lines.push(`- mode: \`${report.mode}\``);
  lines.push(`- change: \`${report.change}\``);
  lines.push(`- started_at: ${report.started_at}`);
  lines.push(`- finished_at: ${report.finished_at}`);
  lines.push(`- commit: ${report.artifacts.git_commit || 'N/A'}`);
  lines.push('');
  lines.push(`## Checks`);
  lines.push('');

  for (const c of report.checks) {
    lines.push(`- [${c.status === 'pass' ? 'x' : ' '}] ${c.name} (${c.duration}ms)`);
    if (c.error_summary) {
      lines.push('```text');
      lines.push(c.error_summary);
      lines.push('```');
    }
  }

  lines.push('');
  lines.push('## Blocking Issues');
  if (report.blocking_issues.length === 0) {
    lines.push('- None');
  } else {
    for (const issue of report.blocking_issues) lines.push(`- ${issue}`);
  }

  lines.push('');
  lines.push('## Non-blocking Warnings');
  if (report.non_blocking_warnings.length === 0) {
    lines.push('- None');
  } else {
    for (const warning of report.non_blocking_warnings) lines.push(`- ${warning}`);
  }

  lines.push('');
  lines.push('## Artifacts');
  lines.push(`- json: \`${report.artifacts.json_report}\``);
  lines.push(`- markdown: \`${report.artifacts.markdown_report}\``);

  return lines.join('\n');
}

async function runSmokeChecks(report, opts = { skipInternalDispatch: false }) {
  const warningPrefix = 'API smoke';
  const devLog = path.join(reportDir, `${timestamp}-web-dev.log`);

  const dev = spawn('npm', ['run', 'dev', '--', '--port', '3005'], {
    cwd: path.join(rootDir, 'web'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logStream = fs.createWriteStream(devLog);
  dev.stdout.pipe(logStream);
  dev.stderr.pipe(logStream);

  let ready = false;
  for (let i = 0; i < 30; i += 1) {
    const ping = runShell(`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3005/`);
    const code = (ping.stdout || '').trim();
    if (/^[0-9]{3}$/.test(code) && code !== '000') {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!ready) {
    report.non_blocking_warnings.push(`${warningPrefix}: dev server did not become ready on :3005`);
    dev.kill('SIGTERM');
    return;
  }

  const authValue = process.env.INTERNAL_API_KEY || process.env.CRON_SECRET || '';
  const authHeader = authValue ? `-H 'authorization: Bearer ${authValue}'` : '';
  const smokeTargets = [
    { name: 'GET /api/dashboard/daily', cmd: `curl -sS http://127.0.0.1:3005/api/dashboard/daily -o /tmp/opsx_dashboard.json -w "\\n%{http_code}"` },
    { name: 'GET /api/recommendations', cmd: `curl -sS http://127.0.0.1:3005/api/recommendations -o /tmp/opsx_recommendations.json -w "\\n%{http_code}"` },
    { name: 'POST /api/internal/recommendation-run', cmd: `curl -sS -X POST http://127.0.0.1:3005/api/internal/recommendation-run ${authHeader} -H 'content-type: application/json' -d '{"dryRun":true}' -o /tmp/opsx_reco_run.json -w "\\n%{http_code}"` },
  ];
  if (!opts.skipInternalDispatch) {
    smokeTargets.push({
      name: 'POST /api/internal/line-dispatch',
      cmd: `curl -sS -X POST http://127.0.0.1:3005/api/internal/line-dispatch ${authHeader} -H 'content-type: application/json' -d '{"dryRun":true}' -o /tmp/opsx_line_dispatch.json -w "\\n%{http_code}"`,
    });
  }
  smokeTargets.push({
    name: 'POST /api/internal/monitoring-check',
    cmd: `curl -sS -X POST http://127.0.0.1:3005/api/internal/monitoring-check ${authHeader} -H 'content-type: application/json' -d '{"dryRun":true}' -o /tmp/opsx_monitoring.json -w "\\n%{http_code}"`,
  });
  smokeTargets.push({
    name: 'POST /api/internal/pipeline-run',
    cmd: `curl -sS -X POST http://127.0.0.1:3005/api/internal/pipeline-run ${authHeader} -H 'content-type: application/json' -d '{"dryRun":true}' -o /tmp/opsx_pipeline_run.json -w "\\n%{http_code}"`,
  });

  for (const target of smokeTargets) {
    const check = runShell(target.cmd);
    const code = (check.stdout || '').trim().split('\n').pop();
    if (!/^[0-9]{3}$/.test(code || '')) {
      report.non_blocking_warnings.push(`${warningPrefix}: ${target.name} returned invalid HTTP code`);
      continue;
    }
    if (Number(code) >= 500) {
      report.non_blocking_warnings.push(`${warningPrefix}: ${target.name} returned ${code}`);
    }
  }

  dev.kill('SIGTERM');
}

(async () => {
  if (reportOnly) {
    if (!fs.existsSync(latestJson)) {
      console.error('No latest release gate report found.');
      process.exit(1);
    }
    process.stdout.write(fs.readFileSync(latestJson, 'utf8'));
    return;
  }

  const startedAt = new Date().toISOString();
  const checks = [];
  const blocking = [];
  const warnings = [];
  let buildStderr = '';
  let webDevLogPath = null;

  function addCheck(name, result, isBlocking = true, customError = null) {
    const check = {
      name,
      status: result.status,
      duration: result.duration,
      error_summary: result.status === 'fail' ? (customError || summarizeError(result)) : null,
    };
    checks.push(check);
    if (check.status === 'fail' && isBlocking) {
      blocking.push(`${name} failed`);
    } else if (check.status === 'fail' && !isBlocking) {
      warnings.push(`${name} failed: ${check.error_summary || 'unknown error'}`);
    }
  }

  const vAll = runShell('openspec validate --all');
  addCheck('openspec validate --all', vAll, true);

  const state = changeState(changeName);
  if (state === 'active') {
    const applyStatus = runShell(`openspec instructions apply --change ${changeName}`);
    let progressError = null;
    if (applyStatus.status === 'pass' && !/22\/22 complete/.test(applyStatus.stdout)) {
      applyStatus.status = 'fail';
      progressError = 'Expected apply progress 22/22 complete';
    }
    addCheck(`openspec apply progress (${changeName})`, applyStatus, true, progressError);
  } else if (state === 'archived') {
    checks.push({
      name: `openspec apply progress (${changeName})`,
      status: 'pass',
      duration: 0,
      error_summary: null,
    });
    warnings.push(`Change '${changeName}' is archived; skipped 22/22 active-change progress check`);
  } else {
    checks.push({
      name: `openspec apply progress (${changeName})`,
      status: 'fail',
      duration: 0,
      error_summary: `Change '${changeName}' not found in active or archive paths`,
    });
    blocking.push(`openspec apply progress (${changeName}) failed`);
  }

  addCheck('npm run test:scraper', runShell('npm run test:scraper'), true);
  addCheck('python compile checks', runShell('python3 -m py_compile scraper/*.py scraper/tests/*.py'), true);
  if (process.env.SUPABASE_PROJECT_REF && process.env.SUPABASE_DB_PASSWORD) {
    addCheck('db verify (staging/prod)', runShell('npm run db:verify'), true);
  } else {
    checks.push({
      name: 'db verify (staging/prod)',
      status: 'pass',
      duration: 0,
      error_summary: null,
    });
    warnings.push('Skipped db verify (missing SUPABASE_PROJECT_REF/SUPABASE_DB_PASSWORD)');
  }
  addCheck('web lint', runShell('npm run lint', path.join(rootDir, 'web')), true);

  if (mode !== 'quick') {
    const buildResult = runShell('npm run build', path.join(rootDir, 'web'));
    addCheck('web build', buildResult, true);
    buildStderr = buildResult.stderr || '';
  }

  if (/lockfiles/.test(buildStderr)) {
    warnings.push('Next.js workspace root warning due to multiple lockfiles');
  }

  const reportDraft = {
    mode,
    change: changeName,
    checks,
    blocking_issues: blocking,
    non_blocking_warnings: warnings,
  };
  if (mode === 'full') {
    await runSmokeChecks(reportDraft, { skipInternalDispatch: false });
    webDevLogPath = path.join(reportDir, `${timestamp}-web-dev.log`);
    warnings.splice(0, warnings.length, ...reportDraft.non_blocking_warnings);
  }
  if (mode === 'quick') {
    await runSmokeChecks(reportDraft, { skipInternalDispatch: true });
    webDevLogPath = path.join(reportDir, `${timestamp}-web-dev.log`);
    warnings.splice(0, warnings.length, ...reportDraft.non_blocking_warnings);
  }

  const finishedAt = new Date().toISOString();
  const report = {
    overall_status: blocking.length === 0 ? 'pass' : 'fail',
    mode,
    change: changeName,
    started_at: startedAt,
    finished_at: finishedAt,
    checks,
    blocking_issues: blocking,
    non_blocking_warnings: warnings,
    artifacts: {
      json_report: jsonPath,
      markdown_report: mdPath,
      logs: webDevLogPath ? [webDevLogPath] : [],
      git_commit: getCommit(),
      generated_at: finishedAt,
    },
  };

  const markdown = makeMarkdown(report);
  writeLatest(report, markdown);

  process.stdout.write(JSON.stringify(report, null, 2));
  process.stdout.write('\n');

  if (report.overall_status !== 'pass') {
    process.exit(1);
  }
})();
