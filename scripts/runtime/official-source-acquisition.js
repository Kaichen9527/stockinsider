'use strict';

const dns = require('dns').promises;
const https = require('https');
const net = require('net');
const { canonicalJson, invariant, sha256 } = require('./codec');

const TERMINAL = new Set(['fresh','unchanged','no_new_items','missing_endpoint','auth_failed','provider_failed']);
const CONNECTOR_ATTEMPT = new Set(['items_found','successful_empty','metadata_only','missing_endpoint','auth_failed','provider_failed']);

function compactText(value, maximum = 100000) {
  return [...String(value ?? '').replace(/\r\n?/gu,'\n').normalize('NFKC')].slice(0,maximum).join('').trim();
}

function normalizedField(value) {
  return String(value??'').replace(/^\uFEFF/u,'').replace(/\r\n?/gu,'\n').normalize('NFKC');
}

function approvedHttpsUrl(value, expectedHost) {
  const parsed = new URL(String(value));
  invariant(parsed.protocol === 'https:' && (!expectedHost || parsed.hostname === expectedHost ||
    parsed.hostname.endsWith(`.${expectedHost}`)) && parsed.username === '' && parsed.password === '',
  'source URL authority');
  const bareHostname=parsed.hostname.replace(/^\[|\]$/gu,'');
  invariant(!net.isIP(bareHostname) && parsed.hostname !== 'localhost' && !parsed.hostname.endsWith('.localhost')
    && !parsed.hostname.endsWith('.local') && !parsed.hostname.endsWith('.internal'), 'source URL public host');
  return parsed.toString();
}

function isPublicAddress(value) {
  const address=String(value??'').toLowerCase().split('%')[0];
  const version=net.isIP(address);if(!version)return false;
  if(version===4){const octets=address.split('.').map(Number);return !(octets[0]===0||octets[0]===10||octets[0]===127
    ||octets[0]>=224||(octets[0]===169&&octets[1]===254)||(octets[0]===172&&octets[1]>=16&&octets[1]<=31)
    ||(octets[0]===192&&((octets[1]===0&&(octets[2]===0||octets[2]===2))||octets[1]===168))
    ||(octets[0]===100&&octets[1]>=64&&octets[1]<=127)
    ||(octets[0]===198&&(octets[1]===18||octets[1]===19||octets[1]===51&&octets[2]===100))
    ||(octets[0]===203&&octets[1]===0&&octets[2]===113));}
  if(address==='::'||address==='::1'||address.startsWith('fc')||address.startsWith('fd')
    ||/^fe[89ab]/u.test(address)||address.startsWith('ff')||address.startsWith('2001:db8:'))return false;
  if(address.startsWith('::ffff:')){
    const tail=address.slice(7);if(net.isIP(tail)===4)return isPublicAddress(tail);
    const words=tail.split(':');
    if(words.length===2&&words.every((word)=>/^[0-9a-f]{1,4}$/u.test(word))){
      const high=Number.parseInt(words[0],16);const low=Number.parseInt(words[1],16);
      return isPublicAddress(`${high>>>8}.${high&255}.${low>>>8}.${low&255}`);
    }
    return false;
  }
  const firstHextet=Number.parseInt(address.split(':')[0],16);
  return Number.isInteger(firstHextet)&&firstHextet>=0x2000&&firstHextet<=0x3fff;
}

async function resolvePublicAddresses(hostname,resolveHost=dns.lookup) {
  const resolved=await resolveHost(hostname,{all:true,verbatim:true});
  const rows=Array.isArray(resolved)?resolved:[resolved];
  const addresses=rows.map((row)=>typeof row==='string'?row:row?.address).filter(Boolean);
  invariant(addresses.length>0&&addresses.every(isPublicAddress),'source URL resolved private address');
  return addresses;
}

function allowedUrl(value,allowedOrigins) {
  const canonical=approvedHttpsUrl(value);const parsed=new URL(canonical);
  invariant(allowedOrigins.has(parsed.origin),'source URL origin not approved');return canonical;
}

