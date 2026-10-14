import {createRequire} from 'node:module';import fs from 'node:fs';
const require=createRequire(import.meta.url);
await import('/tmp/si-pubtail-o14/scripts/opportunity-v3/apply-reviewed-migrations.mjs');
const loaded=Object.keys(require.cache).filter(p=>p.includes('/scripts/runtime/')).map(p=>p.split('/tmp/si-pubtail-o14/')[1]).sort();
fs.writeFileSync('/tmp/pubtail-review-o14/actually-loaded-runtime.json',JSON.stringify(loaded,null,2)+'\n');console.log(JSON.stringify(loaded));
