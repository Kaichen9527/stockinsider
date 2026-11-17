import {lstatSync,readFileSync} from 'node:fs';
import {replayTpexOpeningOutcome,TPEX_MTH_MAX_BYTES,TPEX_DAILY_MAX_BYTES} from '../src/lib/vnext/launch-opening-tpex-tape.ts';

function readFileWithin(path,cap){
  const info=lstatSync(path);
  if(!info.isFile()||info.size<1||info.size>cap)throw Error('tpex_opening_archive_file_size');
  const content=readFileSync(path);
  if(content.length!==info.size)throw Error('tpex_opening_archive_file_changed');
  return content;
}

const args=process.argv.slice(2);
if(args.length!==4){
  process.stderr.write('Usage: node web/scripts/replay-tpex-opening-outcome.mjs <packet.json> <symbol-day.txt> <prior.json> <day.json>\n');
  process.exitCode=2;
}else{
  try{
    const [packetPath,tapePath,priorPath,dayPath]=args;
    const {input,receipts}=JSON.parse(readFileWithin(packetPath,256*1024).toString('utf8'));
    const captures={tape:readFileWithin(tapePath,TPEX_MTH_MAX_BYTES),
      prior:readFileWithin(priorPath,TPEX_DAILY_MAX_BYTES),day:readFileWithin(dayPath,TPEX_DAILY_MAX_BYTES)};
    process.stdout.write(JSON.stringify(replayTpexOpeningOutcome(input,receipts,captures))+'\n');
  }catch(error){
    const reason=error instanceof Error&&/^(?:tpex_opening_archive_|launch_outcome_)[a-z_]{1,55}$/u.test(error.message)
      ?error.message:'tpex_opening_archive_replay_failed';
    process.stderr.write(reason+'\n');
    process.exitCode=2;
  }
}
