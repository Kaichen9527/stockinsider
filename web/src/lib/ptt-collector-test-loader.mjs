import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const nativeRequire = createRequire(import.meta.url);

/** Isolated verification of the actual collector composition. No production
 * environment/client/provider is loaded; every unused external edge fails. */
export function loadActualPttCollector() {
  const cache = new Map();
  const sources = new Set(['research-v2.ts', 'ptt-article-parser.ts', 'ptt-mention-provenance.ts', 'vnext/evidence-clock.ts']);
  const nodes = new Set(['path', 'crypto', 'util', 'node:crypto']);
  const context = vm.createContext({ Buffer, URL, TextDecoder, process: { env: {}, cwd: () => '/NONPRODUCTION' },
    fetch() { throw Error('unexpected_ptt_test_network'); } });
  function load(name) {
    if (!sources.has(name)) throw Error('unexpected_ptt_test_source');
    if (cache.has(name)) return cache.get(name);
    const filename = new URL(name, import.meta.url);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: name,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const module = { exports: {} }; cache.set(name, module.exports);
    const require = dependency => {
      if (nodes.has(dependency) || dependency === 'parse5') return nativeRequire(dependency);
      if (dependency === 'child_process') return { execFile() { throw Error('unexpected_ptt_test_process'); } };
      if (dependency === 'fs/promises') return new Proxy({}, { get(_, key) { if (key === '__esModule') return false; throw Error('unexpected_ptt_test_filesystem'); } });
      if (['./ptt-article-parser.ts', './ptt-mention-provenance'].includes(dependency)) return load(dependency.includes('parser') ? 'ptt-article-parser.ts' : 'ptt-mention-provenance.ts');
      if (dependency === './vnext/evidence-clock.ts') return load('vnext/evidence-clock.ts');
      if (!dependency.startsWith('./')) throw Error('unexpected_ptt_test_dependency');
      return new Proxy({}, { get() { throw Error('unexpected_ptt_test_external_edge'); } });
    };
    vm.compileFunction(compiled, ['exports', 'require', 'module'], { filename: filename.pathname, parsingContext: context })(module.exports, require, module);
    return module.exports;
  }
  return { projectPttCollectorArticle: load('research-v2.ts').projectPttCollectorArticle };
}
