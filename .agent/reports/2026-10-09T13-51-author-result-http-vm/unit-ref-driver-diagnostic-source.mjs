import {after} from 'node:test';
// The deadline intentionally uses unref timers. Keep the test process alive
// until its awaited stalled-I/O cases settle; do not change production timers.
const keepAlive=setInterval(()=>{},1000);
after(()=>clearInterval(keepAlive));
await import('./research-author-result.test.mjs');