async function pinnedHttpsFetch(url,options,maximumBytes,allowedOrigins,resolveHost) {
  let current=allowedUrl(url,allowedOrigins);
  for(let redirect=0;redirect<=3;redirect+=1){
    const parsed=new URL(current);const addresses=await resolvePublicAddresses(parsed.hostname,resolveHost);
    const response=await new Promise((resolve,reject)=>{
      const request=https.request(parsed,{method:'GET',headers:options.headers,servername:parsed.hostname,
        lookup:(_hostname,_options,callback)=>callback(null,addresses[0],net.isIP(addresses[0]))},(incoming)=>{
        const chunks=[];let length=0;
        incoming.on('data',(chunk)=>{length+=chunk.length;if(length>maximumBytes){request.destroy(new Error('provider_payload_bound'));return;}chunks.push(chunk);});
        incoming.on('end',()=>resolve({status:incoming.statusCode??0,headers:incoming.headers,bytes:Buffer.concat(chunks)}));
      });
      request.setTimeout(12000,()=>request.destroy(new Error('provider_timeout')));request.on('error',reject);request.end();
    });
    if(response.status>=300&&response.status<400){
      invariant(redirect<3&&typeof response.headers.location==='string','provider_redirect_rejected');
      current=allowedUrl(new URL(response.headers.location,current).toString(),allowedOrigins);continue;
    }
    if(response.status<200||response.status>=300){const error=new Error(`provider_http_${response.status}`);error.statusCode=response.status;throw error;}
    invariant(response.bytes.length>0&&response.bytes.length<=maximumBytes,'provider_payload_bound');
    return {bytes:response.bytes,contentType:String(response.headers['content-type']??''),statusCode:response.status,responseBytes:response.bytes.length};
  }
  throw new Error('provider_redirect_rejected');
}

function normalizedSourceInstant(value,{nullable=false}={}){
  if((value===null||value===undefined||value==='')&&nullable)return null;
  const raw=String(value??'').trim();
  invariant(raw.length>0&&/(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC)$/iu.test(raw),'source timestamp authority');
  const parsed=new Date(raw);invariant(Number.isFinite(parsed.getTime()),'source timestamp authority');
  return parsed.toISOString();
}

function decodeXml(value) {
  return compactText(value,100000).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu,'$1')
    .replace(/&lt;/gu,'<').replace(/&gt;/gu,'>').replace(/&quot;/gu,'"').replace(/&#39;/gu,"'").replace(/&amp;/gu,'&');
}

function element(xml, name) {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'iu').exec(xml);
  return match ? decodeXml(match[1]) : null;
}

function transcriptAttribute(xml, attribute) {
  const match = /<podcast:transcript\b([^>]*)\/?\s*>/iu.exec(xml);
  if (!match) return null;
  const value = new RegExp(`${attribute}=["']([^"']+)["']`,'iu').exec(match[1]);
  return value ? decodeXml(value[1]) : null;
}

function parsePodcastFeed(xml, profile) {
  invariant(typeof xml==='string' && Buffer.byteLength(xml)<=8_000_000,'podcast feed bound');
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)].slice(0,20);
  return items.map((match)=>({ profileId:profile.id,title:element(match[1],'title') ?? 'Untitled episode',
    stableId:element(match[1],'guid') ?? element(match[1],'link'),publishedAt:element(match[1],'pubDate'),
    sourceUrl:element(match[1],'link'),transcriptUrl:transcriptAttribute(match[1],'url'),
    transcriptType:transcriptAttribute(match[1],'type') })).filter((row)=>row.stableId);
}

