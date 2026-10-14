// Test preload only. Must execute before application ESM captures fs/promises.open.
import fs from 'node:fs';import {syncBuiltinESMExports}from'node:module';
const witness={opens:0,closes:0},key=Symbol.for('stockinsider.local.prerequisite.fs-witness');
if(globalThis[key])throw Error('duplicate_fixture_witness');globalThis[key]=witness;
const original=fs.promises.open;
fs.promises.open=async function(file,...args){const handle=await original.call(this,file,...args);if(typeof file==='string'&&file.includes('/.versioned-prerequisite-')){witness.opens++;const close=handle.close.bind(handle);let closed=false;handle.close=async()=>{const result=await close();if(!closed){closed=true;witness.closes++;}return result;};}return handle;};
syncBuiltinESMExports();
