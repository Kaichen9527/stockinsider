from pathlib import Path
import json,re,hashlib,subprocess,datetime
ROOT=Path('/Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09')
TMP=Path('/tmp/stockinsider-research-cashflow-validation-oct14')
OUT=ROOT/'docs/research/2026-10-14-cashflow-capital-addendum'
OUT.mkdir(parents=True,exist_ok=True)
now=datetime.datetime.now(datetime.timezone.utc).isoformat()

def signed(x):
 if x=='-':return 0
 return int(x.replace(',','').replace('(','-').replace(')',''))
def row(pages,page,label):
 matches=[l.strip() for l in pages[page-1].splitlines() if l.strip().startswith(label)]
 assert len(matches)==1,(page,label,matches)
 line=matches[0]
 match=re.search(r'(\(?[\d,]+\)?|-)\s+(\(?[\d,]+\)?|-)\s*$',line)
 assert match,(page,label,line)
 return {'label':label,'pdfPage':page,'sourceLine':line,'values':[signed(x) for x in match.groups()]}

def extract(issuer,folder,name,pages_cf,definitions,income_page):
 relay_path=ROOT/f'docs/research/2026-10-08-{folder}/financial-relay.json'
 relay=json.loads(relay_path.read_text()); source=relay['reports'][0]['source']
 base='auo-full-financial-oct08' if issuer=='auo' else 'emc-originals-oct08'
 pdf=Path('/Users/kaerchen/.cache/stockinsider-workspaces/research-evidence/2026-10-08')/base/name
 raw=pdf.read_bytes();assert hashlib.sha256(raw).hexdigest()==source['sha256'];assert len(raw)==source['bytes']
 text=(TMP/(issuer+'.txt')).read_text();pages=text.split('\f')
 facts={k:row(pages,page,label) for k,page,label in definitions}
 cols=relay['reports'][0]['columns']
 for k,label in [('revenue','營業收入'),('netProfit','本期淨利'),('ownersNetProfit','母公司業主'),('nonControllingNetProfit','非控制權益')]:
  line=relay['reports'][0]['sourceNumericLines'][k]
  assert line in pages[income_page-1],(issuer,k)
  facts[k]={'pdfPage':income_page,'label':label,'values':[cols[k][2],cols[k][3]],'sourceLine':line,'columnSelection':'2026H1 and 2025H1, source income statement columns 3 and 4; percentages excluded'}
 for page in sorted(set(pages_cf+[income_page])):
  (OUT/f'{issuer}-pdf-page-{page:02d}.txt').write_text(pages[page-1])
 return {'issuer':issuer,'stock':'2409' if issuer=='auo' else '2383','consolidated':True,'unit':'TWD_thousands','periods':['2026-01-01/2026-06-30','2025-01-01/2025-06-30'],'grain':'six-month cumulative flow, not standalone Q2','source':source,'retainedPdfLocalPath':str(pdf),'rawPdfReverifiedAt':now,'textExtractor':subprocess.check_output(['pdftotext','-v'],stderr=subprocess.STDOUT,text=True).splitlines()[0],'extractedTextSha256':hashlib.sha256(text.encode()).hexdigest(),'facts':facts}
