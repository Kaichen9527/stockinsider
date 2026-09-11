import {candidateMopsDownloadUrl,parseCandidateMopsFacts} from '../web/src/lib/candidate-official-financials.ts';
// An explicit operator backfill. Output must be piped to the authenticated
// submitter; no credential, local artifact or fabricated fact is produced.
const [stockId,symbol,exchange,yearText,quarterText]=process.argv.slice(2);
if(!/^[0-9a-f-]{36}$/i.test(stockId||''))throw new Error('stock_uuid_required');
if(!['TWSE','TPEX'].includes(exchange))throw new Error('exchange_required');
const year=Number(yearText),quarter=Number(quarterText);
const sourceUrl=candidateMopsDownloadUrl(symbol,year,quarter);
const response=await fetch(new URL(sourceUrl).origin+new URL(sourceUrl).pathname,{
  method:'POST',body:new URL(sourceUrl).searchParams,redirect:'error',signal:AbortSignal.timeout(20000),
});
if(!response.ok||!response.body)throw new Error(`official_document_http_${response.status}`);
const chunks=[];let size=0;
for await(const chunk of response.body){size+=chunk.byteLength;if(size>12000000)throw new Error('official_document_too_large');chunks.push(chunk);}
const bytes=Buffer.concat(chunks),collectedAt=new Date().toISOString();
const periodEnd=`${year}-${['03-31','06-30','09-30','12-31'][quarter-1]}`;
const facts=parseCandidateMopsFacts(new TextDecoder('utf-8',{fatal:true}).decode(bytes),{stockId,symbol,exchange,sourceUrl,collectedAt});
if(!facts.some(f=>f.periodEnd===periodEnd))throw new Error('official_document_has_no_requested_period_facts');
process.stdout.write(JSON.stringify({metadata:{stockId,symbol,exchange,periodEnd,sourceUrl,publishedAt:null,acquisitionJobId:null},contentType:'application/xhtml+xml',base64:bytes.toString('base64')}));
