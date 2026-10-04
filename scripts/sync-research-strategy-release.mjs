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
// Database routines are executable strategy policy too. Resolve their latest
// reviewed source and transitive public-function calls, not environment labels.
const sqlSources = fs.readdirSync(path.join(root, 'migrations')).filter((name) => name.endsWith('.sql')).sort();
const definitions = new Map();
for (const name of sqlSources) {
  const file = 'migrations/' + name;
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const expression = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public[.])?([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*(RETURNS[\s\S]*?)\bAS\s+(\$[a-z0-9_]*\$)([\s\S]*?)\4/giu;
  for (const match of source.matchAll(expression)) definitions.set(match[1].toLowerCase(), { file,
    body: match[5], bodySha256: hash(match[5]), securityDefiner: /SECURITY\s+DEFINER/iu.test(match[3]),
    volatility: /\bIMMUTABLE\b/iu.test(match[3]) ? 'i' : /\bSTABLE\b/iu.test(match[3]) ? 's' : 'v',
    configuration: [...match[3].matchAll(/\bSET\s+([a-z_]+)\s*(?:=|TO)\s*([\s\S]*?)(?=\bSET\s+[a-z_]+\s*(?:=|TO)|$)/giu)]
      .map((setting) => setting[1].toLowerCase() + '=' + setting[2].trim().replace(/''/gu,'').replace(/[\s"]/gu,'')).sort(),
    argumentTypes: match[2].trim() ? match[2].split(',').map((argument) => {
      const type = argument.trim().replace(/\s+DEFAULT[\s\S]*$/iu,'').replace(/^\w+\s+/u,'').replace(/^public[.]/u,'');
      return ({timestamptz:'timestamp with time zone',int:'integer',int4:'integer',int8:'bigint',bool:'boolean'}[type] || type);
    }).join(', ') : '',
    argumentCount: match[2].trim() ? match[2].split(',').length : 0 });
}
const databaseFunctions = new Map();
function sqlVisit(name) {
  if (databaseFunctions.has(name)) return;
  const definition = definitions.get(name);
  if (!definition) throw new Error('strategy_database_function_missing:' + name);
  databaseFunctions.set(name, definition);
  for (const call of definition.body.matchAll(/\bpublic[.]([a-z0-9_]+)\s*\(/giu)) {
    sqlVisit(call[1].toLowerCase());
  }
}
['research_evidence_heads_v1','resolve_legacy_instrument_authority_v3_13',
  'resolve_legacy_sector_authority_v3_13','fence_candidate_thesis_append_v1',
  'fence_research_strategy_record_v1','fence_research_paper_book_append_v1',
  'reject_candidate_dossier_revision_mutation_v4','research_execution_policy_matches_v1'].forEach(sqlVisit);
const databasePolicy = [...databaseFunctions].sort(([a],[b]) => a.localeCompare(b)).map(([name, item]) => ({
  name, bodySha256: item.bodySha256, securityDefiner: item.securityDefiner,
  volatility: item.volatility, argumentCount: item.argumentCount,
  configuration: item.configuration,
  argumentTypes: item.argumentTypes,
}));
const databasePaths = [...new Set([...databaseFunctions.values()].map((item) => item.file)
  .concat('migrations/20261004_research_technical_identity_v2.sql'))].sort();
databasePaths.forEach((file) => visited.add(file));
const files = [...visited].sort().map((file) => ({ path: file, sha256: hash(fs.readFileSync(path.join(root, file))) }));
const parameterFiles = parameterPaths.sort().map((file) => {
  const selected = files.find((entry) => entry.path === file);
  if (!selected) throw new Error('strategy_parameter_source_missing');
  return selected;
});
const material = { schema: 'research-strategy-source-release-v2', files, databasePolicy,
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
