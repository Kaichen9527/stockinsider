import {readMediaTekQ4OperatingGuidance} from '../src/lib/vnext/issuer-operating-guidance.ts';

if(process.argv.length!==2)throw Error('usage: replay-mediatek-operating-guidance.mjs');
const receipt=await readMediaTekQ4OperatingGuidance();
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
