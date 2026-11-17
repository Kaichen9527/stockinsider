import {sanitizePublicSourceUrl,isSensitivePublicSourceQueryKey} from '../public-source-url.ts';
/** URL safety only. This function never establishes acquisition/publication
 * rights; a public projection must separately bind its source permission. */
function decoded(value:string):string|null {
  let result=value;
  for(let i=0;i<4&&result.includes('%');i++){
    try{result=decodeURIComponent(result);}catch{return null;}
  }
  return result.includes('%')?null:result.normalize('NFKC');
}
const secretKey=(key:string)=>/token|apikey|authorization|authenticate|credential|password|secret|signature|jwt|bearer/u.test(key)
  ||['auth','sig','key','session','sessionid','sid'].includes(key);
const trackedKey=(key:string)=>/^(?:utm|clickid|gclid|fbclid|mceid|mccid|email|recipient|redirect|destination|return|continue|next|url|target|dest|referrer|refid)$/u.test(key)
  ||key.startsWith('utm')||key.startsWith('redirect')||key.startsWith('return');
export function publicCitation(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\u0000-\u0020\u007f\\#]/u.test(value)) return null;
  try {
    const url = new URL(value);
    if(sanitizePublicSourceUrl(value)!==url.toString())return null;
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port && !['80', '443'].includes(url.port)) return null;
    const host = url.hostname.toLowerCase();
    if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/u.test(host) || /(?:^|\.)(?:localhost|local|internal|test)$/u.test(host)) return null;
    const path=decoded(url.pathname);
    if(path===null||/[\u0000-\u0020\u007f\\?#]/u.test(path)
      ||/(?:^|[/_.-])(?:paid|members?|premium|subscriptions?|vip(?:_contents)?|login|authenticate)(?:[/_.-]|$)/iu.test(path))return null;
    const investAnchors=/investanchors/iu.test(host);
    if(investAnchors&&/paid|member|premium|subscription/iu.test(path))return null;
    if(/(?:^|[.-])(?:click|track|tracking|email|mail|newsletter|mandrillapp|sendgrid|mailchimp)(?:[.-]|$)/iu.test(host)
      ||/(?:^|\/)(?:track|tracking|click|redirect|out|go)(?:\/|$)/iu.test(path))return null;
    for(const [rawKey,rawValue] of url.searchParams){
      const key=decoded(rawKey),item=decoded(rawValue);
      if(key===null||item===null||/[\u0000-\u001f\u007f\\#]/u.test(key+item))return null;
      const name=key.toLowerCase().replace(/[^a-z0-9]/gu,'');
      if(investAnchors&&/paid|member|premium|subscription/iu.test(key+item))return null;
      if(isSensitivePublicSourceQueryKey(key)||secretKey(name)||trackedKey(name)||/https?:\/\//iu.test(item)
        ||/(?:token|api[_-]?key|password|secret|signature|authorization)\s*[=:]/iu.test(item))return null;
    }
    return url.toString();
  } catch { return null; }
}
