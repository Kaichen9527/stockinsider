'use client';
import {useEffect,useState} from 'react';
/** Display-only demotion. These server-validated primitives never renew a
 * qualification, fetch a source or confer authority on the browser. */
export default function LaunchCurrentStatus({initialCurrent,remainingMs,readAt,expiresAt}:{initialCurrent:boolean;remainingMs:number;readAt:string;expiresAt:string|null}){
  const bounded=Number.isFinite(remainingMs)&&remainingMs>0&&remainingMs<=120000;
  const [active,setActive]=useState(initialCurrent&&bounded);
  const current=active&&initialCurrent&&bounded&&expiresAt!==null;
  useEffect(()=>{
    if(!initialCurrent||!bounded||!expiresAt)return;
    const start=performance.now(),wallDeadline=Date.parse(expiresAt);let timer:ReturnType<typeof setTimeout>;
    const check=()=>{
      // A slow/wrong browser wallclock cannot extend the server's lifetime.
      const remaining=Math.min(remainingMs-(performance.now()-start),wallDeadline-Date.now());
      if(!Number.isFinite(remaining)||remaining<=0){setActive(false);return;}
      timer=setTimeout(check,remaining);
    };
    timer=setTimeout(check,0);return()=>clearTimeout(timer);
  },[initialCurrent,bounded,remainingMs,expiresAt]);
  return <p className="mt-2" data-testid="launch-current-status" data-current={current?'true':'false'}>{current?<>
    於 <time>{readAt}</time> 讀取時研究條件符合；這次核對有效至 <time>{expiresAt}</time>，仍須另行評估。
  </>:'目前等待、核對已逾期或尚待重新驗證；原榜單保留。'}</p>;
}
