import { open } from 'node:fs/promises';
import { calculateEarningsBridge } from '../src/lib/vnext/earnings-bridge.ts';

if (process.argv.length !== 3) throw Error('usage: replay-earnings-bridge.mjs input.json');
const file=await open(process.argv[2],'r');
try {
  const count=(await file.stat()).size;
  if(count<1||count>32768)throw Error('earnings_bridge_input_size');
  const bytes=Buffer.alloc(count+1);
  const data=await file.read(bytes,0,bytes.length,0);
  if(data.bytesRead!==count)throw Error('earnings_bridge_input_size');
  const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,count)));
  process.stdout.write(JSON.stringify(calculateEarningsBridge(input),null,2)+'\n');
} finally {
  await file.close();
}