function documentRevision({ sourceKey, profile, stableId, title, sourceUrl, publishedAt, transcript, collectedAt,
  terminalDisposition='accepted' }) {
  const normalizedTitle=normalizedField(title);
  const normalizedBody=normalizedField(transcript);
  const observed=[...normalizedTitle,...normalizedBody].slice(0,100001);
  if(observed.length===100001)return Object.freeze({sourceKey,profileId:profile.id,
    stableConnectorDocumentId:String(stableId).slice(0,512),distributionIdentity:`${sourceKey}:${profile.id}`,
    canonicalUrlCandidate:approvedHttpsUrl(sourceUrl),publishedAt:normalizedSourceInstant(publishedAt,{nullable:true}),
    collectedAt:normalizedSourceInstant(collectedAt),adapterVersion:'source-adapter-v3.3',
    acquisitionStatus:'content_overflow',rawFieldPayload:null,rawCodePointCount:100001,
    rawFieldPayloadAlgorithmVersion:'raw-field-payload-v3.0',ingestionContentRevisionSha256:null,
    canonicalContentAlgorithmVersion:'canonical-content-v3.0',terminalDisposition:'rejected',
    ingestionCanonicalContentHashV3:null});
  const body=normalizedBody;invariant(body.length>0,'source transcript required');
  const isTranscript = ['podcast','youtube'].includes(sourceKey);
  const fields = [normalizedTitle,'',isTranscript ? [[0,String(stableId),body]] : body];
  const canonicalFields = [['title',fields[0]],['summary',''],[isTranscript ? 'transcript' : 'body',
    isTranscript ? [[0,body]] : body]];
  invariant(['accepted','deferred','rejected'].includes(terminalDisposition),'document acquisition terminal');
  return Object.freeze({ sourceKey,profileId:profile.id,stableConnectorDocumentId:String(stableId).slice(0,512),
    distributionIdentity:`${sourceKey}:${profile.id}`,
    canonicalUrlCandidate:approvedHttpsUrl(sourceUrl),publishedAt:normalizedSourceInstant(publishedAt,{nullable:true}),
    collectedAt:normalizedSourceInstant(collectedAt),adapterVersion:'source-adapter-v3.3',acquisitionStatus:'complete',
    rawFieldPayload:fields,rawCodePointCount:observed.length,
    rawFieldPayloadAlgorithmVersion:'raw-field-payload-v3.0',
    ingestionContentRevisionSha256:sha256(canonicalJson({ adapterVersion:'source-adapter-v3.3',fields,version:'raw-field-payload-v3.0' })),
    canonicalContentAlgorithmVersion:'canonical-content-v3.0',terminalDisposition,
    ingestionCanonicalContentHashV3:sha256(canonicalJson(canonicalFields)) });
}

async function boundedFetch(url, options, fetchImpl, maximumBytes=4_000_000,{allowedOrigins,resolveHost}={}) {
  const origins=allowedOrigins??new Set([new URL(approvedHttpsUrl(url)).origin]);
  if(fetchImpl===globalThis.fetch)return pinnedHttpsFetch(url,options,maximumBytes,origins,resolveHost??dns.lookup);
  let current=allowedUrl(url,origins);let response;
  for(let redirect=0;redirect<=3;redirect+=1){
    if(resolveHost)await resolvePublicAddresses(new URL(current).hostname,resolveHost);
    response = await fetchImpl(current,{...options,redirect:'manual',signal:AbortSignal.timeout(12000)});
    if(response?.status>=300&&response.status<400){
      const location=response.headers?.get?.('location');invariant(redirect<3&&location,'provider_redirect_rejected');
      current=allowedUrl(new URL(location,current).toString(),origins);continue;
    }
    break;
  }
  if (!response?.ok) {
    const error=new Error(`provider_http_${response?.status ?? 'unavailable'}`);
    error.statusCode=Number.isInteger(response?.status)?response.status:null;
    throw error;
  }
  const bytes=Buffer.from(await response.arrayBuffer()); if(bytes.length<1||bytes.length>maximumBytes) throw new Error('provider_payload_bound');
  return { bytes,contentType:String(response.headers?.get?.('content-type') ?? ''),statusCode:response.status,responseBytes:bytes.length };
}

function attempt(sourceKey,status,reasonCode,{kind='configuration',statusCode=null,responseBytes=0,itemCount=0,documentCount=0}={}) {
  invariant(['threads','podcast','youtube'].includes(sourceKey)&&CONNECTOR_ATTEMPT.has(status),'connector attempt terminal');
  invariant(/^[a-z0-9_]{2,80}$/u.test(reasonCode),'connector attempt reason');
  return Object.freeze({sourceKey,status,reasonCode,responseEvidence:Object.freeze({kind,statusCode,responseBytes,itemCount,documentCount})});
}

