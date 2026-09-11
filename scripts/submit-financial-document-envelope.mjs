import {readFileSync} from 'node:fs';
// Run on the active VPS. Credentials stay in the service environment, not in
// command arguments, response output, uploaded metadata or downloaded files.
if(!process.env.INTERNAL_API_KEY)throw new Error('internal_key_missing');
const input=JSON.parse(readFileSync(0,'utf8'));
const response=await fetch('http://127.0.0.1:3100/api/internal/candidate-financial-documents',{
  method:'POST',headers:{Authorization:`Bearer ${process.env.INTERNAL_API_KEY}`,
    'content-type':input.contentType,'x-candidate-financial-document-metadata':JSON.stringify(input.metadata)},
  body:Buffer.from(input.base64,'base64'),signal:AbortSignal.timeout(60000),
});
const result=await response.json();
console.log(JSON.stringify({httpStatus:response.status,ok:result.ok,receiptId:result.receiptId,status:result.status,error:result.error}));
if(!response.ok||result.ok!==true)process.exitCode=1;
