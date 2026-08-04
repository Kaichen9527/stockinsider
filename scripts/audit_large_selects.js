#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, '.agent', 'reports');
const SCAN_ROOTS = ['web/src/app', 'web/src/lib', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.vercel', '.agent/artifacts']);

function hasFlag(name) {
  return process.argv.includes(name);
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const rel = path.relative(ROOT, dir);
  if (SKIP_DIRS.has(rel)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const fullRel = path.relative(ROOT, full);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(fullRel) || entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full, files);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs|py)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function contextLines(lines, index, before = 5, after = 2) {
  const start = Math.max(0, index - before);
  const end = Math.min(lines.length, index + after + 1);
  return lines.slice(start, end).join('\n');
}

function previousContext(lines, index, before = 6) {
  const start = Math.max(0, index - before);
  return lines.slice(start, index + 1).join('\n');
}

function main() {
  const strict = hasFlag('--strict');
  const files = SCAN_ROOTS.flatMap((root) => walk(path.join(ROOT, root)));
  const findings = [];

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      const selectStar = /\.select\(\s*(['"`])\*\1/.test(line);
      const selectsContentText = /\.select\([^)]*content_text/.test(line);
      if (!selectStar && !selectsContentText) return;

      const context = contextLines(lines, index);
      const currentLineHasFrom = /from\(\s*['"`][^'"`]+['"`]\s*\)/.test(line);
      const sourceRawOnCurrentLine = /from\(\s*['"`]source_raw_documents['"`]\s*\)/.test(line);
      const sourceRawOnPreviousLines = /from\(\s*['"`]source_raw_documents['"`]\s*\)/.test(
        `${lines[index - 1] || ''}\n${lines[index - 2] || ''}`,
      );
      const isSourceRaw = sourceRawOnCurrentLine || (!currentLineHasFrom && sourceRawOnPreviousLines);
      const isApiRoute = rel.startsWith('web/src/app/api/');
      const isDomainUserFacing = rel === 'web/src/lib/domain.ts';
      const highRisk =
        (selectStar && isSourceRaw) ||
        (selectsContentText && isApiRoute) ||
        (selectsContentText && isDomainUserFacing && /searchSourceDocuments|getDiscoveredStocks|getStockDeepDiveLookup|getStockDeepDive/.test(context));

      findings.push({
        file: rel,
        line: index + 1,
        kind: selectStar ? 'select_star' : 'select_content_text',
        highRisk,
        context: context.trim(),
      });
    });
  }

  const highRiskFindings = findings.filter((item) => item.highRisk);
  const strictFindings = strict ? findings : [];
  const issues = [
    ...highRiskFindings.map((item) => `${item.kind}:${item.file}:${item.line}`),
    ...strictFindings
      .filter((item) => !item.highRisk)
      .map((item) => `strict_${item.kind}:${item.file}:${item.line}`),
  ];

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const checkedAt = new Date().toISOString();
  const reportPath = path.join(REPORTS_DIR, `large-selects-audit-${checkedAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        checkedAt,
        strict,
        passed: issues.length === 0,
        issueCount: issues.length,
        highRiskCount: highRiskFindings.length,
        warningCount: findings.length - highRiskFindings.length,
        issues,
        findings,
      },
      null,
      2,
    ),
  );

  if (issues.length > 0) {
    console.error(`Large selects audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log(`Large selects audit: pass (${findings.length} warning${findings.length === 1 ? '' : 's'}, ${highRiskFindings.length} high-risk)`);
  console.log(`Report: ${reportPath}`);
}

main();
