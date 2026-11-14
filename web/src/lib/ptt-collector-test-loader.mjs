import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const nativeRequire = createRequire(import.meta.url);

/** Isolated verification of the actual collector composition. No production
 * environment/client/provider is loaded; every unused external edge fails. */
export function loadActualPttCollector() {
  const cache = new Map();
  const sources = new Set(['research-v2.ts', 'ptt-article-parser.ts', 'vnext/evidence-clock.ts']);
  const context = vm.createContext({ Buffer, URL, TextDecoder, process: { env: {}, cwd: () => '/NONPRODUCTION' },
    fetch() { throw Error('unexpected_ptt_test_network'); } });
  function load(name) {
    if (!sources.has(name)) throw Error('unexpected_ptt_test_source');
    if (cache.has(name)) return cache.get(name);
    const filename = new URL(name, import.meta.url);
    let source = fs.readFileSync(filename, 'utf8');
    if (name === 'research-v2.ts') {
      // Execute the real composition and real symbol matcher without unrelated
      // top-level provider configuration or environment/constants initialization.
      const ast = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
      const names = ['compactText', 'extractTwSymbolsWithEvidence', 'projectPttCollectorArticle'];
      const declarations = names.map(expected => {
        const matches = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === expected);
        if (matches.length !== 1) throw Error('unexpected_ptt_test_function');
        return matches[0].getText(ast);
      });
      source = "import {parsePttArticleHtml,pttBodyProvenance,pttPublicationKnownAt,matchPttFinancialSummarySymbols} from './ptt-article-parser.ts';\n" + declarations.join('\n');
    }
    const compiled = ts.transpileModule(source, { fileName: name,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const isolatedModule = { exports: {} }; cache.set(name, isolatedModule.exports);
    const require = dependency => {
      if (dependency === 'node:crypto' || dependency === 'parse5') return nativeRequire(dependency);
      if (dependency === './ptt-article-parser.ts') return load('ptt-article-parser.ts');
      if (dependency === './vnext/evidence-clock.ts') return load('vnext/evidence-clock.ts');
      throw Error('unexpected_ptt_test_dependency');
    };
    vm.compileFunction(compiled, ['exports', 'require', 'module'], { filename: filename.pathname, parsingContext: context })(isolatedModule.exports, require, isolatedModule);
    return isolatedModule.exports;
  }
  return { projectPttCollectorArticle: load('research-v2.ts').projectPttCollectorArticle };
}