function failedAttempt(sourceKey,error) {
  const statusCode=Number.isInteger(error?.statusCode)?error.statusCode:null;
  const status=statusCode===401||statusCode===403?'auth_failed':statusCode===404?'missing_endpoint':'provider_failed';
  return {documents:[],items:[],attempt:attempt(sourceKey,status,
    status==='auth_failed'?'provider_auth_rejected':status==='missing_endpoint'?'provider_endpoint_missing':'provider_transport_failed',
    {kind:statusCode===null?'transport_error':'http_response',statusCode,responseBytes:0,itemCount:0,documentCount:0})};
}

function itemDisposition(document) {
  if(!document)return Object.freeze({acquisitionDisposition:'metadata_only',analysisDisposition:'no_claim'});
  if(document.terminalDisposition==='accepted'&&document.acquisitionStatus==='complete')return Object.freeze({
    acquisitionDisposition:'transcript_ready',analysisDisposition:'eligible_for_claim_extraction'});
  if(document.terminalDisposition==='deferred')return Object.freeze({
    acquisitionDisposition:'deferred',analysisDisposition:'deferred'});
  return Object.freeze({acquisitionDisposition:'rejected',analysisDisposition:'rejected'});
}

async function podcast(profile,fetchImpl,collectedAt,resolveHost) {
  if (!profile.podcastFeed) return { documents:[],items:[],attempt:attempt('podcast','missing_endpoint','podcast_feed_missing') };
  const feedUrl=approvedHttpsUrl(profile.podcastFeed);
  const feedOrigin=new URL(feedUrl).origin;
  const transcriptOrigins=new Set([feedOrigin,...(Array.isArray(profile.podcastTranscriptOrigins)?profile.podcastTranscriptOrigins:[])
    .map((value)=>new URL(approvedHttpsUrl(value)).origin)]);
  const feed=await boundedFetch(feedUrl,{headers:{Accept:'application/rss+xml, application/xml, text/xml'}},fetchImpl,8_000_000,
    {allowedOrigins:new Set([feedOrigin]),resolveHost});
  const episodes=parsePodcastFeed(feed.bytes.toString('utf8'),profile); const documents=[];
  for(const episode of episodes.slice(0,3)) {
    if(!episode.transcriptUrl) continue;
    try {
      const transcriptUrl=allowedUrl(episode.transcriptUrl,transcriptOrigins);
      const transcript=await boundedFetch(transcriptUrl,{headers:{Accept:'text/plain,text/vtt,application/x-subrip,text/html,application/json'}},fetchImpl,
        4_000_000,{allowedOrigins:transcriptOrigins,resolveHost});
      const accepted=/^(?:text\/(?:plain|vtt|html)|application\/(?:x-subrip|json))/iu.test(transcript.contentType);
      documents.push(documentRevision({sourceKey:'podcast',profile,...episode,sourceUrl:approvedHttpsUrl(episode.sourceUrl),
        transcript:accepted?transcript.bytes.toString('utf8'):'transcript_content_type_rejected',collectedAt,
        terminalDisposition:accepted?'accepted':'rejected'}));
    } catch(error) {
      documents.push(documentRevision({sourceKey:'podcast',profile,...episode,sourceUrl:approvedHttpsUrl(episode.sourceUrl),
        transcript:`transcript_fetch_rejected:${error instanceof Error?error.message:'provider_failure'}`,collectedAt,
        terminalDisposition:'rejected'}));
    }
  }
  const itemRows=episodes.slice(0,3).map((episode)=>({sourceKey:'podcast',profileId:profile.id,
    stableId:String(episode.stableId),sourceUrl:approvedHttpsUrl(episode.sourceUrl),
    publishedAt:normalizedSourceInstant(episode.publishedAt,{nullable:true}),
    ...itemDisposition(documents.find((document)=>document.stableConnectorDocumentId===String(episode.stableId)))}));
  const status=documents.length?'items_found':itemRows.length?'metadata_only':'successful_empty';
  return { documents,items:itemRows,attempt:attempt('podcast',status,status==='items_found'?'podcast_items_observed':
    status==='metadata_only'?'podcast_metadata_only':'podcast_successful_empty',
  {kind:'http_response',statusCode:feed.statusCode,responseBytes:feed.responseBytes,itemCount:itemRows.length,documentCount:documents.length}) };
}

