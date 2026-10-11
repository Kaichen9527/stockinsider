"""Local arithmetic on attributed hosted-reader data; never acquires or imports data."""
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP
import calendar,csv,datetime,hashlib,json,re
ROOT=Path(__file__).resolve().parent
RELAY=ROOT/'../../operations/2026-10-08/auo-financial-preparation-relay.json'
raw=RELAY.read_bytes();relay=json.loads(raw);rounding=json.loads((ROOT/'rounding-supplement-relay.json').read_text())
observed=datetime.datetime.strptime(relay['observedAt'],'%Y-%m-%d %H:%M:%S UTC').replace(tzinfo=datetime.timezone.utc).isoformat().replace('+00:00','Z')
D=Decimal;checks=[]
def verify(name,ok,detail):checks.append({'name':name,'pass':bool(ok),'detail':detail})
def interval(value,n=1):
 value=D(value);return {'lower':str(value-D(n)/2),'upper':str(value+D(n)/2),'lowerInclusive':True,'upperInclusive':False,'assumption':'each original amount independently rounded to nearest TWD_million; exact source precision not verified by VM'}
def growth(current,previous,current_count=1,previous_count=1):
 if previous<=0:return None
 c,p=D(current),D(previous);a,b=D(current_count)/2,D(previous_count)/2
 return {'reportedAmountRatioPercent':str(((c/p-1)*100).quantize(D('.000001'))),'roundingRangePercent':{'lower':str((((c-a)/(p+b)-1)*100).quantize(D('.000001'))),'upper':str((((c+a)/(p-b)-1)*100).quantize(D('.000001'))),'approximateDisplayOnly':True},'organicOrScopeAdjusted':False,'scopeCaveat':'ADLINK consolidated from2025-06-30; comparable-growth adjustments not available'}
months=[];by_month={};sources=[]
for key,s in relay['sources'].items():
 sources.append({'relayKey':key,**s,'acquisition':'root-hosted-web-reader relay; VM acquisition status separate','observedAtOriginal':relay['observedAt'],'observedAt':observed,'verifiedHistoricalAvailability':None,'publicationTimestamp':None,'vmBodyRead':False,'datePrecision':'date only when supplied; never exact timestamp','dateProvenance':'URL label or presentation date as relayed; not a VM publication-clock verification'})
for period,value,key in relay['monthlyConsolidatedRevenue']:
 y,m=map(int,period.split('-'));s=relay['sources'][key]
 row={'symbol':'2409','period':period,'periodEnd':f'{period}-{calendar.monthrange(y,m)[1]:02d}','reportedRevenue':value,'unit':relay['unit'],'consolidated':True,'unaudited':True,'sourceRelayKey':key,'sourceUrl':s['url'],'sourceDate':s.get('publicationDateFromUrl'),'sourceDateProvenance':'date from URL only' if s.get('publicationDateFromUrl') else 'unknown','sourcePublicationTimestamp':None,'observedAtOriginal':relay['observedAt'],'observedAt':observed,'mutableSource':s.get('mutableUrl',False),'historicalPITEligible':False,'historicalPITReason':'current reconstruction; no verified publication/availability timestamp for this individual period value','acquisition':'hosted_reader_relay_not_vm_fetch','roundingInterval':interval(value)}
 months.append(row);by_month[period]=row
for row in months:
 y,m=map(int,row['period'].split('-'));previous=by_month.get(f'{y-1:04d}-{m:02d}')
 row['yearOnYear']=growth(row['reportedRevenue'],previous['reportedRevenue']) if previous else None
 row['yearOnYearMissingReason']=None if previous else 'same-month prior-year outside supplied24months'
