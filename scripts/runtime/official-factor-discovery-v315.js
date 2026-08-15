'use strict';

const {canonicalJson,sha256}=require('./codec');

const clamp=(low,high,value)=>Math.min(high,Math.max(low,value));
const smooth=(value,scale,amplitude)=>50+amplitude*Math.tanh(value/scale);
const median=(values)=>{const ordered=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!ordered.length)return null;
  const middle=Math.floor(ordered.length/2);return ordered.length%2?ordered[middle]:(ordered[middle-1]+ordered[middle])/2;};
const uuidFromHash=(value)=>{const hash=sha256(value);return `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;};

function buildOfficialFactorCandidatesV315({snapshot,cutoff,limit=40}={}){
  if(snapshot?.schema!=='official-coarse-market-snapshot-v3.15'||typeof cutoff!=='string'||!Number.isFinite(Date.parse(cutoff))
      ||!Number.isInteger(limit)||limit<1||limit>60)return Object.freeze({candidates:Object.freeze([]),waterfall:{eligible:0,selected:0}});
  const latestRevenue=new Map();
  for(const row of snapshot.revenues??[]){const prior=latestRevenue.get(row.symbol);if(!prior||row.asOf>prior.asOf)latestRevenue.set(row.symbol,row);}
  const peerGroups=Map.groupBy((snapshot.valuations??[]).filter((row)=>Number.isFinite(row.peRatio)&&row.peRatio>0&&row.peRatio<=200
    &&row.canonicalSector&&row.canonicalSector!=='unknown'),(row)=>`${row.exchange}:${row.canonicalSector}`);
  const identityByStock=new Map((snapshot.universe??[]).map((row)=>[row.stockId,row]));
  const identityBySymbol=new Map((snapshot.universe??[]).map((row)=>[row.symbol,row]));
  const rows=(snapshot.valuations??[]).flatMap((valuation)=>{
    const identity=identityByStock.get(valuation.stockId)??identityBySymbol.get(valuation.symbol);
    if(!identity||!Number.isFinite(valuation.close)||valuation.close<=0)return [];
    const revenue=latestRevenue.get(valuation.symbol);
    const peerMembers=(peerGroups.get(`${valuation.exchange}:${valuation.canonicalSector}`)??[])
      .filter((row)=>row.stockId&&valuation.stockId?row.stockId!==valuation.stockId:row.symbol!==valuation.symbol);
    const reference=peerMembers.length>=8?median(peerMembers.map((row)=>row.peRatio)):null;
    // Express a discount as the percentage below the reference multiple. The
    // reciprocal form (reference / current - 1) exaggerated deep discounts
    // (for example 10x versus 30x appeared as 200% instead of 66.7%).
    const relativeDiscount=Number.isFinite(reference)&&reference>0&&Number.isFinite(valuation.peRatio)&&valuation.peRatio>0
      ?(1-valuation.peRatio/reference)*100:null;
    const valuationScore=Number.isFinite(relativeDiscount)?clamp(0,100,smooth(relativeDiscount,50,35)):null;
    const yoyScore=Number.isFinite(revenue?.yoyGrowth)?smooth(revenue.yoyGrowth,100,35):null;
    const momScore=Number.isFinite(revenue?.momGrowth)?smooth(revenue.momGrowth,30,25):null;
    const fundamentalScore=yoyScore===null?null:clamp(0,100,momScore===null?yoyScore:yoyScore*.75+momScore*.25);
    const availableWeight=(valuationScore===null?0:.30)+(fundamentalScore===null?0:.25)+.15+.10;
    const weighted=(valuationScore??0)*.30+(fundamentalScore??0)*.25+100*.15+70*.10;
    const rankingScore=clamp(0,100,weighted-20*(1-availableWeight));
    if(availableWeight<.50||rankingScore<55)return [];
    const sourceRefs=[valuation.sourceRef,valuation.closeSourceRef,revenue?.sourceRef].filter(Boolean);
    const factorEvidence={schema:'official-factor-evidence-v3.15',symbol:valuation.symbol,session:valuation.session,
      close:valuation.close,peRatio:valuation.peRatio,sectorMedianPe:reference,sectorPeerCount:peerMembers.length,
      relativeDiscountPct:relativeDiscount,
      revenuePeriod:revenue?.asOf??null,revenueYoyPct:revenue?.yoyGrowth??null,revenueMomPct:revenue?.momGrowth??null,
      valuationScore,fundamentalScore,
      coverage:availableWeight,rankingScore,sourceRefs};
    return [{stockId:identity.stockId,symbol:identity.symbol,name:identity.name,exchange:identity.exchange,
      canonicalSector:identity.canonicalSector,sourceClass:'public_research',sourcePriority:clamp(55,95,rankingScore),
      claimId:uuidFromHash(canonicalJson(['official-factor-claim-v3.15',factorEvidence])),
      mentionId:uuidFromHash(canonicalJson(['official-factor-mention-v3.15',identity.stockId,valuation.session])),
      claimAsOf:`${valuation.session}T06:30:00Z`,
      sourceKey:'official_market_factor',sourceName:'TWSE／TPEx 官方市場資料',sourceUrl:valuation.sourceUrl,
      sourcePublishedAt:`${valuation.session}T06:30:00Z`,sourceCollectedAt:snapshot.collectedAt,
      raw:factorEvidence,sourceSummary:`${identity.name}（${identity.symbol}）官方估值與營收因子進入全市場研究排序；這不是買進建議。`,
      claimEligible:true,link:{disposition:'linked',stockId:identity.stockId,symbol:identity.symbol},factorEvidence}];
  }).sort((left,right)=>right.factorEvidence.rankingScore-left.factorEvidence.rankingScore
    ||right.factorEvidence.coverage-left.factorEvidence.coverage||left.symbol.localeCompare(right.symbol));
  const deduped=rows.filter((row,index,all)=>all.findIndex((candidate)=>candidate.stockId===row.stockId)===index).slice(0,limit);
  return Object.freeze({candidates:Object.freeze(deduped),waterfall:Object.freeze({universe:snapshot.universe?.length??0,
    valued:snapshot.valuations?.length??0,eligible:rows.length,selected:deduped.length,
    sourceFailures:snapshot.sourceFailures?.length??0})});
}

module.exports={buildOfficialFactorCandidatesV315};
