import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import ts from 'typescript';
/** Reuse only the existing synthetic source-row fixture definitions, without
 * executing or editing any original authority test. No real acquisition claim. */
export function historicalAuthorityFixture(){
 const original=fs.readFileSync(new URL('../tw-entry-plan-authority.test.ts',import.meta.url),'utf8');
 const definitions=original.slice(original.indexOf('type Row ='),original.indexOf("test('loads 240"));
 if(!definitions.includes('function fixture(') || !definitions.includes('function mockClient('))throw Error('original_authority_fixture_shape_changed');
 const compiled=ts.transpileModule(definitions,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 return vm.compileFunction(`${compiled}\nreturn {fixture,mockClient};`,['createHash'],{filename:'vnext-trusted-synthetic-authority-fixture'})(createHash);
}