expected=[f'{y:04d}-{m:02d}' for y in [2024,2025,2026] for m in range(1,13) if (y,m)>=(2024,10) and (y,m)<=(2026,9)]
verify('24 month uniqueness and continuous order',[x['period'] for x in months]==expected and len(by_month)==24,{'first':expected[0],'last':expected[-1]})
verify('declared consolidated units and bounded values',relay['unit']=='TWD_million' and all(type(x['reportedRevenue']) is int and x['reportedRevenue']>=0 and x['sourceRelayKey'] in relay['sources'] for x in months),'Checks relay structure only; no original source column verification by VM.')
verify('observation preserved and no invented PIT',all(x['observedAtOriginal']==relay['observedAt'] and not x['historicalPITEligible'] and x['sourcePublicationTimestamp'] is None for x in months),observed)
quarters={}
for row in months:
 y,m=map(int,row['period'].split('-'));key=f'{y}-Q{(m-1)//3+1}';q=quarters.setdefault(key,{'period':key,'months':[],'monthlyDerivedRevenue':0,'unit':'TWD_million','officialQuarterStatementRevenue':None,'status':'sum_of_unaudited_monthly_values_not_exact_quarter_actual'})
 q['months'].append(row['period']);q['monthlyDerivedRevenue']+=row['reportedRevenue']
for key,q in quarters.items():
 q['roundingInterval']=interval(q['monthlyDerivedRevenue'],len(q['months']));previous=quarters.get(f'{int(key[:4])-1}{key[4:]}')
 q['yearOnYear']=growth(q['monthlyDerivedRevenue'],previous['monthlyDerivedRevenue'],len(q['months']),len(previous['months'])) if previous else None
 q['missingYearOnYearReason']=None if previous else 'prior-year quarter outside supplied24months'
 q['quarterStatementGap']='financial statement required; do not use annual/FY data as quarter'
verify('8 complete monthly-derived quarter groups',len(quarters)==8 and all(len(x['months'])==3 for x in quarters.values()),'These are8 monthly sums, not8 financial-statement bridges.')
verify('12 monthly YoY pairs and4 quarterly YoY pairs',sum(x['yearOnYear'] is not None for x in months)==12 and sum(x['yearOnYear'] is not None for x in quarters.values())==4,'Unadjusted consolidated reported-amount ratios only.')
for row in months:
 if row['yearOnYear'] is not None:
  y,m=map(int,row['period'].split('-'));prev=by_month[f'{y-1}-{m:02d}']['reportedRevenue'];pct=D(row['yearOnYear']['reportedAmountRatioPercent'])
  verify('YoY recomputation '+row['period'],abs(pct-(D(row['reportedRevenue'])/D(prev)-1)*100)<D('.000001'),{'percent':str(pct),'baseRevenue':prev})
comparison=[]
for period,last,reported,provenance in [('2026-Jan-Jun','2026-06',139923,'root rounding supplement'),('2026-Jan-Aug','2026-08',183394,'earlier root AUO20260909 preparation relay'),('2026-Jan-Sep','2026-09',206798,'root current relay caveat')]:
 vals=[x['reportedRevenue'] for x in months if '2026-01'<=x['period']<=last];total=sum(vals);bound=D(len(vals)+1)/2
 row={'period':period,'monthlySum':total,'reportedCumulative':reported,'deltaMonthlyMinusCumulative':total-reported,'reportedCumulativeProvenance':provenance,'monthlySumRoundingInterval':interval(total,len(vals)),'reportedCumulativeRoundingInterval':interval(reported),'possibleAbsoluteDifferenceUnderIndependentRounding':str(bound),'exactMatch':total==reported,'notProvenRoundingCause':True}
 comparison.append(row);verify('independent rounding intervals '+period,abs(D(total-reported))<bound,row)
