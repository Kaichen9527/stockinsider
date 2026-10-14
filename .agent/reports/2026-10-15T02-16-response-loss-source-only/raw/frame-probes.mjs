// Hermetic builtins-only frame probes. Never calls createOwnedPgLossRelay or opens a socket.
import assert from 'node:assert/strict';
import {backendFrames,sealResponseGate,LOSS_LIMIT}from'/tmp/si-pubtail-o14/scripts/opportunity-v3/research-versioned-response-loss-transport.mjs';
const frame=(type,body=Buffer.alloc(0))=>{const b=Buffer.alloc(5+body.length);b[0]=type.charCodeAt(0);b.writeUInt32BE(4+body.length,1);body.copy(b,5);return b;};
const row=Buffer.from([0,1,0,0,0,2,123,125]);const wire=Buffer.concat([frame('1'),frame('2'),frame('T'),frame('D',row),frame('C',Buffer.from('SELECT 1\0')),frame('Z',Buffer.from('I'))]);
const results=[];function probe(name,fn){fn();results.push({name,status:'PASS'});}
function read(parts){const gate=sealResponseGate(),parser=backendFrames((...a)=>gate.frame(...a));try{for(const p of parts)parser.push(p);assert.equal(parser.pendingBytes,0,'incomplete_frame');return gate.receipt();}finally{parser.wipe();}}
for(const step of[1,2,3,4,5,7,13,wire.length])probe('fragment width '+step,()=>{const parts=[];for(let i=0;i<wire.length;i+=step)parts.push(wire.subarray(i,i+step));const r=read(parts);assert.equal(r.ready,'I');assert.equal(r.commandCount,1);assert.equal(r.dataRowCount,1);assert.deepEqual(r.frames.map(f=>f.type),['1','2','T','D','C','Z']);});
probe('every single split position',()=>{for(let i=0;i<=wire.length;i++)assert.equal(read([wire.subarray(0,i),wire.subarray(i)]).ready,'I');});
for(const[name,b]of[['error then ready',Buffer.concat([frame('E',Buffer.from('error\0')),frame('Z',Buffer.from('I'))])],['ready alone',frame('Z',Buffer.from('I'))],['transaction not idle',Buffer.concat([frame('D',row),frame('C',Buffer.from('SELECT 1\0')),frame('Z',Buffer.from('T'))])],['wrong command',Buffer.concat([frame('D',row),frame('C',Buffer.from('SELECT 0\0')),frame('Z',Buffer.from('I'))])],['extra frame after ready',Buffer.concat([wire,frame('N')])],['trailing partial header',Buffer.concat([wire,Buffer.from([68])])],['no ready',wire.subarray(0,wire.length-6)]])probe(name,()=>assert.throws(()=>read([b])));
for(const length of[0,3,LOSS_LIMIT,0xffffffff])probe('invalid declared length '+length,()=>{const b=Buffer.alloc(5);b[0]=68;b.writeUInt32BE(length,1);assert.throws(()=>read([b]));});
probe('chunk over cap',()=>assert.throws(()=>read([Buffer.alloc(LOSS_LIMIT+1)])));
probe('frame count bound',()=>{const p=backendFrames(()=>{});try{assert.throws(()=>{for(let i=0;i<4097;i++)p.push(frame('N'));});}finally{p.wipe();}});
probe('retained incomplete frame wiped',()=>{const p=backendFrames(()=>{});p.push(Buffer.from([68,0,0]));assert.equal(p.pendingBytes,3);p.wipe();assert.equal(p.pendingBytes,0);});
probe('command bytes must be exact, not ASCII high-bit masked',()=>{const body=Buffer.from('SELECT 1\0');body[0]|=0x80;assert.throws(()=>read([Buffer.concat([frame('D',row),frame('C',body),frame('Z',Buffer.from('I'))]) ]));});
console.log(JSON.stringify({scope:'hermetic frame parsing only; no socket/server/PG/app import',count:results.length,results,native:'NOT_RUN'},null,2));
