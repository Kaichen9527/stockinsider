"""Independent Decimal financial/forecast/share verification; no JS imports."""
import pathlib,json,decimal,hashlib,re
D=decimal.Decimal;p=pathlib.Path(__file__).resolve().parent;root=p.parents[2];m=json.loads((p/'model-results.json').read_text(),parse_float=D);f=json.loads((root/'docs/research/2026-10-08-emc-official-evidence/financial-relay.json').read_text(),parse_float=D);checks=0
def check(a,b):
 global checks
 assert abs(D(a)-D(b))<D('.000001'),(a,b);checks+=1
ordinary=D('358.321');check(ordinary,m['shares']['ordinaryBaselineMillion']);q3=sum(D(r['revenueTwd'])for r in f['monthlyRevenue']['rows']if r['month']in ['2026-07','2026-08','2026-09'])/1000000;check(q3,m['q3KnownMonthlyRevenue']['sumMillion'])
notes=json.loads((root/'docs/research/2026-10-08-emc-official-evidence/financial-notes-relay.json').read_text(),parse_float=D)
for i in range(4):
 e=notes['earningsPerShareNotes'];check(e['basicWeightedShares'][i]+e['convertibleAdditionalShares'][i]+e['employeeAdditionalShares'][i],e['dilutedWeightedShares'][i]);check(e['basicOwnersProfit'][i]+e['convertibleAfterTaxNumeratorAdjustment'][i],e['dilutedOwnersProfit'][i]);n=notes['nonOperatingNotes'];check(n['bankInterestIncome'][i]+n['otherGainsLossesTotal'][i]-n['financeCost'][i],f['reports'][0]['columns']['nonOperating'][i])
for q in f['quarters']:
 v=q['values'];check(D(v['revenue'])+v['cost'],v['grossProfit']);check(D(v['grossProfit'])+v['operatingExpenses'],v['operatingProfit']);check(D(v['pretaxProfit'])+v['tax'],v['netProfit']);check(D(v['ownersNetProfit'])+v['nonControllingNetProfit'],v['netProfit'])
for s in m['scenarios']:
 a=s['assumptions'];revenue=q3;rows=[]
 for i,q in enumerate(s['quarters']):
  if i:revenue*=1+D(a['growth'][i-1])
  gp=revenue*(D(a['grossMargin'])+i*D(a['marginStep']));expense=revenue*D(a['opexRatio']);op=gp-expense;pre=op+sum(D(a[k])for k in ['bankInterest','financeCost','fx','otherGainsExFx']);tax=max(pre,0)*D(a['taxRate']);net=pre-tax;owners=net-D(a['nci']);potential=ordinary*D(a['potentialRatio'])if i>=2 else D(0);denominator=ordinary+(potential if owners>0 else 0)
  row={'revenue':revenue,'grossProfit':gp,'operatingExpenses':expense,'operatingProfit':op,'nonOperating':sum(D(a[k])for k in ['bankInterest','financeCost','fx','otherGainsExFx']),'pretaxProfit':pre,'taxExpense':tax,'netProfit':net,'nonControllingNetProfit':D(a['nci']),'ownersNetProfit':owners}
  for key,value in row.items():check(value,q[key])
  check(denominator,q['dilutedSharesMillionAssumed']);check(owners/denominator,q['dilutedEpsConditional']);rows.append(row)
 for name,selected,base,potential in [('calendar2026',rows[:2],m['actualH1'],D('.088')),('calendar2027',rows[2:],None,ordinary*D(a['potentialRatio'])),('nextFourUnreported',rows[:4],None,ordinary*D(a['potentialRatio'])/2)]:
  for key in rows[0]:check(sum(r[key]for r in selected)+(D(base[key])if base else 0),s[name][key])
  owners=sum(r['ownersNetProfit']for r in selected)+(D(base['ownersNetProfit'])if base else 0);denom=ordinary+(potential if owners>0 else 0);check(denom,s[name]['dilutedSharesMillionAssumed']);check(owners/denom,s[name]['dilutedEpsConditional'])
for r in m['inputManifest']:
 b=(root/r['file']).read_bytes();assert len(b)==r['bytes']and hashlib.sha256(b).hexdigest()==r['sha256'];checks+=1
for r in m['currentExpectationReverse']:
 base=m['scenarios'][1]['calendar2027'];required=D(r['mediaAttributedEps'])*D(base['dilutedSharesMillionAssumed']);pre=(required+D(base['nonControllingNetProfit']))/D('.76');check(required,r['requiredOwnersMillion']);check((pre-D(base['nonOperating']))/D('.26'),r['requiredRevenueAtBaseMargins']);check((pre-D(base['nonOperating'])+D(base['operatingExpenses']))/D(base['revenue']),r['requiredGrossMarginAtBaseRevenue'])
for r in m['reversePriceSensitivity']:
 base=m['scenarios'][1]['calendar2027'];denom=D(base['dilutedSharesMillionAssumed']);check(denom,r['sharesMillionAssumed']);required=D(m['price'])/D(r['multipleTestParameter'])*denom;assert abs(D(r['netIncome'])-required)<=D('.5');checks+=1;assert r['shareBasis']=='base2027 conditional diluted weighted shares; future assumption';check((required/D(base['revenue'])).quantize(D('.0001')),r['netMargin'])
a=(p/'article.md').read_text();body=a.split('<details>')[0];count=sum('\u4e00'<=c<='\u9fff'for c in body);assert 4000<=count<=6000,count;checks+=1
refs=set(re.findall(r'^\[([A-Z]+)\]: https://',a,re.M));assert set(re.findall(r'\[([A-Z]+)\]',body))<=refs;checks+=1
print(json.dumps({'independentDecimalChecks':checks,'quarterBridges':18,'sourceHashes':5,'mainBodyHan':count,'citations':len(refs),'valuationApproved':False}))