async function youtube(profile,credentials,fetchImpl,collectedAt) {
  if(!profile.youtubeChannelId&&!profile.youtubeHandle) return {documents:[],items:[],attempt:attempt('youtube','missing_endpoint','youtube_endpoint_missing')};
  if(!credentials.youtubeApiKey) return {documents:[],items:[],attempt:attempt('youtube','auth_failed','youtube_api_auth_missing')};
  const criterion=profile.youtubeChannelId?`id=${encodeURIComponent(profile.youtubeChannelId)}`:`forHandle=${encodeURIComponent(profile.youtubeHandle)}`;
  const channel=await boundedFetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&${criterion}&key=${encodeURIComponent(credentials.youtubeApiKey)}`,{headers:{Accept:'application/json'}},fetchImpl);
  const channelJson=JSON.parse(channel.bytes.toString('utf8')); const uploads=channelJson.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if(!uploads) return {documents:[],items:[],attempt:attempt('youtube','successful_empty','youtube_channel_successful_empty',
    {kind:'http_response',statusCode:channel.statusCode,responseBytes:channel.responseBytes,itemCount:0,documentCount:0})};
  const playlist=await boundedFetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(uploads)}&maxResults=3&key=${encodeURIComponent(credentials.youtubeApiKey)}`,{headers:{Accept:'application/json'}},fetchImpl);
  const videos=JSON.parse(playlist.bytes.toString('utf8')).items ?? [];
  if(!credentials.youtubeOauthToken) {
    const items=videos.filter((video)=>video?.snippet?.resourceId?.videoId)
    .map((video)=>({sourceKey:'youtube',profileId:profile.id,stableId:video.snippet.resourceId.videoId,
      sourceUrl:`https://www.youtube.com/watch?v=${video.snippet.resourceId.videoId}`,
      publishedAt:normalizedSourceInstant(video.snippet.publishedAt,{nullable:true}),
      acquisitionDisposition:'metadata_only',analysisDisposition:'no_claim'})),
      status=items.length?'metadata_only':'successful_empty';
    return {documents:[],items,attempt:attempt('youtube',status,status==='metadata_only'?'youtube_caption_authority_missing':'youtube_successful_empty',
      {kind:'http_response',statusCode:playlist.statusCode,responseBytes:playlist.responseBytes,itemCount:items.length,documentCount:0})};
  }
  const documents=[];const videoFailures=new Map();
  for(const video of videos) {
    const videoId=video?.snippet?.resourceId?.videoId; if(!videoId) continue;
    try {
      const list=await boundedFetch(`https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${encodeURIComponent(videoId)}`,{headers:{Accept:'application/json',Authorization:`Bearer ${credentials.youtubeOauthToken}`}},fetchImpl);
      const captions=JSON.parse(list.bytes.toString('utf8')).items ?? []; const selected=captions.find((row)=>row?.snippet?.status==='serving'&&!row?.snippet?.isDraft);
      if(!selected?.id) continue;
      const content=await boundedFetch(`https://www.googleapis.com/youtube/v3/captions/${encodeURIComponent(selected.id)}?tfmt=vtt`,{headers:{Accept:'text/vtt',Authorization:`Bearer ${credentials.youtubeOauthToken}`}},fetchImpl);
      documents.push(documentRevision({sourceKey:'youtube',profile,stableId:videoId,title:video.snippet?.title,
        sourceUrl:approvedHttpsUrl(`https://www.youtube.com/watch?v=${videoId}`,'youtube.com'),publishedAt:video.snippet?.publishedAt,
        transcript:content.bytes.toString('utf8'),collectedAt}));
    } catch (error) {
      // Third-party captions are owner-authorized resources. A per-video denial
      // leaves that video as metadata-only and must not invalidate other videos.
      if(error?.statusCode===401)throw error;
      if(error?.statusCode!==403&&error?.statusCode!==404)videoFailures.set(videoId,{disposition:'deferred',
        statusCode:Number.isInteger(error?.statusCode)?error.statusCode:null});
    }
  }
  const items=videos.filter((video)=>video?.snippet?.resourceId?.videoId).map((video)=>{const document=documents.find((candidate)=>
    candidate.stableConnectorDocumentId===video.snippet.resourceId.videoId);const failure=videoFailures.get(video.snippet.resourceId.videoId);
    return ({sourceKey:'youtube',
    profileId:profile.id,stableId:video.snippet.resourceId.videoId,
    sourceUrl:`https://www.youtube.com/watch?v=${video.snippet.resourceId.videoId}`,
    publishedAt:normalizedSourceInstant(video.snippet.publishedAt,{nullable:true}),
    ...(failure?.disposition==='deferred'?{acquisitionDisposition:'deferred',analysisDisposition:'deferred'}:itemDisposition(document))});});
  const status=videoFailures.size?'provider_failed':documents.length?'items_found':items.length?'metadata_only':'successful_empty';
  const failureStatus=[...videoFailures.values()][0]?.statusCode??null;
  return {documents,items,attempt:attempt('youtube',status,status==='items_found'?'youtube_caption_items_observed':
    status==='metadata_only'?'youtube_metadata_only':status==='provider_failed'?'youtube_caption_provider_failed':'youtube_successful_empty',
  {kind:'http_response',statusCode:status==='provider_failed'?failureStatus:playlist.statusCode,
    responseBytes:playlist.responseBytes,itemCount:items.length,documentCount:documents.length})};
}

