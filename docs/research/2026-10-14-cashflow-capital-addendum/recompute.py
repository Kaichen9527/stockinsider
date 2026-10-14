"""Recompute retained-PDF historical cash bridges; no network, database or shared model imports."""
from decimal import Decimal, localcontext
from pathlib import Path
import json,hashlib
HERE=Path(__file__).resolve().parent
packet=json.loads((HERE/'source-packet.json').read_text())
checks=[]
def eq(name,a,b):
 assert a==b,(name,a,b)
 checks.append(name)
def ratio(a,b):
 with localcontext() as context:
  context.prec=36
  return str((Decimal(a)/Decimal(b)).quantize(Decimal('.000000001')))
rows=[]
for issuer in packet['issuers']:
 symbol=issuer['stock']; facts=issuer['facts']
 for name,fact in facts.items():
  text=(HERE/f"{issuer['issuer']}-pdf-page-{fact['pdfPage']:02d}.txt").read_text()
  assert fact['sourceLine'] in text,(symbol,name,'source line missing')
  assert len(fact['values'])==2 and all(type(v) is int for v in fact['values'])
  checks.append(f'{symbol}:{name}:retained_page_line')
 for i,period in enumerate(issuer['periods']):
  v=lambda key:facts[key]['values'][i]
  if symbol=='2409':
   noncash=sum(v(k) for k in ['depreciation','amortization','fvGain','interestExpenseAdjustment','interestIncomeAdjustment','dividendIncomeAdjustment','shareCompensation','equityMethodAdjustment','ppeDisposalGainAdjustment','rouDisposalLoss','heldForSaleGainAdjustment','investmentGainAdjustment','impairment','unrealizedFx','otherAdjustment'])
   wc=sum(v(k) for k in ['receivables','relatedReceivables','inventory','contractCosts','otherOperatingAssets','contractLiabilities','payables','relatedPayables','provisions','otherOperatingLiabilities'])
   eq(f'{symbol}:{period}:pretax_to_generated',v('pretax')+noncash+wc,v('generatedCash'))
   financing_borrowings=sum(v(k) for k in ['shortBorrowings','shortRepayments','longBorrowings','longRepayments'])
  else:
   noncash=v('nonCashAdjustments');wc=v('workingCapital')
   eq(f'{symbol}:{period}:working_capital',v('operatingAssetChange')+v('operatingLiabilityChange'),wc)
   eq(f'{symbol}:{period}:adjustments',noncash+wc,v('adjustmentsTotal'))
   eq(f'{symbol}:{period}:pretax_to_generated',v('pretax')+v('adjustmentsTotal'),v('generatedCash'))
   financing_borrowings=sum(v(k) for k in ['shortBorrowingsNet','longBorrowings','longRepayments'])
  interest_dividend_tax=sum(v(k) for k in ['interestReceived','interestPaid','taxPaid'])+(v('dividendReceived') if symbol=='2409' else 0)
  eq(f'{symbol}:{period}:generated_to_operating',v('generatedCash')+interest_dividend_tax,v('operatingCash'))
  eq(f'{symbol}:{period}:cash_change',sum(v(k) for k in ['operatingCash','investingCash','financingCash','fxCash']),v('cashChange'))
  eq(f'{symbol}:{period}:closing_cash',v('openingCash')+v('cashChange'),v('closingCash'))
  eq(f'{symbol}:{period}:consolidated_profit',v('ownersNetProfit')+v('nonControllingNetProfit'),v('netProfit'))
  ppe_proxy=v('operatingCash')+v('ppeCash')
  investment_proxy=ppe_proxy+v('intangibleCash')
  rows.append({'stock':symbol,'period':period,'unit':'TWD_thousands','cfo':v('operatingCash'),'groupNetProfit':v('netProfit'),'cfoDividedByGroupNetProfit':ratio(v('operatingCash'),v('netProfit')),'nonCashAdjustments':noncash,'workingCapitalCashEffect':wc,'ppeCashAcquisition':v('ppeCash'),'intangibleCashAcquisition':v('intangibleCash'),'cfoLessPpeCashOutlay':ppe_proxy,'cfoLessPpeAndIntangibleCashOutlay':investment_proxy,'afterLeasePrincipalSensitivity':investment_proxy+v('leasePrincipal'),'separateRouCashAcquisition':v('rouCash') if symbol=='2383' else None,'netBorrowingCash':financing_borrowings,'financingCash':v('financingCash'),'fxCash':v('fxCash'),'cashChange':v('cashChange'),'closingCash':v('closingCash'),'proxyDefinition':'CFO plus signed cash acquisition line(s); excludes disposal proceeds, M&A and financial-asset flows; not IFRS reported free cash flow, FCFE, maintenance capex or forecast'})
c=packet['auoJune30Capital']
eq('2409:capital_par_to_issued',c['paidCapitalTwdThousands']//c['parTwd'],c['issuedSharesThousands'])
eq('2409:owner_plus_nci_equity',c['ownersEquityTwdThousands']+c['nonControllingEquityTwdThousands'],c['groupEquityTwdThousands'])
capital={'instant':c['instant'],'ownersEquityPerIssuedCommonShareTwd':ratio(c['ownersEquityTwdThousands'],c['issuedSharesThousands']),'issuedCommonSharesThousands':c['issuedSharesThousands'],'treasuryEquityCarryingAmountTwdThousands':c['treasuryCarryingAmountTwdThousands'],'basis':'historical June30 issued common-share denominator supported by capital/equity statement; no October price-to-book, ending October share count or future equity approval'}
result={'sourcePacketSha256':hashlib.sha256((HERE/'source-packet.json').read_bytes()).hexdigest(),'checks':checks,'checksPassed':len(checks),'rows':rows,'auoHistoricalCapital':capital,'valuationApproved':False,'publicationApproved':False,'productionDataMutated':False}
(HERE/'derived-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'checksPassed':len(checks),'rows':rows,'auoHistoricalCapital':capital},ensure_ascii=False))
