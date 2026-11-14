/** Invented PUBLIC transport packets, never source/producer/review authority.
 * The supplied dates name a synthetic calendar; no real ranking is claimed. */
import {LAUNCH_RANKING_POLICY,LAUNCH_RANKING_RULES,LAUNCH_RANKING_SCHEMA,LAUNCH_RANKING_ARITHMETIC} from './launch-ranking-read.ts';
const id=(value:number)=>`00000000-0000-4000-8000-${String(value).padStart(12,'0')}`;
export const LAUNCH_TEST_RUN=id(1),LAUNCH_TEST_NOW='2026-11-13T13:30:30Z';
export function launchRankingFixture(size=1,detail=false,clock?:string){
  const now=clock??LAUNCH_TEST_NOW;
  const current=new Date(now),taipeiDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(current);
  let publication=Date.parse(`${taipeiDay}T21:30:00+08:00`);
  if(publication>current.getTime())publication-=86400000;
  const cutoff=new Date(publication).toISOString(),session=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(cutoff));
  const priorEndpoint=new Date(publication-7*86400000).toISOString().slice(0,10),priorSession=new Date(publication-86400000).toISOString().slice(0,10);
  const marketRevision='d'.repeat(64),components={trendRelativeStrength:25,consolidation:25,breakoutHold:20,chips:20,market:10};
  const members=Array.from({length:size},(_,i)=>{
    const revisionId=id(10+i),scoreRevision=id(100+i),launchQualificationRevision=id(200+i);
    return {rank:i+1,symbol:String(5274+i),revisionId,inputHash:'a'.repeat(64),scoreRevision,launchQualificationRevision,totalScore:100,availableWeight:100,technicalScore:70,relativeStrength63:.4-.1,
      components:{...components},entryEligible:true,reasons:[] as string[],revisions:{research:revisionId,score:scoreRevision,qualification:launchQualificationRevision,price:`synthetic-price-${i}`,calendar:'synthetic-calendar',actions:'synthetic-actions',
        technicalVolume:'synthetic-11371',institutionalVolume:'synthetic-11370',flow:'synthetic-11856',market:marketRevision},financial:null,valuation:null};
  });
  const rawRules=[
    ['trend_close_above_ma50','trendRelativeStrength',5,{close:110,ma50:100}],['trend_ma50_above_ma200','trendRelativeStrength',5,{ma50:100,ma200:90}],
    ['trend_ma200_rising_5sessions','trendRelativeStrength',5,{ma200:90,priorMa200:89,priorEndpoint}],
    ['trend_excess_return20_positive','trendRelativeStrength',5,{stockReturn:.2,marketReturn:.1,excessReturn:.2-.1}],
    ['trend_excess_return63_positive','trendRelativeStrength',5,{stockReturn:.4,marketReturn:.1,excessReturn:.4-.1}],
    ['consolidation_depth_within15pct','consolidation',10,{depth:.1}],['consolidation_distance_within5pct','consolidation',5,{distance:.02}],
    ['consolidation_prior_atr_ratio_within08','consolidation',5,{ratio:.7,throughSession:priorSession}],['consolidation_volume_ratio_within08','consolidation',5,{ratio:.7}],
    ['breakout_or_fixed_closing_hold','breakoutHold',20,{breakout:true,closingHold:null,originalSession:null,originalLevel:null}],
    ['chips_foreign5_positive','chips',5,{netShares:5,volumeShares:100,netVolumeRatio:.05}],['chips_foreign20_positive','chips',5,{netShares:20,volumeShares:400,netVolumeRatio:.05}],
    ['chips_trust5_positive','chips',5,{netShares:10,volumeShares:100,netVolumeRatio:.1}],['chips_trust20_positive','chips',5,{netShares:40,volumeShares:400,netVolumeRatio:.1}],
    ['market_close_above_ma50','market',5,{close:150,ma50:140}],['market_close_above_ma200','market',5,{close:150,ma200:120}]
  ] as const;
  const selected=members[0];
  return {schemaVersion:'vnext-launch-ranking-read-v2',arithmeticVersion:LAUNCH_RANKING_ARITHMETIC,availability:'ready',reason:null as string|null,
    snapshot:{schemaVersion:LAUNCH_RANKING_SCHEMA,policyVersion:LAUNCH_RANKING_POLICY,rulesVersion:LAUNCH_RANKING_RULES,arithmeticVersion:LAUNCH_RANKING_ARITHMETIC,rankingRunId:LAUNCH_TEST_RUN,previousRankingRunId:null as string|null,
      cutoff,inputCutoff:cutoff,session,publishedAt:cutoff,marketRevision,market:{session,risk:'risk_on',confidence:'complete',sourceAt:new Date(publication-3600000).toISOString(),expiresAt:new Date(publication+86400000).toISOString(),
        reasons:['合成市場比較；非實際資料。'],conditions:[] as string[],gaps:[] as string[]},members,candidates:members.map(m=>({symbol:m.symbol,state:'eligible',reasons:[] as string[]})),changes:members.map(m=>({symbol:m.symbol,kind:'entered',reason:'synthetic_complete_evidence'}))},
    current:{schemaVersion:'vnext-launch-current-validity-v2',arithmeticVersion:LAUNCH_RANKING_ARITHMETIC,members:members.map(m=>({symbol:m.symbol,revisionId:m.revisionId,inputHash:m.inputHash,scoreRevision:m.scoreRevision,launchQualificationRevision:m.launchQualificationRevision,revisions:{...m.revisions},checkedAt:now,expiresAt:new Date(current.getTime()+90000).toISOString(),status:'current',entryEligible:true,
      checks:{rights:true,review:true,venue:true,liquidity:true,price:true,actions:true,source:true,completeWeight:true},reasons:[] as string[]}))},
    detail:detail&&selected?{arithmeticVersion:LAUNCH_RANKING_ARITHMETIC,rankingRunId:LAUNCH_TEST_RUN,symbol:selected.symbol,revisionId:selected.revisionId,scoreRevision:selected.scoreRevision,launchQualificationRevision:selected.launchQualificationRevision,inputHash:selected.inputHash,
      summary:'Synthetic public research summary. Financial and valuation observations remain unknown.',scoreEvidence:rawRules.map(([ruleId,group,weight,operands])=>({id:ruleId,group,weight,matches:true,points:weight,operands:{...operands},cutoff,throughSession:session,revisions:{...selected.revisions}})),
      citations:[{id:`licensed-dataset:11370:${id(370)}`,url:'https://data.gov.tw/dataset/11370',contentHash:'b'.repeat(64),sourceRevision:id(370),publicRights:{schemaVersion:'launch-public-rights-v1',datasetId:11370,
        license:'Taiwan Open Government Data License 1.0',licenseUrl:'https://data.gov.tw/license',attribution:'Securities and Futures Bureau, Financial Supervisory Commission',rightsRevision:'c'.repeat(64)}}],chart:null}:null};
}
