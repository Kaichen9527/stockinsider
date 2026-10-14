// Language-primitive experiment only, not a candidate implementation.
import assert from 'node:assert/strict';
const typedProto=Object.getPrototypeOf(Uint8Array.prototype);
const byteLength=Object.getOwnPropertyDescriptor(typedProto,'byteLength').get;
let propertyReads=0;
const results=[];
for(const kind of ['Uint8Array','Buffer']){
 const input=kind==='Buffer'?Buffer.from([1,2,3]):new Uint8Array([1,2,3]);
 for(const name of ['byteLength','buffer','length','slice','set','toJSON']) Object.defineProperty(input,name,{get(){propertyReads++;throw Error('caller getter executed');}});
 Object.defineProperty(input,Symbol.iterator,{get(){propertyReads++;throw Error('caller iterator executed');}});
 for(let i=0;i<10000;i++)Object.defineProperty(input,'unknown'+i,{get(){propertyReads++;throw Error('metadata getter executed');}});
 assert.equal(ArrayBuffer.isView(input),true);assert.equal(byteLength.call(input),3);
 const own=new Uint8Array(3); Uint8Array.prototype.set.call(own,input); assert.deepEqual(Array.from(own),[1,2,3]); own.fill(0);
 results.push({kind,unknownProperties:10000,propertyReads,copyMatched:true});
}
const proxy=new Proxy(new Uint8Array(3),{get(){propertyReads++;throw Error('proxy get');},getPrototypeOf(){propertyReads++;throw Error('proxy prototype');},ownKeys(){propertyReads++;throw Error('proxy keys');}});
assert.equal(ArrayBuffer.isView(proxy),false);assert.equal(ArrayBuffer.isView(new Map()),false);assert.equal(propertyReads,0);
console.log(JSON.stringify({kind:'intrinsic mechanism experiment, not runtime regression',results,proxyView:false,mapView:false,propertyReads,maxRSSKiB:process.resourceUsage().maxRSS},null,2));
