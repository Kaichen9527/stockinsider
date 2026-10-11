import assert from 'node:assert/strict';
import http from 'node:http';

// Isolated test transport only. No environment credentials or external egress.
export async function dropFirstPublicationResponse({origin, payload, authorization}) {
  const target = new URL('/api/internal/research-deep-job', origin);
  assert.equal(target.protocol, 'http:');
  assert.equal(target.hostname, '127.0.0.1');
  assert.ok(target.port && /^Bearer [^\r\n]+$/u.test(authorization));
  const body = Buffer.from(JSON.stringify(payload));
  assert.ok(body.length <= 8192);
  const sockets = new Set();
  let upstream, caller, timer, upstreamStatus = null, requests = 0;
  const server = http.createServer((request, response) => {
    if (++requests !== 1 || request.method !== 'POST' || request.url !== '/') {
      response.writeHead(400); response.end(); return;
    }
    const chunks = []; let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > 8192) request.destroy(); else chunks.push(chunk);
    });
    request.on('end', () => {
      if (!Buffer.concat(chunks).equals(body)) { request.destroy(); return; }
      upstream = http.request(target, {method:'POST', headers:{
        'content-type':'application/json', authorization, 'content-length':body.length,
        'x-research-input-version':'2', 'x-research-publication-action':'publishResearchArticle',
      }}, incoming => {
        // Next sends this response after its awaited publication transaction.
        // Forward zero bytes: the caller must see a real broken TCP connection.
        upstreamStatus = incoming.statusCode;
        request.socket.destroy(); incoming.destroy(); upstream.destroy();
      });
      upstream.on('error', () => request.socket.destroy());
      upstream.end(body);
    });
  });
  server.on('connection', socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {server.once('error', reject);server.listen(0,'127.0.0.1',resolve);});
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('publication_response_drop_timeout')),15000);
      caller = http.request({hostname:'127.0.0.1',port:server.address().port,path:'/',method:'POST',
        headers:{'content-type':'application/json','content-length':body.length}}, incoming => {
        incoming.destroy(); reject(new Error('publication_response_was_forwarded'));
      });
      caller.on('error', error => {
        if (upstreamStatus === null) reject(new Error('publication_upstream_response_not_observed'));
        else resolve({upstreamStatus,callerErrorCode:error.code,requests,forwardedResponseBytes:0});
      });
      caller.end(body);
    });
  } finally {
    clearTimeout(timer); caller?.destroy(); upstream?.destroy();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
}