h1=rounding['reportedInputs']['h1ReportedCumulative'];q1=rounding['q1CumulativeImpliedByRelayArithmetic'];derived=h1-q1;q2=quarters['2026-Q2']['monthlyDerivedRevenue'];cum_low=D(h1)-D('.5')-(D(q1)+D('.5'));cum_high=D(h1)+D('.5')-(D(q1)-D('.5'));mon_low=D(q2)-D('1.5');mon_high=D(q2)+D('1.5')
q2_comparison={'period':'2026-Q2','monthlySum':q2,'reportedCumulativeDifference':derived,'q1CumulativeImpliedByRelayArithmetic':q1,'q1ValueIsNotANewSourceRead':True,'monthlySumInterval':interval(q2,3),'cumulativeDifferenceInterval':{'lower':str(cum_low),'upper':str(cum_high),'lowerInclusive':False,'upperInclusive':False},'overlap':{'lower':str(max(mon_low,cum_low)),'upper':str(min(mon_high,cum_high))},'officialQuarterStatementRevenue':None,'doNotForceEquality':True}
verify('Q2 monthly and cumulative-difference rounding overlap',max(mon_low,cum_low)<min(mon_high,cum_high) and derived==70892 and q2==70890,q2_comparison)
b=relay['q425Bridge'];bridge_checks=[('gross',b['revenue']-b['costOfSales'],b['grossProfit']),('operating',b['grossProfit']-b['opex'],b['operatingProfit']),('pretax',b['operatingProfit']+b['netNonOperatingIncome'],b['pretax']),('net',b['pretax']+b['taxBenefit'],b['netProfit']),('owners and NCI',b['ownersProfit']+b['nciProfit'],b['netProfit']),('Q425 monthly versus reported revenue',quarters['2025-Q4']['monthlyDerivedRevenue'],b['revenue'])]
for name,computed,reported in bridge_checks:verify('4Q25 bridge '+name,computed==reported,{'computed':computed,'reported':reported,'delta':computed-reported,'unit':'TWD_million'})
eps=D(b['ownersProfit'])/D(b['basicWeightedSharesMillion']);verify('4Q25 basic EPS round to0.01',eps.quantize(D('.01'),rounding=ROUND_HALF_UP)==D(str(b['basicEps'])),{'ratio':str(eps),'rounded':str(eps.quantize(D('.01'),rounding=ROUND_HALF_UP)),'unit':'TWD_per_share'})
fields=['revenue','costOfSales','grossProfit','opex','operatingProfit','netNonOperatingIncome','pretax','taxBenefit','netProfit','ownersProfit','nciProfit','basicEps','basicWeightedSharesMillion','dilutedEps','dilutedWeightedSharesMillion']
visual=json.loads((ROOT/'q226-visual-financial-relay.json').read_text())
eight=json.loads((ROOT/'eight-quarter-visual-financial-relay.json').read_text())
visual_rows=[(x,{k:visual[k] for k in ['url','bytes','sha256','pageZeroBased']},visual['observedAt'],'q226-visual-financial-relay.json') for x in visual['periods']]
for values in eight['rows']:
 row=dict(zip(eight['columns'],values));visual_rows.append((row,eight['sources'][row['sourceKey']],eight['observedAt'],'eight-quarter-visual-financial-relay.json'))