AUO=[('pretax',8,'本期稅前淨利'),('depreciation',8,'折舊費用'),('amortization',8,'攤銷費用'),('fvGain',8,'透過損益按公允價值衡量之金融工具之淨利益'),('interestExpenseAdjustment',8,'利息費用'),('interestIncomeAdjustment',8,'利息收入'),('dividendIncomeAdjustment',8,'股利收入'),('shareCompensation',8,'股份基礎給付酬勞成本'),('equityMethodAdjustment',8,'採用權益法認列之關聯企業及合資損益之份額'),('ppeDisposalGainAdjustment',8,'處分及報廢不動產、廠房及設備利益'),('rouDisposalLoss',8,'處分使用權資產損失'),('heldForSaleGainAdjustment',8,'處分待出售非流動資產損益'),('investmentGainAdjustment',8,'處分投資利益淨額'),('impairment',8,'資產減損損失'),('unrealizedFx',8,'未實現外幣兌換利益'),('otherAdjustment',8,'其他 '),('receivables',8,'應收票據及帳款'),('relatedReceivables',8,'應收關係人款項'),('inventory',8,'存貨'),('contractCosts',8,'履行合約成本'),('otherOperatingAssets',8,'其他營業資產'),('contractLiabilities',8,'合約負債'),('payables',8,'應付票據及帳款'),('relatedPayables',8,'應付關係人款項'),('provisions',8,'負債準備'),('otherOperatingLiabilities',8,'其他營業負債'),('generatedCash',8,'營運產生之現金流入'),('interestReceived',8,'收取之利息'),('dividendReceived',8,'收取之股利'),('interestPaid',8,'支付之利息'),('taxPaid',8,'支付之所得稅'),('operatingCash',8,'營業活動之淨現金流入'),('ppeCash',9,'取得不動產、廠房及設備'),('intangibleCash',9,'取得無形資產'),('ppeDisposalCash',9,'處分不動產、廠房及設備'),('heldForSaleDisposalCash',9,'處分待出售非流動資產價款'),('subsidiaryDisposalCash',9,'處分子公司(扣除除列之子公司現金)'),('investingCash',9,'投資活動之淨現金流出'),('shortBorrowings',9,'舉借短期借款'),('shortRepayments',9,'償還短期借款'),('longBorrowings',9,'舉借長期借款'),('longRepayments',9,'償還長期借款'),('leasePrincipal',9,'租賃本金償還'),('financingCash',9,'籌資活動之淨現金流出'),('fxCash',9,'匯率變動對現金及約當現金之影響'),('cashChange',9,'本期現金及約當現金減少數'),('openingCash',9,'期初現金及約當現金餘額'),('closingCash',9,'期末現金及約當現金餘額')]
EMC=[('pretax',7,'本期稅前淨利'),('nonCashAdjustments',7,'收益費損項目合計'),('operatingAssetChange',7,'與營業活動相關之資產之淨變動合計'),('operatingLiabilityChange',7,'與營業活動相關之負債之淨變動合計'),('workingCapital',7,'與營業活動相關之資產及負債之淨變動合計'),('adjustmentsTotal',7,'調整項目合計'),('receivables',7,'應收帳款'),('notesReceivable',7,'應收票據'),('inventory',7,'存貨'),('payables',7,'應付帳款'),('generatedCash',7,'營運產生之現金流入'),('interestReceived',7,'收取之利息'),('interestPaid',7,'支付之利息'),('taxPaid',7,'支付之所得稅'),('operatingCash',7,'營業活動之淨現金流入'),('ppeCash',7,'取得不動產、廠房及設備'),('intangibleCash',7,'取得無形資產'),('rouCash',7,'取得使用權資產'),('ppeDisposalCash',7,'處分不動產、廠房及設備'),('investingCash',7,'投資活動之淨現金流出'),('shortBorrowingsNet',7,'短期借款增加'),('longBorrowings',7,'舉借長期借款'),('longRepayments',7,'償還長期借款'),('leasePrincipal',7,'租賃本金償還'),('financingCash',7,'籌資活動之淨現金流入'),('fxCash',7,'匯率變動對現金及約當現金之影響'),('cashChange',7,'本期現金及約當現金增加數'),('openingCash',7,'期初現金及約當現金餘額'),('closingCash',7,'期末現金及約當現金餘額')]
packet={'schemaVersion':1,'createdAt':now,'extractionAvailableAt':now,'status':'research_addendum_not_published','sourceCustody':'existing October 8 retained original PDF bytes rehashed; no network reacquisition, no production mutation','policy':{'historicalOct08ModelsUnchanged':True,'newExtractionBackdated':False,'valuationApproved':False,'published':False,'investmentAdmission':False},'issuers':[extract('auo','auo-full-financial','2026q2-consolidated-tc.pdf',[8,9],AUO,6),extract('emc','emc-official-evidence','2026q2.pdf',[7],EMC,5)]}
# The equity statement shows the ending treasury column as a dash for 2026-06-30.
auo_pages=(TMP/'auo.txt').read_text().split('\f')
for page in [7,38,40]:(OUT/f'auo-pdf-page-{page:02d}.txt').write_text(auo_pages[page-1])
packet['auoJune30Capital']={'instant':'2026-06-30','ownersEquityTwdThousands':154397339,'nonControllingEquityTwdThousands':12504849,'groupEquityTwdThousands':166902188,'paidCapitalTwdThousands':75470990,'parTwd':10,'issuedSharesThousands':7547099,'treasuryCarryingAmountTwdThousands':0,'treasurySharesThousands':0,'scope':'June 30 historical share/equity basis only; no current October outstanding-share or P/B claim','evidence':[{'pdfPage':7,'printedPage':'6','observation':'2026-06-30 ending equity row has dash in treasury-stock column; owners equity 154,397,339; common capital 75,470,990; no 2026H1 treasury transaction rows'},{'pdfPage':38,'printedPage':'36','observation':'paid capital 75,470,990 TWD thousand; par 10 TWD; 2025 cancellation 120,782 thousand shares'},{'pdfPage':40,'printedPage':'38','observation':'treasury rollforward shown is 2025H1, NOT a new 2026 share count; considered with June 2026 equity statement'}]}
(OUT/'source-packet.json').write_text(json.dumps(packet,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'packet':str(OUT/'source-packet.json'),'facts':{x['issuer']:len(x['facts']) for x in packet['issuers']},'rawSourcesHashMatched':True}))