async function threads(profile,roster,credentials,fetchImpl,collectedAt) {
  if(!profile.threads) return {documents:[],items:[],attempt:attempt('threads','missing_endpoint','threads_profile_missing')};
  if(!roster.threadsSearchEndpoint) return {documents:[],items:[],attempt:attempt('threads','missing_endpoint','threads_search_endpoint_missing')};
  if(!credentials.threadsAccessToken) return {documents:[],items:[],attempt:attempt('threads','auth_failed','threads_oauth_missing')};
  const configuredQueries=Array.isArray(profile.threadsKeywords)?profile.threadsKeywords:[];
  const queries=[...new Set(configuredQueries.map((value)=>compactText(value,80)).filter((value)=>value.length>=2&&value.length<=80))]
    .slice(0,2);
  // Keyword Search is a topic endpoint, not an author-timeline endpoint. A
  // handle alone is retained only as the compatibility fallback for profiles
  // without a reviewed topic scope; it must never be reported as a successful
  // author acquisition unless a returned row also matches that author.
  if(queries.length===0)queries.push(String(profile.threads).replace(/^@/u,''));
  const responses=await Promise.all(queries.map(async(query)=>{
    const endpoint=new URL(roster.threadsSearchEndpoint); invariant(endpoint.origin==='https://graph.threads.net','threads endpoint authority');
    invariant(endpoint.pathname==='/keyword_search','threads keyword-search endpoint authority');
    endpoint.searchParams.set('q',query);endpoint.searchParams.set('search_type','RECENT');
    endpoint.searchParams.set('fields','id,username,text,permalink,timestamp');
    endpoint.searchParams.set('access_token',credentials.threadsAccessToken);
    return boundedFetch(endpoint.toString(),{headers:{Accept:'application/json'}},fetchImpl,1_000_000);
  }));
  const rows=[...new Map(responses.flatMap((response)=>{
    const data=JSON.parse(response.bytes.toString('utf8')).data;
    return Array.isArray(data)?data:[];
  }).filter((row)=>row?.id).map((row)=>[String(row.id),row])).values()];
  const approvedUsername=String(profile.threads).replace(/^@/u,'').toLowerCase();
  const documents=rows.slice(0,10).filter((row)=>row?.id&&row?.text&&row?.permalink
    &&String(row.username??'').replace(/^@/u,'').toLowerCase()===approvedUsername).map((row)=>documentRevision({
    sourceKey:'threads',profile,stableId:row.id,title:`Threads · ${profile.name}`,sourceUrl:approvedHttpsUrl(row.permalink,'threads.net'),
    publishedAt:row.timestamp,transcript:row.text,collectedAt}));
  const items=documents.map((document)=>({sourceKey:'threads',profileId:profile.id,
    stableId:document.stableConnectorDocumentId,sourceUrl:document.canonicalUrlCandidate,publishedAt:document.publishedAt,
    ...itemDisposition(document)}));
  return {documents,items,attempt:attempt('threads',documents.length?'items_found':'successful_empty',
    documents.length?'threads_items_observed':'threads_successful_empty',
  {kind:'http_response',statusCode:responses.every((response)=>response.statusCode===200)?200:null,
    responseBytes:responses.reduce((sum,response)=>sum+response.responseBytes,0),itemCount:items.length,documentCount:documents.length})};
}