bridges=[]
for original,proof,at,relay_file in sorted(visual_rows,key=lambda x:x[0]['period']):
 period=original['period'].replace('Q','-Q');values={k:original.get(k) for k in fields};values['costOfSales']=original['cogs'];values.pop('taxBenefit',None);values['taxBenefitExpenseSigned']=original['taxBenefitExpenseSigned']
 equations=[('gross',values['revenue']-values['costOfSales'],values['grossProfit']),('operating',values['grossProfit']-values['opex'],values['operatingProfit']),('pretax',values['operatingProfit']+values['netNonOperatingIncome'],values['pretax']),('net',values['pretax']+values['taxBenefitExpenseSigned'],values['netProfit']),('attribution',values['ownersProfit']+values['nciProfit'],values['netProfit'])]
 validation=[]
 for name,computed,printed in equations:
  item={'equation':name,'computedFromPrintedInputs':computed,'printedResult':printed,'delta':computed-printed,'exactPrintedEquality':computed==printed,'operandCount':2,'maximumAbsoluteDifferenceFrom3IndependentlyRoundedValues':'1.5','intervalsConsistent':abs(D(computed-printed))<D('1.5'),'assumption':'each original value independently rounded to nearest1million; does not verify exact underlying figures or rounding cause'}
  validation.append(item);verify('quarter bridge '+period+' '+name,item['intervalsConsistent'],item)
 ratio=D(values['ownersProfit'])/D(values['basicWeightedSharesMillion']);rounded=ratio.quantize(D('.01'),rounding=ROUND_HALF_UP)
 verify('quarter basic EPS '+period,rounded==D(str(values['basicEps'])),{'computedFromPrintedAmounts':str(ratio),'rounded':str(rounded),'printed':values['basicEps'],'unit':'TWD_per_share','sourceFiguresAlreadyRounded':True})
 numerator=D(values['ownersProfit']);denominator=D(values['basicWeightedSharesMillion']);corners=[n/d for n in [numerator-D('.5'),numerator+D('.5')] for d in [denominator-D('.5'),denominator+D('.5')]];eps_low=min(corners);eps_high=max(corners);printed_eps=D(str(values['basicEps']))
 verify('quarter basic EPS precision interval '+period,max(eps_low,printed_eps-D('.005'))<min(eps_high,printed_eps+D('.005')),{'ratioLower':str(eps_low),'ratioUpper':str(eps_high),'printedEpsLower':str(printed_eps-D('.005')),'printedEpsUpper':str(printed_eps+D('.005')),'displayPrecision':'money/shares1million; EPS0.01TWD; tie convention not established'})
 verify('quarter source relay integrity metadata '+period,bool(re.fullmatch('[a-f0-9]{64}',proof['sha256'])) and type(proof['bytes']) is int and proof['bytes']>0 and proof['pageZeroBased']==0,{'url':proof['url'],'sourceByteHashFormatOnly':True,'pdfByteHashVerifiedByVm':False,'observedAt':at})
 if period in quarters:
  monthly=quarters[period]['monthlyDerivedRevenue'];quarters[period]['officialQuarterStatementRevenue']=values['revenue'];quarters[period]['quarterStatementGap']=None;quarters[period]['officialRevenueProvenance']='root-Mac visual PDF relay; not VM fetch';delta=monthly-values['revenue'];limit=D(len(quarters[period]['months'])+1)/2
  verify('monthly to printed quarterly revenue '+period,abs(D(delta))<limit,{'monthlySum':monthly,'printedQuarter':values['revenue'],'delta':delta,'roundingDifferenceLimit':str(limit),'printedQuarterIsSeparatePeriodValue':True})
 bridges.append({'period':period,'periodGrain':'quarter','values':values,'monetaryUnit':'TWD_million','epsUnit':'TWD_per_share','shareUnit':'million_shares','sourceUrl':proof['url'],'sourcePageZeroBased':proof['pageZeroBased'],'sourcePageOneBased':proof['pageZeroBased']+1,'sourcePdfBytesReportedByMac':proof['bytes'],'sourcePdfSha256ReportedByMac':proof['sha256'],'pdfHashVerifiedByVm':False,'sourceRelayFile':relay_file,'observedAt':at,'publicationTimestamp':None,'historicalPITEligible':False,'acquisition':'root-Mac-public-reader HTTPS+Poppler visual relay; not VM source fetch/render','visualTableVerifiedByOriginReader':True,'financialContentVerifiedByVm':False,'arithmeticChecked':True,'printedPrecisionChecks':validation,'basicEpsCalculatedFromRoundedAmounts':str(ratio),'missing':['dilutedEps','dilutedWeightedSharesMillion','detailed nonoperating normalization','segment profit/notes','corporate-action adjustments','historical availability timestamp']})
