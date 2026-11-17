import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
/** Test-only closed adapter: transpile actual sources, keep their import strings
 * intact, and replace only the unused default client with a fail-fast boundary.
 * Cache/model/DB behavior is supplied explicitly by each transport fixture. */
export function loadActualDiscovery() {
  const cache = new Map();
  const allowed = new Set(['discovery.ts', 'store.ts', 'policy.ts', 'research.ts','financial-observation.ts','catalyst-cancellation.ts','business-criteria.ts','semantic-criteria.ts', 'runtime.ts', 'factors.ts','audit-quote-clock.ts','evidence-clock.ts','../candidate-price-history.ts', 'screening.ts', 'rotation.ts', 'replacement.ts','cached-price-factors.ts','screening-instrument-identity.ts','preparation-trading-identity.ts','citations.ts','artifact-financial-summary.ts','research-failure.ts']);
  function load(name) {
    if (!allowed.has(name)) throw new Error(`unexpected_discovery_source:${name}`);
    if (cache.has(name)) return cache.get(name);
    const filename = new URL(name, import.meta.url);
    let source=fs.readFileSync(filename,'utf8');
    if(name==='../candidate-price-history.ts'){
      const parsed=ts.createSourceFile(filename.pathname,source,ts.ScriptTarget.Latest,true);
      const declaration=parsed.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='isHistoryDate');
      if(!declaration)throw Error('actual_history_date_validator_missing');source=declaration.getText(parsed);
    }
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: name,
    }).outputText;
    const isolatedModule = { exports: {} }; cache.set(name, isolatedModule.exports);
    const require = dependency => {
      if (dependency === '../supabase-server') return { getSupabaseServerClient() { throw new Error('unexpected_default_database_client'); } };
      if (['node:crypto', 'node:async_hooks'].includes(dependency)) return nativeRequire(dependency);
      if (dependency === '../public-source-url.ts') return nativeRequire('../public-source-url.ts');
      if (dependency==='../candidate-price-history.ts')return load(dependency);
      if (dependency.startsWith('./')) return load(dependency.slice(2));
      throw new Error(`unexpected_discovery_dependency:${dependency}`);
    };
    vm.compileFunction(compiled, ['exports', 'require', 'module'], { filename: filename.pathname })(isolatedModule.exports, require, isolatedModule);
    return isolatedModule.exports;
  }
  return load('discovery.ts');
}
