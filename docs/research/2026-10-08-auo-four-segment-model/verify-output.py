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
  potential=D('7547.099')*D(a['potentialSharesRatio']) if row['period'].startswith('2027') else D(0)
  denominator=D('7547.099')+(potential if owners>0 else 0)
  check(denominator,row['dilutedSharesMillionAssumed']);check(potential if owners<=0 else 0,row['antiDilutiveExcludedMillion'])
  check(owners/denominator,row['dilutedEpsConditional'])
  independent.append(owners)
 for group,profit,potential in [('calendar2027',sum(independent[2:]),D('7547.099')*D(a['potentialSharesRatio'])),('nextFourUnreported',sum(independent[:4]),D('7547.099')*D(a['potentialSharesRatio'])/2)]:
  denominator=D('7547.099')+(potential if profit>0 else 0)
  check(denominator,scenario[group]['dilutedSharesMillionAssumed']);check(profit/denominator,scenario[group]['dilutedEpsConditional'])
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
# New independent historical cash checks: raw fixed packet, Decimal arithmetic only.
packet_path=root/'docs/research/2026-10-14-cashflow-capital-addendum/source-packet.json'
raw=packet_path.read_bytes();assert hashlib.sha256(raw).hexdigest()=='b3cdd1b865ef31e7df7db715697e6137a0eb5112139d88e8af337ae3f15030a3';checks+=1
packet=json.loads(raw,parse_float=D);issuer=next(x for x in packet['issuers']if x['stock']==m['symbol']);h=m['historicalCashFlow'];facts=issuer['facts'];original_checks=checks
assert h['extractionAvailableAt']==packet['extractionAvailableAt']==m['asOf'];assert h['originalSource']==issuer['source'];assert h['noFutureCash']and h['forecastCash']is None and not h['valuationApproved']and not h['technicalAdmission'];checks+=3
for i,row in enumerate(h['rows']):
 def v(k):return D(facts[k]['values'][i])
 noncash=sum(v(k)for k in ['depreciation','amortization','fvGain','interestExpenseAdjustment','interestIncomeAdjustment','dividendIncomeAdjustment','shareCompensation','equityMethodAdjustment','ppeDisposalGainAdjustment','rouDisposalLoss','heldForSaleGainAdjustment','investmentGainAdjustment','impairment','unrealizedFx','otherAdjustment'])if m['symbol']=='2409'else v('nonCashAdjustments')
 wc=sum(v(k)for k in ['receivables','relatedReceivables','inventory','contractCosts','otherOperatingAssets','contractLiabilities','payables','relatedPayables','provisions','otherOperatingLiabilities'])if m['symbol']=='2409'else v('workingCapital')
 check(v('pretax')+noncash+wc,v('generatedCash'));check(v('generatedCash')+v('interestReceived')+v('interestPaid')+v('taxPaid')+(v('dividendReceived')if m['symbol']=='2409'else 0),row['cfo'])
 check(v('ownersNetProfit')+v('nonControllingNetProfit'),row['groupNetProfit']);check(v('operatingCash')/v('netProfit'),row['cfoDividedByGroupNetProfit'])
 check(noncash,row['nonCashAdjustments']);check(wc,row['workingCapitalCashEffect'])
 check(v('operatingCash')+v('ppeCash')+v('intangibleCash'),row['cfoLessPpeAndIntangibleCashOutlay']);check(v('operatingCash')+v('ppeCash'),row['cfoLessPpeCashOutlay'])
 for field,key in [('ppeCashAcquisition','ppeCash'),('intangibleCashAcquisition','intangibleCash'),('receivablesCashEffect','receivables'),('inventoryCashEffect','inventory'),('payablesCashEffect','payables'),('leasePrincipalSeparate','leasePrincipal'),('investingCash','investingCash'),('financingCash','financingCash'),('fxCash','fxCash'),('openingCash','openingCash'),('closingCash','closingCash')]:check(v(key),row[field])
 check(sum(v(k)for k in (['shortBorrowings','shortRepayments','longBorrowings','longRepayments']if m['symbol']=='2409'else ['shortBorrowingsNet','longBorrowings','longRepayments'])),row['netBorrowingCash'])
 check(v('operatingCash')+v('investingCash')+v('financingCash')+v('fxCash'),row['cashChange']);check(v('openingCash')+v('cashChange'),row['closingCash'])
 check(v('ppeDisposalCash')+(v('heldForSaleDisposalCash')if m['symbol']=='2409'else 0),row['disposalProceedsExcluded'])
 assert row['period']==issuer['periods'][i]and row['unit']=='TWD_thousands'and row['grain']==issuer['grain'];checks+=1
 if m['symbol']=='2409':check(v('heldForSaleGainAdjustment'),row['assetDisposalGainAlreadyRemoved']);assert row['rouCashAcquisitionSeparate']is None;checks+=1
 else:check(v('rouCash'),row['rouCashAcquisitionSeparate'])
for key,fact in facts.items():
 locator=h['sourceFacts'][key];assert locator['values']==fact['values']and locator['pdfPage']==fact['pdfPage']and locator['sourceLine']==fact['sourceLine'];assert locator['sourceJsonPointer']==f"/issuers/{packet['issuers'].index(issuer)}/facts/{key}/values";checks+=1
if m['symbol']=='2409':
 capital=packet['auoJune30Capital'];check(D(capital['ownersEquityTwdThousands'])/D(capital['issuedSharesThousands']),h['historicalCapital']['ownersEquityPerIssuedCommonShareTwd']);assert h['historicalCapital']['treasurySharesThousands']is None and h['historicalCapital']['currentPB']is None and h['historicalCapital']['octoberOutstandingShares']is None;checks+=1
assert h['sourceInputManifest']==m['inputManifest'];checks+=1
assert m['originalModelAsOf'] in ['2026-10-08T10:20:00Z','2026-10-08T12:12:00Z'];checks+=1
cash_decimal_checks=checks-original_checks

print(json.dumps({'independentDecimalChecks':checks,'mainBodyChineseCharacters':characters,'citationDefinitions':len(references),'quarterBridges':18,'sourceInputHashes':len(m['inputManifest']),'historicalCashDecimalChecks':cash_decimal_checks,'historicalPITEligible':False,'normalizedOrValuationApproved':False}))
