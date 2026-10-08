"""Independent Decimal recomputation; does not import the JS model/helper."""
import json,decimal,pathlib,re,hashlib
D=decimal.Decimal
folder=pathlib.Path(__file__).resolve().parent
root=folder.parents[2]
m=json.loads((folder/'model-results.json').read_text(),parse_float=D)
f=json.loads((root/'docs/research/2026-10-08-auo-full-financial/financial-relay.json').read_text(),parse_float=D)
monthly=json.loads((root/'docs/research/2026-10-08-auo/dataset.json').read_text(),parse_float=D)
checks=0
def check(a,b,tolerance=D('0.000001')):
 global checks
 assert abs(D(a)-D(b))<=tolerance,(a,b)
 checks+=1
for source in f['segments']:
 target=next(r for r in m['segmentActuals'] if r['period']==source['period'])
 for name in ['revenue','operatingProfit']:
  for source_value,target_value in zip(source[name],target[name]):check(D(source_value)/1000,target_value)
q2=next(s for s in f['segments']if s['period']=='2026Q2')
monthly_sum=sum(D(r['reportedRevenue'])for r in monthly['monthlyConsolidatedRevenue']if r['period']in ['2026-07','2026-08','2026-09'])
check(monthly_sum,m['q3KnownMonthlyRevenue']['sum'])
for scenario in m['scenarios']:
 a=scenario['assumptions'];previous=[D(x)/1000*D(w)for x,w in zip(q2['revenue'],a['q3Weights'])]
 previous=[x*monthly_sum/sum(previous)for x in previous]
 independent=[]
 for i,row in enumerate(scenario['quarters']):
  if i:previous=[x*(1+D(g))for x,g in zip(previous,a['growth'][i-1])]
  gross=sum(x*(D(gm)+i*D(a['quarterMarginStep']))for x,gm in zip(previous,a['grossMargins']))
  op=sum(x*(D(om)+i*D(a['quarterMarginStep']))for x,om in zip(previous,a['opMargins']))
  nonop=sum(D(a[key])for key in ['interestIncome','financeCosts','otherIncome','equityMethodProfit','fxAndOtherRecurring'])
  pretax=op+nonop;tax=max(max(pretax,0)*D(a['taxRate']),D(a['taxFloor']));owners=pretax-tax-D(a['nci'])
  for actual,field in [(sum(previous),'revenue'),(gross,'grossProfit'),(gross-op,'operatingExpenses'),(op,'operatingProfit'),(nonop,'nonOperating'),(pretax,'pretaxProfit'),(tax,'taxExpense'),(owners,'ownersNetProfit')]:check(actual,row[field])
  check(owners/D(row['dilutedSharesMillionAssumed']),row['dilutedEpsConditional'])
  independent.append(owners)
 check(sum(independent[2:])/D(scenario['calendar2027']['dilutedSharesMillionAssumed']),scenario['calendar2027']['dilutedEpsConditional'])
 check((D('199.555')+sum(independent[:2]))/D(scenario['calendar2026']['dilutedSharesMillionAssumed']),scenario['calendar2026']['dilutedEpsConditional'])
 check(sum(independent[:4])/D(scenario['nextFourUnreported']['dilutedSharesMillionAssumed']),scenario['nextFourUnreported']['dilutedEpsConditional'])
for row in m['normalizationSensitivity']:
 expected=(D('863.731')+D('1127.507')*D(row['darwinWeightAssumed']))*(1-D(row['taxRateAssumed']))
 check(expected,row['assumedOwnersGainMillion']);check((D('1343.092')-expected)/D('7547.099'),row['q2EpsAfterHypotheticalRemoval'])
for row in m['inputManifest']:
 raw=(root/row['file']).read_bytes();assert len(raw)==row['bytes']and hashlib.sha256(raw).hexdigest()==row['sha256'];checks+=1
article=(folder/'article.md').read_text();body=article.split('<details>')[0]
characters=sum('\u4e00'<=c<='\u9fff'for c in body);assert 4000<=characters<=6000;checks+=1
references=set(re.findall(r'^\[([A-Z]+)\]:',article,re.M));assert set(re.findall(r'\[([A-Z]+)\]',body))<=references;checks+=1
print(json.dumps({'independentDecimalChecks':checks,'mainBodyChineseCharacters':characters,'citationDefinitions':len(references),'quarterBridges':18,'sourceInputHashes':7,'historicalPITEligible':False,'normalizedOrValuationApproved':False}))
