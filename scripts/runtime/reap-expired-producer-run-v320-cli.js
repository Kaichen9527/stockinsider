#!/usr/bin/env node
'use strict';

// Recover a single reviewed release's expired producer lease.  This is an
// incident-recovery command, not a general cancellation tool: the database
// function selects only one expired run whose exact identity was supplied.

const { canonicalJson } = require('./codec');
const { resolvePostgresConnectionReference } = require('./credential-resolver');
const { createPostgresLegacyProducerAdapter } = require('./postgres-legacy-producer-adapter');

const SHA40=/^[0-9a-f]{40}$/u;
const SHA256=/^[0-9a-f]{64}$/u;

function parseArguments(argv) {
  const result={sourceCommitSha:null,workerSha256:null,configSha256:null};
  for(let index=0;index<argv.length;index+=1){
    const value=argv[index];
    if(value==='--source-commit'&&SHA40.test(argv[index+1]??''))result.sourceCommitSha=argv[++index];
    else if(value==='--worker-sha256'&&SHA256.test(argv[index+1]??''))result.workerSha256=argv[++index];
    else if(value==='--config-sha256'&&SHA256.test(argv[index+1]??''))result.configSha256=argv[++index];
    else throw new Error('invalid_arguments');
  }
  if(!result.sourceCommitSha||!result.workerSha256||!result.configSha256)throw new Error('invalid_arguments');
  return Object.freeze(result);
}

async function main() {
  const input=parseArguments(process.argv.slice(2));
  const adapter=createPostgresLegacyProducerAdapter({connectionString:
    resolvePostgresConnectionReference('keychain:stockinsider-runtime:database-url')});
  try {
    const outcome=await adapter.reapExpiredLegacyProducerRun(input);
    process.stdout.write(`${canonicalJson({schema:'stockinsider-v3.20-expired-run-reaper-v1',...outcome})}\n`);
  } finally { await adapter.close(); }
}

if(require.main===module)main().catch((error)=>{process.stderr.write(`expired-run reaper failed: ${error?.message??String(error)}\n`);process.exitCode=1;});

module.exports={parseArguments};
