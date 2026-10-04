import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'web/package.json'));
const ts = require('typescript');
const output = 'web/src/lib/research-strategy-release.generated.ts';
const entries = ['web/src/app/api/internal/research-technical-snapshot/route.ts',
  'web/src/app/api/internal/research-paper-session/route.ts'];
const parameterPaths = ['web/src/lib/tw-entry-plan.ts', 'web/src/lib/tw-entry-plan-contract.ts',
  'web/src/lib/technical-features-v2.ts', 'web/src/lib/research-paper-books.ts', 'web/src/lib/research-strategy-governance.ts'];
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const canonical = (value) => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
const visited = new Set();
function visit(relative) {
  if (relative === output || visited.has(relative)) return;
  if (!relative.startsWith('web/src/') || /(^|\/)[.]env(?:[.]|$)/u.test(relative))
    throw new Error('strategy_source_outside_application');
  visited.add(relative);
  const filename = path.join(root, relative);
  const text = fs.readFileSync(filename, 'utf8');
  if (!/\.[cm]?[jt]sx?$/u.test(relative)) return;
  const source = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true);
  function walk(node) {
    const specifier = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
      : ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || ts.isIdentifier(node.expression) && node.expression.text === 'require') ? node.arguments[0] : null;
    if (specifier && ts.isStringLiteral(specifier)) {
      const name = specifier.text;
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? path.join(root, 'web/src', name.slice(2)) : path.resolve(path.dirname(filename), name);
        if (base === path.join(root, output)) { ts.forEachChild(node, walk); return; }
        const resolved = [base, ...['.ts', '.tsx', '.js', '.json', '/index.ts', '/index.tsx'].map((suffix) => base + suffix)]
          .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        if (!resolved) throw new Error('strategy_local_import_unresolved:' + name);
        visit(path.relative(root, resolved).split(path.sep).join('/'));
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
}
entries.forEach(visit);
const files = [...visited].sort().map((file) => ({ path: file, sha256: hash(fs.readFileSync(path.join(root, file))) }));
const parameterFiles = parameterPaths.sort().map((file) => {
  const selected = files.find((entry) => entry.path === file);
  if (!selected) throw new Error('strategy_parameter_source_missing');
  return selected;
});
const material = { schema: 'research-strategy-source-release-v1', files,
  dependencyLockHash: hash(fs.readFileSync(path.join(root, 'web/package-lock.json'))) };
const release = { ...material, codeHash: hash(canonical(material)),
  parameterMode: 'fixed_baseline_source_bound',
  parameterHash: hash(canonical({ mode: 'fixed_baseline_source_bound', parameterFiles })), parameterFiles };
const bytes = '// Generated from actual imported application sources. Do not edit.\n'
  + 'export const RESEARCH_STRATEGY_RELEASE = ' + JSON.stringify(release, null, 2) + ' as const;\n';
if (process.argv.slice(2).join(' ') === '--write') fs.writeFileSync(path.join(root, output), bytes);
else if (process.argv.slice(2).join(' ') === '--check') {
  if (!fs.existsSync(path.join(root, output)) || fs.readFileSync(path.join(root, output), 'utf8') !== bytes)
    throw new Error('research_strategy_release_stale: run node scripts/sync-research-strategy-release.mjs --write and review the result');
} else throw new Error('expected --write or --check');
process.stdout.write(JSON.stringify({ codeHash: release.codeHash, parameterHash: release.parameterHash, files: files.length }) + '\n');
