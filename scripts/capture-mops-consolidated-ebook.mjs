// Staging capture. The output directory is new and private for each receipt.
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { captureMopsConsolidatedEbook } from '../web/src/lib/vnext/mops-consolidated-ebook.ts';

const [symbol, year, quarter, output] = process.argv.slice(2);
if (process.argv.length !== 6 || !output || !isAbsolute(output)) {
  throw Error('Usage: node --experimental-strip-types scripts/capture-mops-consolidated-ebook.mjs SYMBOL YEAR QUARTER /absolute/new/staging-directory');
}
const { receipt, originals } = await captureMopsConsolidatedEbook({ symbol, year: Number(year), quarter: Number(quarter) });
await mkdir(output, { mode: 0o700 });
if (originals.holdingCompanyIndex) {
  await writeFile(join(output, 'holding-company-index.html'), originals.holdingCompanyIndex, { flag: 'wx', mode: 0o600 });
}
await writeFile(join(output, 'listing.html'), originals.listing, { flag: 'wx', mode: 0o600 });
await writeFile(join(output, 'download-handoff.html'), originals.handoff, { flag: 'wx', mode: 0o600 });
await writeFile(join(output, 'report.pdf'), originals.pdf, { flag: 'wx', mode: 0o600 });
const manifest = JSON.stringify(receipt, null, 2) + '\n';
await writeFile(join(output, 'receipt.json'), manifest, { flag: 'wx', mode: 0o600 });
process.stdout.write(manifest);