verify('8 distinct consecutive real quarter bridge rows',[x['period'] for x in bridges]==['2024-Q3','2024-Q4','2025-Q1','2025-Q2','2025-Q3','2025-Q4','2026-Q1','2026-Q2'],'Income-statement P1 core columns only; no annual/FY duplicate or full-note completeness claim.')
verify('4Q25 visual statement matches original hosted handout relay',all(next(x for x in bridges if x['period']=='2025-Q4')['values'].get(k)==v for k,v in b.items() if k!='taxBenefit') and next(x for x in bridges if x['period']=='2025-Q4')['values']['taxBenefitExpenseSigned']==b['taxBenefit'],'Distinct source URLs retained; only relay values compared by VM.')
verify('Q226 statement revenue separate from monthly/cumulative estimates',next(x for x in bridges if x['period']=='2026-Q2')['values']['revenue']==70891 and q2_comparison['monthlySum']==70890 and q2_comparison['reportedCumulativeDifference']==70892,'Do not overwrite reported quarterly revenue or monthly inputs.')
q2_comparison['officialQuarterStatementRevenue']=70891
q2_comparison['officialRevenueProvenance']='root-Mac P1 visual relay; not VM fetch'
for bridge in bridges:
 prior=next((x for x in bridges if x['period']==f"{int(bridge['period'][:4])-1}{bridge['period'][4:]}"),None)
 bridge['printedQuarterRevenueYearOnYear']=growth(bridge['values']['revenue'],prior['values']['revenue']) if prior else None
 bridge['quarterRevenueYoYMissingReason']=None if prior else 'same-quarter prior year outside8 supplied financial quarters'
 if prior:
  pct=D(bridge['printedQuarterRevenueYearOnYear']['reportedAmountRatioPercent']);verify('printed quarter YoY recomputation '+bridge['period'],abs(pct-(D(bridge['values']['revenue'])/D(prior['values']['revenue'])-1)*100)<D('.000001'),{'percent':str(pct),'basis':'printed quarter revenue, independent of monthly sums'})
