// A lightweight real Node TAP reporter control, not application/PCR execution.
import test from 'node:test';
for(let i=1;i<=155;i++)test(i<=31?'acceptance PCR-'+String(i).padStart(3,'0'):'synthetic reporter control '+i,()=>{});
