import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import ts from '../web/node_modules/typescript/lib/typescript.js';
import {businessCalculatorExecutionHash} from '../web/src/lib/research-business-calculator.ts';
// Read-only static AST extraction of the current compiled artifact; no eval,
// compiled module execution, HTTP request, SQL mutation or fingerprint override.
const folder='web/.next/server/chunks';
const files=fs.readdirSync(folder).filter(f=>f.endsWith('.js')&&fs.readFileSync(path.join(folder,f),'utf8').includes('business-calculator-core-v2.2'));
assert.equal(files.length,1);
const file=path.join(folder,files[0]),raw=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
let target;
const visit=n=>{if(ts.isFunctionDeclaration(n)&&n.getText(tree).includes('business-calculator-core-v2.2'))target=n;ts.forEachChild(n,visit);};visit(tree);assert.ok(target);
let scope=target.parent;assert.ok(ts.isBlock(scope));
const declarations=new Map(),functions=new Map();for(const n of scope.statements){if(ts.isFunctionDeclaration(n))functions.set(n.name.text,n.getText(tree));if(ts.isVariableStatement(n))for(const d of n.declarationList.declarations)declarations.set(d.name.getText(tree),d.initializer);}
const literal=n=>{if(ts.isStringLiteral(n))return n.text;if(ts.isArrayLiteralExpression(n))return n.elements.map(literal);if(ts.isIdentifier(n)){assert.ok(declarations.has(n.text),n.text);return literal(declarations.get(n.text));}throw Error('unsupported static literal '+n.kind);};
let object;const objects=n=>{if(ts.isObjectLiteralExpression(n)&&n.properties.some(p=>p.name?.getText(tree)==='version'&&p.initializer?.text==='business-calculator-core-v2.2'))object=n;ts.forEachChild(n,objects);};objects(target);assert.ok(object);
const value={};for(const p of object.properties){const key=p.name.getText(tree);if(key==='functions'){assert.ok(ts.isCallExpression(p.initializer));const array=p.initializer.expression.expression;assert.ok(ts.isArrayLiteralExpression(array));value[key]=array.elements.map(n=>{const name=n.getText(tree);assert.ok(functions.has(name),'missing function '+name);return functions.get(name);});}else value[key]=literal(p.initializer);}
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const compiledStaticHash=createHash('sha256').update(canonical(value)).digest('hex'),sourceRuntimeHash=businessCalculatorExecutionHash();
console.log(JSON.stringify({schemaVersion:'author-result-build-identity-diagnostic-v1',compiledChunk:file,compiledChunkBytes:Buffer.byteLength(raw),compiledChunkSha256:createHash('sha256').update(raw).digest('hex'),functions:value.functions.length,sourceRuntimeHash,compiledStaticHash,match:sourceRuntimeHash===compiledStaticHash,method:'static AST extraction of exact named functions and constant arrays used by compiled Function.toString digest; no compiled execution',native409CauseStatus:'fingerprint mismatch demonstrated; precise server rejection phase not exposed by handler'},null,2));
