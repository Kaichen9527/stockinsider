import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {dropFirstPublicationResponse} from './research-publication-http-drop.mjs';

test('loopback first-response drop performs one request and sends no response to caller',async()=>{
  let committed = 0;
  const server=http.createServer((request,response)=>{
    assert.equal(request.url,'/api/internal/research-deep-job');
    assert.equal(request.headers['x-research-publication-action'],'publishResearchArticle');
    assert.equal(request.headers.authorization,'Bearer synthetic-isolated-test');
    request.resume(); request.on('end',()=>{committed++;response.writeHead(200,{'content-type':'application/json'});response.end('{"committed":true}');});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const result=await dropFirstPublicationResponse({origin:`http://127.0.0.1:${server.address().port}/`,
      payload:{action:'publishResearchArticle'},authorization:'Bearer synthetic-isolated-test'});
    assert.deepEqual(result,{upstreamStatus:200,callerErrorCode:'ECONNRESET',requests:1,forwardedResponseBytes:0});
    assert.equal(committed,1);
    await assert.rejects(dropFirstPublicationResponse({origin:'https://example.com/',payload:{},authorization:'Bearer synthetic-isolated-test'}));
  } finally {await new Promise(resolve=>server.close(resolve));}
});