balance_relay=json.loads((ROOT/'q226-balance-visual-relay.json').read_text());bal=balance_relay['balance'];owner_equity=bal['totalEquity']-bal['nonControllingInterests'];component_sum=sum(bal[k] for k in ['commonStockCapital','capitalSurplus','retainedEarnings','otherEquity'])
verify('P3 asset liability equity bridge',bal['totalAssets']-bal['totalLiabilities']==bal['totalEquity'],{'computed':bal['totalAssets']-bal['totalLiabilities'],'printedEquity':bal['totalEquity']})
verify('P3 owner equity component interval reconciliation',abs(D(component_sum-owner_equity))<D('3'),{'totalEquityMinusNCI':owner_equity,'commonOwnerComponentSum':component_sum,'delta':component_sum-owner_equity,'sixIndependentPrintedValuesRoundingBound':'3','exactEquality':component_sum==owner_equity})
balance={'periodEnd':balance_relay['periodEnd'],'consolidatedPrintedValues':bal,'commonOwnerEquityDerived':owner_equity,'commonOwnerComponentSum':component_sum,'bookValuePerCommonShare':None,'priceToBook':None,'periodEndOutstandingCommonSharesNetTreasury':None,'missing':'period-end outstanding common shares net treasury and verified market price; no EPS-weighted-share or stock-capital substitute','sourceRelayFile':'q226-balance-visual-relay.json','sourceUrl':balance_relay['url'],'sourceSha256ReportedByMac':balance_relay['sourceSha256'],'sourcePageZeroBased':2,'sourcePageOneBased':3,'recordedAt':balance_relay['recordedAt'],'observedAt':None,'actualRenderTime':None,'approximateOriginalTimeNotUsed':True,'visualTableVerifiedByOriginReader':True,'vmFetchSucceeded':False,'historicalPITEligible':False}
verify('P/B refuses weighted EPS shares and approximate clock',balance['bookValuePerCommonShare'] is None and balance['priceToBook'] is None and balance['observedAt'] is None and balance['actualRenderTime'] is None,balance['missing'])
annual={year:{'monthlySum':sum(x['reportedRevenue'] for x in months if x['period'].startswith(year)),'months':sum(x['period'].startswith(year) for x in months),'isFullCalendarYear':sum(x['period'].startswith(year) for x in months)==12} for year in ['2024','2025','2026']}
ytd_current=annual['2026']['monthlySum'];ytd_prior=sum(x['reportedRevenue'] for x in months if '2025-01'<=x['period']<='2025-09')
dataset={'schemaVersion':'auo-current-reconstruction-research-dataset-v1','symbol':'2409','demonstrationOnly':True,'published':False,'productionImported':False,'completeResearch':False,'dataCutoffObservation':eight['observedAt'],'latestRelayRecordAt':balance_relay['recordedAt'],'balanceContext':balance,'sourceRelayInputSha256':hashlib.sha256(raw).hexdigest(),'monthlyConsolidatedRevenue':months,'monthlyDerivedQuarters':list(quarters.values()),'yearlyCoverage':annual,'cumulativeComparisons':comparison,'q2MonthlyVersusCumulative':q2_comparison,'financialQuarterBridges':bridges,'janSepYearOnYear':growth(ytd_current,ytd_prior,9,9),'researchQualification':'not_assessed','strategyApproved':False,'targetPrice':None}
ledger={'schemaVersion':'auo-source-ledger-v1','rootHostedReaderSources':sources,'rootMacVisualRelays':[visual,eight,balance_relay],'vmAcquisition':json.loads((ROOT/'vm-acquisition-ledger.json').read_text()),'clockPolicy':'Only current observedAt supplied. URL/presentation dates are labels, not verified exact availability. No historical PIT eligibility, wire hashes or official source IDs fabricated.','roundingSupplement':rounding}
result={'schemaVersion':'auo-relay-recomputation-results-v1','counts':{'pass':sum(x['pass'] for x in checks),'fail':sum(not x['pass'] for x in checks),'skip':0},'cases':checks,'roundingPolicy':'Assumed nearest-integer million intervals applied per original value, not a fixed aggregate tolerance; original source precision still needs acquisition.','dataSourceVerification':'relay arithmetic only; not VM source fetch or research qualification'}
for name,obj in [('dataset.json',dataset),('source-ledger.json',ledger),('calculation-results.json',result)]: (ROOT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
with (ROOT/'monthly-revenue.csv').open('w',newline='') as f:
 fields_csv=['period','reportedRevenue','unit','sourceRelayKey','sourceUrl','sourceDate','observedAt','historicalPITEligible'];writer=csv.DictWriter(f,fieldnames=fields_csv);writer.writeheader();writer.writerows({k:x[k] for k in fields_csv} for x in months)
with (ROOT/'quarterly-income.csv').open('w',newline='') as f:
 columns=['period',*bridges[0]['values'].keys(),'sourceUrl','sourcePageZeroBased','observedAt','sourcePdfSha256ReportedByMac'];writer=csv.DictWriter(f,fieldnames=columns);writer.writeheader();writer.writerows({'period':x['period'],**x['values'],**{k:x[k] for k in ['sourceUrl','sourcePageZeroBased','observedAt','sourcePdfSha256ReportedByMac']}} for x in bridges)
print(json.dumps({'checks':result['counts'],'quarterSums':{k:q['monthlyDerivedRevenue'] for k,q in quarters.items()},'monthlySeptYoY':by_month['2026-09']['yearOnYear'],'q32026YoY':quarters['2026-Q3']['yearOnYear'],'janSepYoY':dataset['janSepYearOnYear'],'H1andQ2':q2_comparison},ensure_ascii=False,indent=2))
if result['counts']['fail']:raise SystemExit(1)
