import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,rm,writeFile,lstat} from 'node:fs/promises';
import {userInfo} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {FinancialDeadline,readPinnedFinancialFiles} from '/workspace/cloud-reviewer-result-http-vm-oct09/web/src/lib/research-financial-file-reader.ts';
import {financialInventory} from '/workspace/cloud-reviewer-result-http-vm-oct09/web/src/lib/research-financial-inventory.ts';
const repo='/workspace/cloud-reviewer-result-http-vm-oct09',art='/tmp/si-home-isolation-e86ou3n9',home=userInfo().homedir;
const root=await mkdtemp(path.join(home,'.si-home-isolation-probe-'));
const existing=path.join(root,'existing-sibling');await mkdir(existing);
const pins=financialInventory.companies['2409'];
for(const p of pins){const target=path.join(root,p.path);await mkdir(path.dirname(target),{recursive:true});await cp(path.join(repo,p.path),target);}
const stat=async()=>{const s=await lstat(home,{bigint:true});return Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs'].map(k=>[k,String(s[k])]));};
const observations=[];
try {
 let wrote=false;const nestedBefore=await stat();
 const nested=await readPinnedFinancialFiles(root,pins,new FinancialDeadline(),async n=>{if(n.startsWith('before_open:')&&!wrote){wrote=true;await writeFile(path.join(existing,'unrelated.txt'),'synthetic nested writer');}});
 try{await nested.validate();}finally{await nested.close();}
 const nestedAfter=await stat();assert.deepEqual(nestedAfter,nestedBefore);observations.push({case:'write_inside_existing_sibling',outcome:'reader_success',before:nestedBefore,after:nestedAfter});
 let spawned=false;let childResult;const before=await stat();
 await assert.rejects(readPinnedFinancialFiles(root,pins,new FinancialDeadline(),async n=>{
  if(n.startsWith('before_open:')&&!spawned){spawned=true;const startedAt=new Date().toISOString();
   const output=execFileSync(process.execPath,['--experimental-strip-types','--test','--test-reporter=tap','scripts/research-release-artifacts.test.mjs'],{cwd:repo,encoding:'utf8',timeout:8000,maxBuffer:1048576});
   writeFileSync(path.join(art,'adjacent-release-fixture.stdout'),output);childResult={command:[process.execPath,'--experimental-strip-types','--test','--test-reporter=tap','scripts/research-release-artifacts.test.mjs'],startedAt,completedAt:new Date().toISOString(),exit:0};
  }
 }),{message:'financial_parent_replaced'});
 const after=await stat();assert.equal(before.dev,after.dev);assert.equal(before.ino,after.ino);assert.notDeepEqual(before,after);
 observations.push({case:'actual_release_artifacts_fixture_during_reader_checkpoint',outcome:'expected_financial_parent_replaced',writer:'controlled actual scripts/research-release-artifacts.test.mjs child fixture mkdtemp/rm at OS home',before,after,childResult});
 const sequenceBefore=await stat();const loaded=await readPinnedFinancialFiles(root,pins,new FinancialDeadline());
 try{await loaded.validate();assert.equal(loaded.records.size,pins.length);}finally{await loaded.close();}
 const sequenceAfter=await stat();assert.deepEqual(sequenceBefore,sequenceAfter);
 observations.push({case:'reader_after_actual_release_fixture_finished',outcome:'reader_success',before:sequenceBefore,after:sequenceAfter});
 console.log(JSON.stringify({observations,syntheticSetup:true,readerAndFixtureUnchanged:true,ciHistoricalWriterProven:false,cleanup:'finally removes only owned probe root after reader cleanup'},null,2));
}finally{await rm(root,{recursive:true,force:true});}
