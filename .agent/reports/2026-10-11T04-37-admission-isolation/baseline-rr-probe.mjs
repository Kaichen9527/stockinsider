import {execFileSync} from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire}from'node:module';
const root=process.cwd(),{Client}=createRequire(path.join(root,'package.json'))('pg');
const bin=execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'si-rr-')),port=55300+process.pid%1000;
const run=(name,args)=>execFileSync(path.join(bin,name),args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const sql=q=>run('psql',['-X','-At','-v','ON_ERROR_STOP=1','-h',dir,'-p',String(port),'-d','postgres','-c',q]);
let started=false;let a,b;
try{
 run('initdb',['-D',path.join(dir,'pg'),'-A','trust','--no-instructions']);
 run('pg_ctl',['-D',path.join(dir,'pg'),'-l',path.join(dir,'pg.log'),'-o',`-h '' -k ${dir} -p ${port}`,'-w','start']);started=true;
 const original=fs.readFileSync(path.join(root,'scripts/research-source-budget-postgres.test.mjs'),'utf8');
 const bootstrap=original.match(/sql\(`(CREATE ROLE anon NOLOGIN;[\s\S]*?)`\);/u)?.[1];if(!bootstrap)throw Error('bootstrap_not_found');sql(bootstrap);
 for(const file of ['20260907_candidate_dossier_outbox_v5.sql','20260929_candidate_dossier_outbox_v6.sql','20260929_research_agent_state_v1.sql','20260929_research_deep_jobs_v1.sql'])run('psql',['-X','-v','ON_ERROR_STOP=1','-h',dir,'-p',String(port),'-d','postgres','-f',path.join(root,'migrations',file)]);
 a=new Client({host:dir,port,database:'postgres'});b=new Client({host:dir,port,database:'postgres'});await a.connect();await b.connect();
 await b.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 const snapshot=(await b.query('SELECT count(*)::int AS n FROM research_model_reservations_v1')).rows[0].n;
 const first=(await a.query("SELECT reservation_id FROM reserve_research_model_v1('discovery','rr-probe-a','rr-probe-a')")).rows;
 const second=(await b.query("SELECT reservation_id FROM reserve_research_model_v1('technical','rr-probe-b','rr-probe-b')")).rows;
 await b.query('COMMIT');
 const count=(await a.query('SELECT count(*)::int AS n FROM research_model_reservations_v1')).rows[0].n;
 console.log(JSON.stringify({source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),probe:'two actual connections, second RR snapshot before first committed reservation',snapshot,firstReservations:first.length,secondReservations:second.length,durableActiveReservations:count,globalSingleLeaseRespected:count<=1,syntheticOwners:true,fullProductionSchema:false}));
}catch(e){console.error(e);process.exitCode=1;}finally{for(const c of[a,b])if(c)await c.end().catch(()=>{});if(started)run('pg_ctl',['-D',path.join(dir,'pg'),'-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