function terminal(profile,documents) {
  return Object.freeze({profileId:profile.id,profileName:profile.name,documentCount:documents.length});
}

async function acquireApprovedSources({roster,credentials={},fetchImpl=globalThis.fetch,resolveHost,now=new Date()}={}) {
  invariant(roster?.schema==='approved-source-roster-v3.13'&&Array.isArray(roster.profiles)&&roster.profiles.length===17,'approved source roster');
  const collectedAt=now.toISOString(); const documents=[]; const itemOutcomes=[]; const connectorAttempts=[]; const outcomes=[];
  for(let offset=0;offset<roster.profiles.length;offset+=4) {
    const batch=await Promise.all(roster.profiles.slice(offset,offset+4).map(async(profile)=>{
      const sourceKeys=['threads','podcast','youtube'];
      const settled=await Promise.allSettled([threads(profile,roster,credentials,fetchImpl,collectedAt),
        podcast(profile,fetchImpl,collectedAt,resolveHost),youtube(profile,credentials,fetchImpl,collectedAt)]);
      const attempts=settled.map((result,index)=>result.status==='fulfilled'?result.value:failedAttempt(sourceKeys[index],result.reason));
      const acquired=attempts.flatMap((row)=>row.documents);
      return {acquired,items:attempts.flatMap((row)=>row.items??[]),attempts:attempts.map((row)=>
        ({profileId:profile.id,...row.attempt})),outcome:terminal(profile,acquired)};
    }));
    for(const result of batch){documents.push(...result.acquired);itemOutcomes.push(...result.items);
      connectorAttempts.push(...result.attempts);outcomes.push(result.outcome);}
  }
  invariant(outcomes.length===17&&new Set(outcomes.map((row)=>row.profileId)).size===17,'approved source outcome conservation');
  invariant(connectorAttempts.length===51&&new Set(connectorAttempts.map((row)=>`${row.profileId}:${row.sourceKey}`)).size===51,
    'connector attempt conservation');
  invariant(new Set(documents.map((row)=>`${row.sourceKey}:${row.profileId}:${row.stableConnectorDocumentId}`)).size===documents.length,
    'source document identity collision');
  invariant(itemOutcomes.every((item)=>['transcript_ready','metadata_only','rejected','deferred'].includes(item.acquisitionDisposition)),
    'source item acquisition terminal');
  invariant(itemOutcomes.every((item)=>item.analysisDisposition===(item.acquisitionDisposition==='transcript_ready'
    ?'eligible_for_claim_extraction':item.acquisitionDisposition==='metadata_only'?'no_claim':item.acquisitionDisposition)),
    'source item analysis eligibility conservation');
  return Object.freeze({schema:'official-source-acquisition-v3.13',collectedAt,documents,itemOutcomes,connectorAttempts,outcomes});
}

module.exports={ acquireApprovedSources,approvedHttpsUrl,documentRevision,normalizedSourceInstant,
  parsePodcastFeed,isPublicAddress,resolvePublicAddresses,CONNECTOR_ATTEMPT,TERMINAL };
