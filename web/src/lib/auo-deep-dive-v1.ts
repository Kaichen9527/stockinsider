import pbHistory from '../data/auo-pb-history-v1.json' with { type: 'json' };
import { historicalPbQuartiles, type CommercializationInputs, type ForecastQuarterInput, type ScenarioAdjustment } from './auo-deep-dive-model.ts';

export const AUO_RESEARCH_VERSION = 'auo-2409-2026-09-26.v7';
export const AUO_AS_OF = '2026-09-24';
export const AUO_PRICE = 34.20;
export const AUO_DILUTED_SHARES_MILLION = 7_547;
export const AUO_BOOK_VALUE_PER_SHARE = 20.46;
export const AUO_COMMON_EQUITY_MILLION = 154_397.339;
export const AUO_ENDING_COMMON_SHARES_MILLION = 7_547.098972;
export const AUO_PB_HISTORY = historicalPbQuartiles(pbHistory, AUO_AS_OF);

export const auoAnnouncedAssetDisposals = [
  { date: '2026-07-28', asset: '桃園華亞廠', buyer: '廣達', expectedGainAfterEstimatedCostsAndTaxMillion: 13_390, source: 'S34' },
  { date: '2026-07-30', asset: '高雄 C5E 廠', buyer: '日月光半導體', expectedGainAfterEstimatedCostsAndTaxMillion: 4_280, source: 'S35' },
] as const;
export const auoAssetDisposalSensitivity = {
  expectedGainMillion: auoAnnouncedAssetDisposals.reduce((sum, transaction) => sum + transaction.expectedGainAfterEstimatedCostsAndTaxMillion, 0),
  perShareIfFullyAttributable: auoAnnouncedAssetDisposals.reduce((sum, transaction) => sum + transaction.expectedGainAfterEstimatedCostsAndTaxMillion, 0) / AUO_DILUTED_SHARES_MILLION,
  recognitionYear: null,
  attributableShare: null,
} as const;

// A net one-percentage-point cost increase on forecast Display revenue is a
// stress test, not an estimate of AUO's yen-priced Corning glass exposure.
export const auoDisplayInputCostSensitivity = {
  displayRevenue2027Million: 29_700 + 32_850 + 33_050 + 31_350,
  netCostAsShareOfDisplayRevenue: 0.01,
  afterTaxEpsImpact: ((29_700 + 32_850 + 33_050 + 31_350) * 0.01 * (1 - 0.2)) / AUO_DILUTED_SHARES_MILLION,
  verifiedExposure: null,
} as const;

export const auoQuarterlyActuals = [
  { period: '2024Q3', revenue: 77_748, grossProfit: 8_454, operatingIncome: -310, commonNetIncome: -926, reportedEps: -0.12, grossMargin: 10.9 },
  { period: '2024Q4', revenue: 68_692, grossProfit: 5_446, operatingIncome: -3_323, commonNetIncome: 1_619, reportedEps: 0.21, grossMargin: 7.9 },
  { period: '2025Q1', revenue: 72_102, grossProfit: 8_778, operatingIncome: 1_141, commonNetIncome: 3_294, reportedEps: 0.44, grossMargin: 12.2 },
  { period: '2025Q2', revenue: 69_237, grossProfit: 9_362, operatingIncome: 1_504, commonNetIncome: 1_948, reportedEps: 0.26, grossMargin: 13.5 },
  { period: '2025Q3', revenue: 69_908, grossProfit: 6_690, operatingIncome: -1_806, commonNetIncome: -1_280, reportedEps: -0.17, grossMargin: 9.6 },
  { period: '2025Q4', revenue: 70_142, grossProfit: 7_525, operatingIncome: -1_893, commonNetIncome: 2_882, reportedEps: 0.38, grossMargin: 10.7 },
  { period: '2026Q1', revenue: 69_031, grossProfit: 8_183, operatingIncome: -636, commonNetIncome: -1_144, reportedEps: -0.15, grossMargin: 11.9 },
  { period: '2026Q2', revenue: 70_891, grossProfit: 9_248, operatingIncome: 218, commonNetIncome: 1_343, reportedEps: 0.18, grossMargin: 13.0 },
];

export const auoMonthlyRevenue = [
  ['2024-09', 25_872], ['2024-10', 20_873], ['2024-11', 23_257], ['2024-12', 24_594],
  ['2025-01', 21_643], ['2025-02', 24_606], ['2025-03', 25_853], ['2025-04', 23_138],
  ['2025-05', 24_177], ['2025-06', 21_922], ['2025-07', 20_923], ['2025-08', 24_539],
  ['2025-09', 24_445], ['2025-10', 20_916], ['2025-11', 24_036], ['2025-12', 25_190],
  ['2026-01', 22_505], ['2026-02', 20_505], ['2026-03', 26_021], ['2026-04', 22_100],
  ['2026-05', 23_838], ['2026-06', 24_952], ['2026-07', 20_370], ['2026-08', 23_102],
] as const;

const quarter = (
  period: string,
  year: number,
  mobility: [number, number],
  vertical: [number, number],
  display: [number, number],
  other: [number, number],
  corporate: number,
  nonOperating: number,
): ForecastQuarterInput => ({
  period,
  year,
  segments: {
    mobility: { revenue: mobility[0], operatingMargin: mobility[1] },
    vertical: { revenue: vertical[0], operatingMargin: vertical[1] },
    display: { revenue: display[0], operatingMargin: display[1] },
    other: { revenue: other[0], operatingMargin: other[1] },
  },
  corporateAndOtherOperatingIncome: corporate,
  recurringNonOperatingIncome: nonOperating,
  taxRate: 0.2,
  nonControllingInterest: 100,
  oneOffAfterTax: 0,
});

export const auoForecastBaseQuarters: ForecastQuarterInput[] = [
  quarter('2026Q3E', 2026, [20_560, 0.040], [13_870, 0.058], [32_350, -0.025], [2_720, 0.010], -250, -100),
  quarter('2026Q4E', 2026, [20_970, 0.041], [14_290, 0.060], [30_730, -0.018], [2_610, 0.010], -220, -80),
  quarter('2027Q1E', 2027, [20_340, 0.042], [14_430, 0.060], [29_700, -0.013], [2_530, 0.010], -210, -80),
  quarter('2027Q2E', 2027, [21_150, 0.044], [14_870, 0.062], [32_850, -0.006], [2_630, 0.010], -200, -60),
  quarter('2027Q3E', 2027, [21_780, 0.046], [15_320, 0.064], [33_050, 0.002], [2_650, 0.010], -190, -40),
  quarter('2027Q4E', 2027, [22_220, 0.048], [15_630, 0.065], [31_350, 0.005], [2_700, 0.010], -180, -40),
];

export const auoScenarioAdjustments: Record<'bear' | 'base' | 'bull', ScenarioAdjustment> = {
  bear: {
    label: '保守',
    revenueMultiplier: { mobility: 0.95, vertical: 0.94, display: 0.92, other: 0.95 },
    marginDelta: { mobility: -0.012, vertical: -0.015, display: -0.018, other: -0.01 },
    fairPe: null,
    fairPb: AUO_PB_HISTORY.p25,
    projectedDividendsMillion: 0,
    projectedCapitalAndOciMillion: 0,
  },
  base: {
    label: '基本',
    revenueMultiplier: { mobility: 1, vertical: 1, display: 1, other: 1 },
    marginDelta: { mobility: 0, vertical: 0, display: 0, other: 0 },
    fairPe: 20,
    fairPb: AUO_PB_HISTORY.p50,
    projectedDividendsMillion: 0,
    projectedCapitalAndOciMillion: 0,
  },
  bull: {
    label: '樂觀',
    revenueMultiplier: { mobility: 1.06, vertical: 1.07, display: 1.06, other: 1.04 },
    marginDelta: { mobility: 0.020, vertical: 0.020, display: 0.025, other: 0.012 },
    fairPe: 24,
    fairPb: AUO_PB_HISTORY.p75,
    projectedDividendsMillion: 0,
    projectedCapitalAndOciMillion: 0,
  },
};

export const auoSources = [
  { id: 'S1', type: '公司原始資料', title: '友達 2026Q2 法說簡報', url: 'https://www.auo.com/upload/media/ir/Financial_Information/2Q26_Handout_English.pdf', date: '2026-07-30', supports: '合併損益、營收組成、三大事業獲利率、第三季指引' },
  { id: 'S2', type: '公司原始資料', title: '友達 2026Q2 合併財務報告', url: 'https://www.auo.com/upload/media/ir/Financial_Information/2Q26_Finance_Statement_English.pdf', date: '2026-07-30', supports: '股本、歸屬母公司淨利、資產負債與一次性項目核對' },
  { id: 'S3', type: '公司原始資料', title: '友達 2026Q2 財報新聞稿', url: 'https://www.auo.com/zh-TW/News_Archive/detail/news_IR_20260730', date: '2026-07-30', supports: 'Q2 實績、凌華合併口徑、Q3 需求敘述' },
  { id: 'S4', type: '公司原始資料', title: '友達投資人法說會資料庫', url: 'https://www.auo.com/en-global/Investor_Conference/index', date: '2026-09-19', supports: '八季法說簡報與財報索引' },
  { id: 'S5', type: '公司原始資料', title: '友達 2024Q3 法說簡報', url: 'https://www.auo.com/upload/media/ir/Financial_Information/3Q24_Handout_English.pdf', date: '2024-10-31', supports: 'BHTC 自 2024 年 4 月納入合併、Q3 實績' },
  { id: 'S6', type: '公司原始資料', title: '友達 2024Q4 法說簡報', url: 'https://www.auo.com/upload/media/ir/Financial_Information/4Q24_Handout_English.pdf', date: '2025-02-13', supports: 'Q4 資產處分利益、全年損益與一次性辨識' },
  { id: 'S7', type: '公司原始資料', title: '友達 2025Q2 法說簡報', url: 'https://www.auo.com/upload/media/ir/Financial_Information/2Q25_Handout_English.pdf', date: '2025-07-31', supports: 'Q2 毛利率、營業利益與 EPS' },
  { id: 'S8', type: '公司原始資料', title: '友達 2026 年 8 月營收', url: 'https://www.auo.com/ja-JP/News_Archive/detail/News_Archive_FinanceReport_20260909', date: '2026-09-09', supports: '8 月營收與前八月年增率交叉核對' },
  { id: 'S9', type: '公司原始資料', title: '友達 2026 年 7 月營收', url: 'https://www.auo.com/en-global/New_Archive/detail/News_Archive_FinanceReport_20260810', date: '2026-08-10', supports: '7 月營收與年增率交叉核對' },
  { id: 'S10', type: '公司原始資料', title: '友達三大支柱組織調整', url: 'https://www.auo.com/zh-TW/News_Archive/detail/News_Archive_CorporateNews_20260701', date: '2026-07-01', supports: 'Display、Mobility、Vertical 組織與產品邊界' },
  { id: 'S11', type: '公司原始資料', title: '友達車用顯示產品', url: 'https://www.auo.com/en-global/products/index/Display_Panel_Products/Car_Display', date: '2026-09-19', supports: '車用顯示產品與應用範圍' },
  { id: 'S12', type: '公司原始資料', title: '友達 Micro LED 展示', url: 'https://www.auo.com/en-global/New_Archive/detail/News_Archive_Product_20260330', date: '2026-03-30', supports: 'Micro LED 展示與量產狀態界線' },
  { id: 'S13', type: '公司原始資料', title: '友達 CPO／GCS 技術展示', url: 'https://auo.com/zh-CN/News_Archive/detail/News_Archive_Product_20260831', date: '2026-08-31', supports: '研發展示，不視為已確認營收' },
  { id: 'S14', type: '官方市場資料', title: 'TWSE 友達日成交資訊', url: 'https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=20260901&stockNo=2409', date: '2026-09-24', supports: '最新完整交易日 OHLCV 與技術指標' },
  { id: 'S15', type: '公開資料鏡像', title: 'FinMind 台灣上市櫃月營收資料', url: 'https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockMonthRevenue&data_id=2409&start_date=2024-09-01&end_date=2026-09-30', date: '2026-09-09', supports: '24 個月營收序列；最近月份以公司公告交叉核對' },
  { id: 'S16', type: '產業研究', title: 'TrendForce：2026 年 9 月面板價格與 NB 需求', url: 'https://www.trendforce.com/news/2026/09/08/insights-early-september-panel-prices-tv-mnt-nb-prices-seen-flat-nb-demand-may-weaken-further-in-4q/', date: '2026-09-08', supports: '面板報價平、Q4 筆電需求下修風險' },
  { id: 'S17', type: '產業研究', title: 'Omdia：中國車用面板廠 2026H2 出貨占比估 65.2%', url: 'https://omdia.tech.informa.com/pr/2026/sep/china-based-panel-makers-to-capture-65percent-of-automotive-display-shipments-in-2h26', date: '2026-09-03', supports: '車用顯示供給擴張與價格壓力反證' },
  { id: 'S18', type: '同業原始資料', title: 'LG Display 2026Q2 財報', url: 'https://www.lgdisplay.com/kor/company/media-center/latest-news?contentId=5558', date: '2026-07-30', supports: 'OLED 轉型、Q2 一次性費用與獲利對照' },
  { id: 'S19', type: '同業原始資料', title: 'TCL 科技 2026 半年報索引', url: 'https://www.tcltech.com/investor-relations/financial-reports/periodical-reports', date: '2026-08-29', supports: '華星光電獲利、車載增長與新產能時程' },
  { id: 'S20', type: '同業原始資料', title: 'Visteon 2026Q2 財報', url: 'https://investors.visteon.com/news-releases/news-release-details/visteon-announces-second-quarter-2026-financial-results', date: '2026-07-30', supports: '座艙電子系統毛利結構、訂單與量產節奏' },
  { id: 'S21', type: '公司原始資料', title: '友達 2024 年報', url: 'https://auo.com/upload/media/ir/2024_AUO_Annual_Report_TC.pdf', date: '2025-03-12', supports: 'BHTC 收購、事業轉型與風險' },
  { id: 'S22', type: '官方市場資料', title: 'TWSE 友達個股本益比、殖利率及股價淨值比', url: 'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?date=20260901&stockNo=2409&response=json', date: '2026-09-18', supports: '2021-10 至 2026-09 共 60 個月底 P/B、當日收盤與財報季別錨點' },
  { id: 'S23', type: '公司原始資料', title: '友達 SEMICON Taiwan：Micro LED CPO 與 GCS', url: 'https://www.auo.com/zh-TW/News_Archive/detail/News_Archive_Product_20260831', date: '2026-08-31', supports: '確認 CPO 系統模組分工、康寧 GCS 展示與仍在驗證／商品化推進階段' },
  { id: 'S24', type: '公開新聞', title: '中央社：傳 Intel 有意攜手友達', url: 'https://www.cna.com.tw/news/afe/202609210034.aspx', date: '2026-09-21', supports: 'Intel 合作傳聞、當時尚無具體合作公告，以及消息後盤面反應' },
  { id: 'S25', type: '公開新聞', title: '經濟日報轉載：友達、台積電與 Intel 合作傳聞', url: 'https://tw.stock.yahoo.com/news/%E5%8F%8B%E9%81%94%E7%B4%85%E4%BA%86-%E5%82%B3%E8%88%87%E5%8F%B0%E7%A9%8D%E9%9B%BB%E6%94%9C%E6%89%8B%E8%A1%9D%E9%9D%A2%E6%9D%BF%E7%B4%9A%E5%B0%81%E8%A3%9D-%E8%8B%B1%E7%89%B9%E7%88%BE%E4%B9%9F%E4%B8%8A%E9%96%80%E8%AB%87%E5%85%88%E9%80%B2%E5%B0%81%E8%A3%9D%E5%90%88%E4%BD%9C-224858036.html', date: '2026-09-20', supports: '目前可核對的公開傳聞時間點；不視為訂單或公司確認' },
  { id: 'S26', type: '公開社群', title: 'PTT Stock：經濟日報報導轉載與市場討論', url: 'https://www.ptt.cc/bbs/Stock/M.1789952476.A.551.html', date: '2026-09-21', supports: '消息傳播時間線；屬同源轉載，不增加獨立確認數' },
  { id: 'S27', type: '公司原始資料', title: 'Intel：整合式 Optical I/O Chiplet', url: 'https://www.intel.com/content/www/us/en/newsroom/news/intel-unveils-first-integrated-optical-io-chiplet.html', date: '2024-06-26', supports: 'Intel 既有 optical I/O 技術路線；不能據此推定採用友達方案' },
  { id: 'S28', type: '合作方原始資料', title: 'Intel 與藍思科技玻璃基板合作公告', url: 'https://www.intel.com/content/www/us/en/newsroom/news/corporate/intel-and-lens-technology-collaborate-to-enable-advanced-semiconductor-packaging-for-the-ai-era.html', date: '2026-07-24', supports: 'Intel 已公開另一條玻璃基板合作路線；非友達訂單確認' },
  { id: 'S29', type: '產業研究', title: 'Omdia：AI 光互連的 LRO、CPO、NPO、xPO 多路線競爭', url: 'https://omdia.tech.informa.com/blogs/2026/mar/navigating-the-ai-infrastructure-build-super-cycle', date: '2026-03', supports: 'CPO 採用時程與可取得份額須受其他技術路線約束；頁面僅能確認月份' },
  { id: 'S30', type: '官方市場資料', title: 'TWSE 加權指數歷史資料', url: 'https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=20260924', date: '2026-09-24', supports: '9/18 與 9/24 加權指數收盤，計算友達相對表現' },
  { id: 'S31', type: '官方市場資料', title: 'TWSE 友達三大法人買賣超日報', url: 'https://www.twse.com.tw/rwd/zh/fund/T86?date=20260924&selectType=ALL&response=json', date: '2026-09-24', supports: '9/24 友達外資、投信與自營商淨買賣；前幾日依同路徑日期查核' },
  { id: 'S32', type: '官方市場資料', title: 'TWSE 2026 年市場開休市日期', url: 'https://www.twse.com.tw/holidaySchedule/holidaySchedule?response=json&queryYear=2026', date: '2026-09-25', supports: '9/25 與 9/28 休市；技術資料過期判斷依交易日計算' },
  { id: 'S33', type: '同業原始資料', title: '京東方 2026-07-02 投資者交流紀錄', url: 'https://static.cninfo.com.cn/finalpage/2026-07-03/1225407620.PDF', date: '2026-07-03', supports: '京東方與康寧合作、Micro LED 光互連及玻璃載板 CPO 專案組；其新業務仍未量產' },
  { id: 'S34', type: '公開資訊觀測站公告轉載', title: '友達 7/28 華亞廠處分重大訊息', url: 'https://www.moneydj.com/kmdj/news/newsviewer.aspx?a=d79d267f-ece8-4552-9ced-2b8068255de5', date: '2026-07-28', supports: '逐字轉載公告：廣達交易、預計處分利益 133.9 億元，已扣估計費用及稅；原 MOPS 歷史頁尚待核對' },
  { id: 'S35', type: '公開資訊觀測站公告轉載', title: '友達 7/30 高雄廠處分重大訊息', url: 'https://pchome.megatime.com.tw/news/cat7/20260730/9700002409202607304.html', date: '2026-07-30', supports: '逐字轉載公告：日月光半導體交易、預計處分利益 42.8 億元，已扣估計費用及稅；原 MOPS 歷史頁尚待核對' },
  { id: 'S36', type: '公開社群單一作者', title: 'Threads 公開貼文：鼎元訂單與友達 CPO／Intel 鏈之說', url: 'https://www.threads.com/@caiboren658/post/DdsyK13ksEL', date: '2026-09-25', supports: '9/25 觀測到的單一作者主帖及其續帖 https://www.threads.com/@caiboren658/post/DdsyK2dElWW；僅為待查假說，兩帖不算兩個獨立來源' },
  { id: 'S37', type: '供應鏈公司原始資料', title: '鼎元公司沿革與 2025–2026 光通訊產品開發', url: 'https://www.tyntek.com.tw/about_01.php', date: '2026-09-25', supports: '鼎元自述 100G／200G lane PD 與 Micro-PD 開發；不含 Intel 或友達 CPO 訂單確認；頁面未標具體發布日，日期為查核日' },
  { id: 'S38', type: '公開新聞', title: 'MoneyDJ：鼎元 PD 訂單能見度與 Micro LED CPO 仍在驗證', url: 'https://www.moneydj.com/KMDJ/news/newsviewer.aspx?a=72ab35d5-00c3-4978-891a-118a52253901', date: '2026-09-09', supports: '報導分別描述既有 PD 產品訂單能見度及友達／富采 Micro LED CPO 開發驗證；未確認 Threads 所稱 Intel 或具名 CSP 新單' },
  { id: 'S39', type: '材料供應商原始資料', title: '康寧：調整日圓計價顯示玻璃基板價格', url: 'https://www.corning.com/tw/zh_tw/products/display-glass/news/news-releases/2026/09/corning-announces-currency-and-inflation-adjustment-of-display-glass-substrate-prices.html', date: '2026-09-11', supports: '2026Q4 起全球日圓計價顯示玻璃基板漲價至少 15%；未揭露友達採購幣別、涵蓋量或轉嫁條件，亦非 GCS 價格公告' },
] as const;

export const auoMarketContext = {
  baseline: { date: '2026-09-18', stockClose: 30.35, indexClose: 47_180.75 },
  latest: { date: '2026-09-24', stockClose: AUO_PRICE, indexClose: 48_024.60 },
  institutionalFlow: [
    { date: '2026-09-21', foreignNetShares: 235_893_466, investmentTrustNetShares: -27_329, dealerNetShares: 22_412_688 },
    { date: '2026-09-22', foreignNetShares: 245_313_959, investmentTrustNetShares: -42_863, dealerNetShares: 5_213_522 },
    { date: '2026-09-23', foreignNetShares: -153_888_176, investmentTrustNetShares: 229_000, dealerNetShares: -8_478_430 },
    { date: '2026-09-24', foreignNetShares: -79_998_614, investmentTrustNetShares: -6_000, dealerNetShares: 2_103_828 },
  ],
} as const;

export const auoEvidenceLedger = [
  { claim: 'Micro LED CPO 模組與集團分工', rootSource: 'S23', publishedAt: '2026-08-31', firstObservedAt: null, status: '公司已公開技術展示；未公開量產訂單', relation: '原始公司公告' },
  { claim: '友達與康寧 GCS／RDL 展示', rootSource: 'S23', publishedAt: '2026-08-31', firstObservedAt: null, status: '公司已公開展示與驗證進度；未公開量產訂單', relation: '與 CPO 同一公司公告，不增加獨立來源數' },
  { claim: 'Intel 與友達討論先進封裝合作', rootSource: 'S25', publishedAt: '2026-09-20', firstObservedAt: null, status: '媒體傳聞；雙方合作範圍未確認', relation: 'S24 報導傳聞；S26 轉載 S25，不作獨立確認' },
  { claim: 'Intel 與藍思科技玻璃封裝合作', rootSource: 'S28', publishedAt: '2026-07-24', firstObservedAt: null, status: 'Intel 正式公告；屬友達假說的競爭路線', relation: '獨立合作方原始公告' },
  { claim: '9/24 股價與法人流向', rootSource: 'S14', publishedAt: '2026-09-24', firstObservedAt: '2026-09-25T07:04:25+08:00', status: '交易所行情與三大法人資料已核對；不代表合作消息獲確認', relation: 'S14 為行情根源，S31 為法人流向根源；價格與籌碼是不同觀測，不增加傳聞的獨立確認數' },
  { claim: '京東方亦投入 Micro LED 光互連與玻璃載板 CPO', rootSource: 'S33', publishedAt: '2026-07-03', firstObservedAt: '2026-09-25T07:09:04+08:00', status: '京東方原始投資者紀錄確認研發專案與康寧合作；該業務尚未量產', relation: '獨立同業原始資料，限制友達技術獨占與遠期份額假設' },
  { claim: '友達公告出售華亞廠及高雄 C5E 廠', rootSource: 'S34', publishedAt: '2026-07-28', firstObservedAt: '2026-09-25T18:05:41+08:00', status: '兩筆重大訊息逐字轉載載明預計處分利益；交割、認列年度與最終歸屬仍待核對', relation: 'S34 與 S35 為兩筆不同交易；新聞再轉載不增加獨立證據數' },
  { claim: '鼎元已有新 Intel／CSP 訂單並帶動友達 CPO 量產', rootSource: 'S36', publishedAt: '2026-09-25（貼文相對時間）', firstObservedAt: '2026-09-25T18:08:00+08:00', status: '單一 Threads 作者的待查說法；鼎元官網只支持 PD 開發，公開報導將既有 PD 能見度與 Micro LED CPO 驗證分開；未見 Intel／CSP 具名新單或友達 CPO 量產證據', relation: '同作者主帖與續帖為一個消息根源；S38 是較早的 PD 報導，不能視為對新傳聞的獨立確認' },
  { claim: '康寧調漲部分顯示玻璃基板價格', rootSource: 'S39', publishedAt: '2026-09-11', firstObservedAt: '2026-09-26T18:05:44+08:00', status: '供應商已公告日圓計價品項自 2026Q4 漲價至少 15%；友達實際適用比例與轉嫁能力未公開', relation: '康寧原始公告；媒體轉載不算額外確認；不能推定半導體 GCS 同幅漲價' },
] as const;

export const auoMarketEvents = [
  { date: '2026-07-30', label: '已公告，待認列', title: '友達兩筆廠房處分合計預計利益 176.7 億元', detail: '7/28 華亞廠與 7/30 高雄 C5E 廠公告的預計處分利益，分別為 133.9 億及 42.8 億元，公告稱已扣相關費用及預估稅。', impact: '報表 EPS 和淨值可能於交割認列時增加，但非持續營業獲利；認列年度與歸屬普通股比例未核定前，不灌入年度基本情境，也不乘持續獲利 P/E。', sources: ['S34', 'S35'] },
  { date: '2026-08-31', label: '已確認', title: '友達公開 CPO／GCS 階段性成果', detail: '友達揭露 Micro LED CPO 系統模組、RDL、光學耦合及與康寧合作的玻璃核心基板；尚未揭露客戶訂單、量產收入與毛利。', impact: '這是轉型可行性的事前證據，應建立條件式重估情境，但不直接增加 2027 EPS。', sources: ['S23'] },
  { date: '2026-09-11', label: '已公告，影響待核', title: '康寧調高日圓計價顯示玻璃基板價格', detail: '康寧宣布 2026Q4 起對全球日圓計價顯示玻璃基板調價至少 15%；並未揭露友達採購幣別與合約適用比例。', impact: '對 Display 毛利是條件式成本風險，須核對採購暴露與面板售價轉嫁；不可把漲幅直接套到友達全部成本，亦不可當作 GCS 產品售價。', sources: ['S39'] },
  { date: '2026-09-20', label: '市場傳聞', title: '公開報導出現 Intel 合作說法', detail: '目前可核對的公開報導稱 Intel 洽談合作；尚未找到雙方聯名公告、採購合約或量產時程。', impact: '提高市場對友達由面板廠切入先進封裝／光互連的期待，先改變事件風險與倍數討論。', sources: ['S24', 'S25'] },
  { date: '2026-09-21', label: '價格確認', title: '突破原 32.2 元門檻', detail: '收盤 33.35 元、成交量 8.23 億股，符合原先 9/19 放量突破條件。', impact: '原波段劇本由等待轉為觸發；不能事後把門檻上移後仍顯示等待。', sources: ['S14'] },
  { date: '2026-09-22', label: '目標到達', title: '收盤 36.65 元，到達原量度目標', detail: '兩個交易日由 30.35 元上漲 20.76%，原 36.6 元技術量度目標已到達。', impact: '追價的報酬風險比惡化；下一個判斷改為等待整理、查證事件與重新建立劇本。', sources: ['S14'] },
  { date: '2026-09-23', label: '高檔換手', title: '目標到達後回落至 34.70 元', detail: '開盤與最高均為 36.65 元，最低 33.40 元，收 34.70 元、跌 5.32%，成交量 9.49 億股。', impact: '原突破劇本仍維持已完成，不事後移動目標；新部位尚未形成可重算的整理完成訊號，先觀察 32.2 元突破區及事件查證。', sources: ['S14'] },
  { date: '2026-09-24', label: '縮量續跌', title: '收 34.20 元，外資連兩日賣超', detail: '收盤較前日跌 1.44%，成交量 5.43 億股、仍為二十日均量約 1.22 倍；外資淨賣超約 8.00 萬張，9/23–24 合計淨賣超約 23.39 萬張。', impact: '原 36.6 元目標已達的狀態不變；相較前日縮量一天尚不足以證明整理完成，新部位繼續等待守住突破區及重新轉強。', sources: ['S14', 'S31'] },
  { date: '2026-09-25', label: '社群待查', title: 'Threads 出現鼎元訂單與 Intel 供應鏈說法', detail: '單一作者兩篇連續貼文將鼎元既有 PD 訂單能見度、友達 Micro LED CPO 及 Intel 關聯串在一起；公開資料目前只支持 PD 產品開發與 CPO 驗證。', impact: '提升核對鼎元法說、具名客戶與 AUO CPO 試產的優先級；不增加訂單確認數，也不改基本 EPS。', sources: ['S36', 'S37', 'S38'] },
] as const;

export const auoTransformationMilestones = [
  { stage: '技術展示', state: '已發生', evidence: 'Micro LED CPO 模組與 GCS 展示', valuation: '證明研發方向，仍不計入 EPS', falsifier: '可靠度、良率或整合能力無法跨過驗證' },
  { stage: '客戶驗證', state: '待確認', evidence: '具名客戶、樣品規格、驗證節點', valuation: '可建立時程與成功條件，仍不等於量產收入', falsifier: '合作方否認、驗證延後或技術路線改變' },
  { stage: '設計導入／試產', state: '尚無證據', evidence: 'design win、試產線、資本支出與產能', valuation: '開始估產能、良率、ASP 與折舊', falsifier: '只有展會樣品，沒有客戶承諾' },
  { stage: '量產貢獻', state: '尚無證據', evidence: '出貨、營收、毛利與客戶集中度', valuation: '才納入基本或樂觀 EPS', falsifier: '收入低於資本成本或毛利不具持續性' },
] as const;

export const auoPeerComparison = [
  { company: '友達', role: '面板＋車用 HMI／系統＋場域方案', signal: '2026Q2 Mobility 營益率 3.8%、Vertical 5.6%，Display -3.2%', implication: '轉型事業已能賺錢，但仍不足以抵銷顯示循環與總部成本。' },
  { company: 'LG Display', role: '高階 OLED 顯示', signal: '2026 上半年恢復營業利益，但 Q2 仍受一次性人力費用拖累', implication: '高值化能改善結構，轉型期仍伴隨巨額重整與資本負擔。' },
  { company: '京東方／TCL 華星', role: '車用顯示及先進封裝潛在競爭者', signal: '中國供應商擴大車載出貨；京東方亦與康寧合作並設 Micro LED 光互連／玻璃載板 CPO 專案組，尚未量產', implication: '友達不能只靠「車用成長」提高毛利，也不能假設其 CPO／GCS 展示具有獨占性；須以設計導入、良率及系統整合證明可得份額。' },
  { company: 'Visteon', role: '座艙電子與域控制器', signal: '2026Q2 調整後 EBITDA margin 12.1%、新訂單約 20 億美元', implication: '系統廠的獲利標尺遠高於單一面板；BHTC 的驗收、軟體與整機內容才是估值提升關鍵。' },
  { company: '群創', role: '台灣面板本地對照', signal: '同受面板景氣、稼動率與資產價值影響', implication: '若友達 P/B 長期高於本地同業，必須由非顯示事業的持續 ROE 支撐。' },
];

export const auoGrowthDrivers = [
  {
    title: 'BHTC 與 Mobility：由單片面板走向 HMI 系統',
    evidence: 'BHTC 自 2024 年 4 月納入合併；2026Q2 Mobility 占營收 29%，單季營業利益 7.68 億元、營益率 3.8%。',
    transmission: '若 HMI、曲面顯示、座艙電子的單車內容與專案量產增加，收入能較消費面板穩定，毛利也有機會高於純面板。',
    timing: '車廠專案需驗證與量產，主要看 2026H2–2027 的新專案爬坡，不能把設計導入當成當期營收。',
    financial: '基本情境把 Mobility 2027 年營收年增約 5%，營益率由 2026Q2 的 3.8%逐季升至 4.8%。',
    falsifier: '中國車用顯示快速擴產、專案延後或價格年降幅高於內容成長，使 Mobility 毛利停在 3%附近。',
    sources: ['S1', 'S5', 'S17', 'S20'],
  },
  {
    title: 'Vertical Solutions：小基期、高毛利，但要防併購口徑錯覺',
    evidence: '2026Q2 Vertical 占營收 19%，營業利益 7.45 億元、營益率 5.6%；凌華自 2025 年 6 月底納入合併。',
    transmission: '醫療、零售、教育與企業場域若同時銷售硬體、軟體及服務，可改善收入可見度與資本報酬。',
    timing: '凌華的同比增長在合併滿一年後才較能看出內生成長；短期營收增加不能全算成需求擴張。',
    financial: '基本情境假設 2027 年營收年增中個位數，營益率由約 6%緩升至 6.5%，沒有套用軟體公司的倍數。',
    falsifier: '排除併購後營收不增、專案型收入波動，或整合費用讓營益率回落到 5%以下。',
    sources: ['S1', 'S3', 'S10'],
  },
  {
    title: 'Display：仍是損益轉折的最大槓桿',
    evidence: '2026Q2 Display 仍占 48%營收，營業虧損 10.85 億元、營益率 -3.2%；公司指引第三季小幅下滑。',
    transmission: '價格、稼動率與產品組合的微小變化，會在高固定成本下放大成營業利益；因此總體獲利仍不能只看轉型營收。',
    timing: '面板報價與品牌拉貨通常在一至兩季反映，2026Q4 筆電需求較弱，較明顯改善要等 2027 的供需紀律。',
    financial: '基本情境僅讓 Display 營益率從負值走到 2027H2 接近損平；樂觀情境才給 2 個百分點以上改善。',
    falsifier: '新供給、補貼拉貨透支或稼動率回升過快，再次壓低價格；這會同時打掉 EPS 與合理 P/B。',
    sources: ['S1', 'S16', 'S19'],
  },
  {
    title: 'Micro LED CPO、GCS 與 Intel 傳聞：市場先重估，財務後驗證',
    evidence: '友達 8/31 已公開 Micro LED CPO 系統模組與康寧 GCS 階段性成果；9/20 起出現 Intel 洽談傳聞，但尚無雙方公告、訂單或量產時程。',
    transmission: '技術展示先提高轉型可行性，具名客戶驗證可提高商業化機率；只有在 design win、試產與單位經濟可核對後，才會傳到營收、毛利與 EPS。',
    timing: '2026 年屬展示與傳聞查證期。若後續揭露驗證、試產與產能，主要財務影響更可能落在 2028–2029，而非直接塞進 2027。',
    financial: '2027 基本情境仍為零貢獻；頁面另以現價反推與 2029 EPS 敏感度呈現市場期待，不把未確認合作偽裝成獲利。',
    falsifier: 'Intel／友達否認、客戶驗證延後、良率或可靠度不過關，京東方等同路線廠商先取得設計導入，或資本支出先發生而收入未跟上。',
    sources: ['S12', 'S23', 'S24', 'S25', 'S27', 'S33'],
  },
];

export const auoCatalysts = [
  { id: 'cpo', title: 'Micro LED CPO', stage: '技術展示', evidence: '友達公開模組與集團分工；未揭露客戶驗證、設計導入或訂單。京東方亦成立同方向專案組，但尚未量產。', nextProof: '具名客戶、光互連規格與可靠度驗證；核對鼎元既有 PD 訂單是否真的轉成友達 CPO 設計導入，之後才是試產、良率及量產出貨。', timing: '若成真，財務貢獻更可能是 2028–2029 年研究情境；非公司指引。', falsifier: '客戶採 LRO、NPO、京東方等替代供應商或其他光源；驗證、散熱、維修與良率不符經濟性。', sources: ['S23', 'S27', 'S29', 'S33', 'S36', 'S37', 'S38'] },
  { id: 'gcs', title: '玻璃核心基板／RDL', stage: '技術展示與可靠度驗證', evidence: '友達與康寧展示 GCS；官方明說 TGV、金屬化與可靠度仍在分階段推進。', nextProof: '客戶規格、TGV 良率、基板尺寸、每片售價、材料與製程分潤。', timing: '驗證與產線建置跨年；不得直接放進 2027 基本 EPS。', falsifier: 'Intel 已公告與藍思科技合作；京東方也與康寧合作，不能假設友達獨占其玻璃生態系。', sources: ['S23', 'S28', 'S33'] },
  { id: 'intel', title: 'Intel 合作說法', stage: '媒體傳聞', evidence: '9/20–21 公開報導與轉載；尚無友達、Intel 聯名公告或可核對採購合約。', nextProof: '雙方確認合作範圍、驗證節點、design win、採購承諾及歸屬友達的收入。', timing: '傳聞可即時改變交易價格；財報時間取決於驗證及量產，未知。', falsifier: '合作否認、合作範圍僅為樣品、選用其他玻璃或光互連供應商。', sources: ['S24', 'S25', 'S26', 'S28'] },
] as const;

export const auoCommercializationInputs: Record<'cpo' | 'gcs', CommercializationInputs> = {
  cpo: { shippedCapacityUnits: null, utilization: null, yieldRate: null, averageSellingPriceMillion: null, grossMargin: null, incrementalOpexMillion: null, depreciationMillion: null, taxRate: 0.2, attributableShare: null, intercompanyRevenueMillion: null, dilutedSharesMillion: AUO_DILUTED_SHARES_MILLION },
  gcs: { shippedCapacityUnits: null, utilization: null, yieldRate: null, averageSellingPriceMillion: null, grossMargin: null, incrementalOpexMillion: null, depreciationMillion: null, taxRate: 0.2, attributableShare: null, intercompanyRevenueMillion: null, dilutedSharesMillion: AUO_DILUTED_SHARES_MILLION },
};

export const auoBackground = [
  { text: '友達從大尺寸 TFT-LCD 起家。面板標準化與大規模產能使售價受邊際供需、稼動率及品牌庫存影響，因此高固定成本會放大景氣循環。2026 年組織以 Display、Mobility、Vertical 三支柱運作；Display 仍是最大收入來源。', sources: ['S1', 'S10'] },
  { text: '收購 BHTC 後，車用事業由顯示模組延伸至 HMI 控制與整合，自 2024 年 4 月納入合併。凌華自 2025 年 6 月底納入合併，使 Vertical 的年增率也含合併口徑變化；不能把帳面增長全當內生訂單。', sources: ['S3', 'S5', 'S10'] },
  { text: '2024Q4 曾在營業虧損時因資產處分而出現歸屬母公司獲利，說明報表 EPS 與持續營運不同。本研究並列兩者，將現金流、分部營益與普通股 ROE 作為估值檢驗。', sources: ['S2', 'S6'] },
] as const;

export const auoArticleSections = [
  {
    id: 'question', number: '01', title: '市場此刻在買什麼：技術位置，還是已存在的訂單？',
    paragraphs: [
      { text: '友達的股價先由 9/18 的 30.35 元衝上 9/22 的 36.65 元，接著連兩日回落，9/24 收在 34.20 元，較高點低 6.68%，仍高於起漲前 12.69%。這段行情交易的是「傳統面板公司可能切入 AI 互連與先進封裝」的重新定位，並非已公告的 Intel 大單。價格是真實成交；它顯示資金曾願意承擔這種預期，卻無法單獨證明量產、單價或淨利。研究必須將價格訊號與營運證據同時保留。', sources: ['S14', 'S23', 'S24'] },
      { text: '這個故事並非全由傳聞憑空生成。8/31 友達先公開 Micro LED 光互連模組及與康寧合作的玻璃核心基板展示，9/20 起的媒體報導再把 Intel 放進市場想像。前者是可查的研發與生態系位置；後者仍是待證假說。把兩者混成「Intel 已下單」會讓 EPS 假設過早跳級，也會讓讀者錯過真正有價值的追蹤節點：客戶驗證、試產規格、產能、良率及歸屬友達的收入。', sources: ['S23', 'S24', 'S25'] },
      { text: '研究的主判斷是：既有營運的修復可算，但目前股價還需要比既有事業更強的獲利或更久遠的商業化期待。2026Q2 Mobility 與 Vertical 合計約占收入 48%，已有正營益；Display 同樣占約 48%且仍虧損。下一個 6–18 個月，先看顯示虧損能否收斂、車用專案能否保住利潤；新技術只在可核對的商業化資料出現時移入基本財測。短線動能另有自己的交易劇本，不能拿它反推基本面已被證實。', sources: ['S1', 'S14'] },
    ],
  },
  {
    id: 'industry', number: '02', title: '產業瓶頸與友達的位置：CPO 和玻璃基板各解一個問題',
    paragraphs: [
      { text: 'AI 叢集擴大後，晶片之間及機櫃內的傳輸距離、功耗、散熱與訊號完整性成為瓶頸。把光傳輸做得更靠近運算晶片，是 CPO 一類方案的目的，但「CPO」不是單一設計。可插拔光模組仍在升速，LRO、NPO、不同光源和封裝位置也在競爭。Omdia 因而預期市場更可能按距離、維修與成本分化，而非一種架構通吃；本研究不假設友達的技術展示就取得整個 AI 光互連市場。', sources: ['S27', 'S29'] },
      { text: '友達提出的是十公尺左右短距離的 Micro LED 並行光路。公開分工中，友達負責巨量轉移、RDL 封裝、光學耦合與系統架構，集團富采、鼎元與達興材料分別提供發射、接收與材料，康寧參與光纖方案。這使友達卡在整合與製造的中間段，不只是把一片面板賣給資料中心；但它還不是晶片設計、整個交換系統或已取得的客戶訂單。要形成可持續毛利，友達必須證明模組在功耗、誤碼、可靠度和維修成本上勝過替代方案，且量產良率足以覆蓋折舊。', sources: ['S23', 'S29'] },
      { text: '玻璃核心基板處理的是大型高密度封裝的翹曲、尺寸穩定、訊號損耗及互連密度。康寧提供半導體級玻璃，友達展示 RDL 與大面積玻璃加工；官方同時表明 TGV、孔洞金屬化及可靠度仍分階段驗證。因此材料成功不等於友達取得全部基板價值，康寧供材、友達加工、最終封裝廠與客戶的價值分配都要拆開。Intel 已正式宣布與藍思科技合作探索玻璃基板製程；京東方的原始投資者紀錄也確認其與康寧合作並成立 Micro LED 光互連及玻璃載板 CPO 專案組，雖然其新業務同樣未量產。這使友達的遠期可得份額與倍數更需要客戶設計導入證據，不能以「Intel 需要玻璃」或「康寧合作」推成友達獨占供貨。', sources: ['S23', 'S28', 'S33'] },
      { text: '原有面板業務也仍決定短期獲利。TrendForce 觀察 9 月主要面板價格大致持平，筆電面板需求卻有下修風險；價格不跌並不代表高稼動率或正營益。Omdia 預估中國廠在 2026 下半年車用顯示出貨占比升至約 65%，因此車用成長的收入假設仍要扣除價格競爭。BHTC 若能增加控制器、軟體及整機內容，才可能比單片車用面板保住較高利潤；這也是本研究只讓 Mobility 利潤率緩升的原因。', sources: ['S1', 'S16', 'S17', 'S20'] },
      { text: `還有一項短期成本反證。康寧已公告 2026Q4 起調高日圓計價的顯示玻璃基板價格至少 15%；這是顯示面板的材料訊號，不是友達與康寧合作的半導體玻璃核心基板報價。友達適用的採購幣別、數量、長約及能否轉嫁給客戶仍未公開，因此基本情境暫不改 Display 營益率。作為可重算的壓力測試，若 2027 年淨材料成本增加達 Display 預估營收的 1%，其他條件不變，稅後歸屬 EPS 約減少 ${auoDisplayInputCostSensitivity.afterTaxEpsImpact.toFixed(2)} 元；這個 1% 是測試門檻，不是已估出的實際成本。下一次法說應核對採購暴露、售價調整與毛利率。`, sources: ['S39', 'S1', 'S2'] },
    ],
  },
  {
    id: 'rumor', number: '03', title: 'Intel、客戶與訂單：把每一步證據放回正確階段',
    paragraphs: [
      { text: '9/20–21 的 Intel 說法目前能回溯到公開報導與轉載；PTT 再傳同一篇報導，只增加市場關注，不能當作第二個獨立確認。友達 8/31 公告能確認 CPO 與 GCS 展示及合作生態系，但沒有具名 Intel 客戶、採購金額、排程或量產承諾。Intel 自身的光學 I/O 研究與玻璃封裝路線，說明題材在技術上有交集，仍不能補上缺失的商務證據。', sources: ['S23', 'S24', 'S25', 'S26', 'S27', 'S28'] },
      { text: '9/25 又出現單一 Threads 作者把「鼎元訂單能見度至 2028」延伸成「美系 CSP、Intel 供應鏈與友達 CPO 量產」的說法。這值得追查，不值得刪掉；但同一作者的主帖與續帖仍是一個根源。鼎元官網可確認高速 PD、Micro-PD 開發，較早新聞則把既有 PD 訂單與友達／富采 Micro LED CPO 的研發驗證分開敘述，未能證實貼文所稱的新 Intel／CSP 訂單、每月產能數字或友達可分得的營收。下一步須核對鼎元正式法說、具名客戶或採購文件，以及友達揭露的設計導入與量產節點；此線索目前只提高查證優先序，不改 2027 基本 EPS。', sources: ['S36', 'S37', 'S38', 'S23'] },
      { text: '對 CPO，第一步應見到特定距離與傳輸規格的客戶驗證；第二步是設計導入與試產；第三步才有產能利用率、良率及售價。對 GCS，還需要 TGV 孔洞、金屬化、翹曲及可靠度的客戶認證。合作可能只是一段製程、一項共同開發，或僅供樣品；範圍不同，友達可認列的營收和毛利差很多。研究表格逐項列「現在到哪一步」「下一個可驗證事實」「最強反證」，讓傳聞留在研究清單，但不假裝它已成收入。', sources: ['S23', 'S28'] },
      { text: '如果 Intel 或其他客戶確認設計導入，會先降低「能不能用」的不確定性，不會當天就形成下一季 EPS。若確認量產規格、產線資本支出與出貨起點，才可從出貨量及單價估 2028–2029 收入；若合作遭否認或同一需求由藍思、其他 CPO 光路滿足，轉型情境的成功條件就收緊。這些結果需要逐次更新，不以股價漲跌倒推消息真假。', sources: ['S23', 'S28', 'S29'] },
    ],
  },
  {
    id: 'growth', number: '04', title: '新業務何時變成淨利：既有三事業與條件式商業化',
    paragraphs: [
      { text: '現階段可重算的是既有三事業。Mobility 依車廠專案爬坡及單車內容預估營收，Vertical 要剔除凌華合併口徑才判斷內生需求，Display 以報價、稼動率及產品組合決定虧損收斂。模型從分部收入乘營益率，加回其他項與總部費用，再列經常性業外、20%稅率、非控制權益和稀釋股數；未指定資產處分、匯兌與減損為零。這個順序讓任何利多都必須指出究竟改善了哪一項，而非只把公司總 EPS 加上故事。', sources: ['S1', 'S2', 'S3'] },
      { text: 'Mobility 的正營益說明收購 BHTC 不是空泛口號，卻還未證明車用系統獲利能一路上升。中國車載面板供給擴張會壓售價，車廠也可能要求年度降價；只有 HMI 控制、軟體與驗收服務增加，才能抵銷。Visteon 的新訂單與系統利潤率提供較高階對照，但友達的業務組合不同，不能直接套它的倍數。Vertical 的設備與專案可能更有價值，卻要防止合併凌華後的表面年增掩蓋現金流與內生成長不足。', sources: ['S3', 'S17', 'S20'] },
      { text: 'CPO 和 GCS 若進入產線，應從可出貨產能、利用率、良率與平均售價算對外收入，再扣集團內部交易，按毛利減新增研發、銷管與折舊，扣稅及少數股權後才得到歸屬友達普通股的 EPS。富采、鼎元、達興與康寧在同一供應鏈，不可把每家的銷售重複加進友達。現在尚缺具名訂單、產能、良率、售價、資本支出及利益分配，模型刻意顯示缺口；這代表「商業化未定價」，不是零價值，也不是可以任意填一個高目標價。', sources: ['S2', 'S23'] },
      { text: '若 2027 年三事業利潤按模型緩升，市場可先看到正常化 EPS 改善；若新技術需等 2028–2029 才商業化，應用那一年的獲利和折現，而非偷放進 2027 年。更慢的情況是試產遲延但資本支出和折舊先到，會拉低而非增加近期 ROE。每季必須以管理層指引、專案量產與現金流重新校正。', sources: ['S1', 'S23', 'S29'] },
    ],
  },
  {
    id: 'valuation', number: '05', title: '現價要多少成果才合理：先反推，再談倍數',
    paragraphs: [
      { text: '既有營運的保守、基本和樂觀情境來自同一套分部假設，而非在最後任意填 EPS。保守情境若接近或低於損平，P/E 無意義，只看資產與現金流；基本情境以顯示虧損緩解、兩個新事業維持小幅增長；樂觀情境再加較好的產品組合與分部利潤率。2026 已公告上半年與尚未公布的季度分開；表中的報表 EPS 是尚未加入待認列資產處分的基準預測，正常化 EPS 則始終排除該類一次性項目。完整表格收在文末供重算。', sources: ['S1', 'S2', 'S6', 'S34', 'S35'] },
      { text: `另有一個不能藏在「未指定一次性項目為零」後面的已公告事件：友達 7/28 與 7/30 分別公告出售華亞及高雄 C5E 廠，兩筆預計處分利益合計 ${(auoAssetDisposalSensitivity.expectedGainMillion / 100).toFixed(1)} 億元，公告稱已扣交易費用與預估稅費。單純以 ${AUO_DILUTED_SHARES_MILLION.toLocaleString('en-US')} 百萬股除，若全數歸屬普通股，算術上約每股 ${auoAssetDisposalSensitivity.perShareIfFullyAttributable.toFixed(2)} 元；這不是已認列 EPS，也不是 2027 年預測，交割、最終利益、歸屬及認列年度仍須核對。處分會使報表獲利與淨值改變，卻不會讓面板或 CPO 的持續利潤同步增加，因此不可把這筆利益再乘 20／24 倍，或在 P/E 與 P/B 交叉估值中重複計價。`, sources: ['S34', 'S35', 'S2'] },
      { text: '舊研究使用的 20／24 倍不是市場共識，也沒有足夠同業校準可稱「合理倍數」。對低 ROE、資本密集的 Display 適用這樣的 P/E 尤其需要證明獲利能持續。本版將倍數當成明示的檢驗座標，並保留 P/B 與普通股 ROE 交叉看：股價超過歷史 P/B 樣本區間，可以是新業務期權，也可能是短期資金追題材；歷史 P75 從來不是價格上限。任何正式提高倍數的理由，應同時見到更高的持續營益率和資本報酬。', sources: ['S1', 'S2', 'S22'] },
      { text: '以 9/24 收盤 34.20 元反推，20 倍 P/E 要求 1.71 元 EPS，24 倍要求約 1.43 元，兩者都高於現有基本情境的 2027 正常化 EPS。差額若只由新技術填補，就需要在既有業務之外產生可觀的歸屬普通股淨利；本文以 5%、10%、15%「稅後且歸屬友達」增量利潤率展示所需新增對外營收。這是反向門檻，未對 Intel 或 CPO 宣稱訂單規模；若需要比可核對市場容量更大的收入，便應降低倍數或價格假設。', sources: ['S1', 'S14', 'S23'] },
      { text: '遠期 2029 年試算另列年份與折現率。若量產證據始終缺席，轉型情境維持未量化，股價高於某個模型價只稱「模型差額」，不冒充市場真正付了多少轉型溢價。若出現可核對產能、良率、單價及歸屬收入，才把條件式商業化換成收入橋接；若被否認或延期，將該分支撤回並增加費用或折舊的下行情境。這比把傳聞直接乘高本益比更能回答目前的 34.20 元究竟要求什麼。', sources: ['S2', 'S14', 'S23', 'S24', 'S28'] },
    ],
  },
  {
    id: 'entry', number: '06', title: '現在能否進場：舊突破已結束，新劇本要重新形成',
    paragraphs: [
      { text: '9/19 保存的規則是收盤站上 32.2 元且成交量至少達當時二十日均量的 1.5 倍。9/21 條件觸發，9/22 價格碰觸 36.6 元原量度目標。這說明當時動能判斷有用，也說明舊劇本已到終點；9/23 回落不能把「已碰目標」改成失敗，之後也不該提高原目標來合理化追價。觸價只代表圖形目標到達，不代表任何人能以該價成交或獲利。', sources: ['S14'] },
      { text: '9/23 的高成交量與長上影代表高檔換手；9/24 成交量降到 5.43 億股，收盤再跌至 34.20 元，但仍在原 32.2 元突破區上方。相較前日雖然縮量，量比仍約 1.22 倍；收盤略高於五日線，MACD 尚為正值，RSI 回落但未失去中期強勢，ATR 顯示單日波動仍大。這些只代表趨勢尚未完全破壞，不能當成整理完成或新買點。短期可觀察兩種新條件：回測舊突破區時量縮、守住後重新站回短均線；或形成新的區間高點，再以完整交易日收盤及量能確認。兩者若未發生就是等待；若跳空越過觸發價，也須看實際可成交價格，報酬風險比不能沿用舊門檻。', sources: ['S14'] },
      { text: '均線、MACD、RSI 與 ATR 在下方由同一批交易所日資料計算，分別描述趨勢、動能、強弱與波動。9/18 至 9/24 的大盤相對報酬與三大法人買賣超也取自證交所；外資 9/21–22 合計淨買超約 48.12 萬張，9/23–24 合計淨賣超約 23.39 萬張。這是資金迅速換手的反證，並非 Intel 訂單真假已獲證明。資料過期時不產生新進場價位。若收盤失守原突破區、量能惡化，或合作假說被否認，短線風險與中期估值須分開重評。', sources: ['S14', 'S24', 'S30', 'S31'] },
    ],
  },
  {
    id: 'monitor', number: '07', title: '下一個可改變結論的訊號',
    paragraphs: [
      { text: '每月核對營收與面板報價，不能把單月回升當成轉型成功；再看終端拉貨、存貨及應收是否同步改善。每季法說比較 Mobility、Vertical、Display 的營收、營益率及合併營業現金流，尤其要確認 Display 虧損是否真的縮小。若正向分部繼續成長，合併營益仍不上升，需查總部成本、併購整合及顯示價格，而不是直接提高 EPS。', sources: ['S1', 'S8', 'S9', 'S16'] },
      { text: '事件更新要記錄發現時間與原始根源。Intel 題材首先等雙方正式說明，其次等具名客戶、驗證規格、design win、試產與量產訂單；同一篇新聞被轉十次仍只有一個來源根源。合作若被否認、技術規格不符或延後，就降低相應情境；若量產資訊齊備，才把產能與單位經濟帶進估值。公開內容、未證傳聞、研究假設會用不同標籤呈現。', sources: ['S23', 'S24', 'S25', 'S26', 'S28'] },
      { text: '本文以 9/24 為最新完整交易日；9/25 與 9/28 為交易所休市日。當時可查的公司、產業、新聞資料仍無法保證涵蓋每個社群貼文。後續盤前、盤後更新應將來源失敗單列，而不是寫成沒有新消息。讀者只需先抓住兩個問題：新技術走到哪個商業化節點，以及相同股價所需的普通股獲利是否由本業逐季接近；若兩者都沒有進展，短線強勢不會自動提高中期價值。', sources: ['S1', 'S14', 'S23', 'S32'] },
    ],
  },
] as const;

export const auoMonitoringChecklist = [
  { cadence: '每月', metric: '合併營收＋面板報價', upgrade: '營收年增且報價／稼動率同步改善', downgrade: '營收由價格或合併口徑支撐，終端拉貨轉弱' },
  { cadence: '每季', metric: '三事業營益率', upgrade: 'Mobility >4%、Vertical ≥6%、Display 虧損連續收斂', downgrade: '兩個成長事業獲利率下滑或 Display 再低於 -3%' },
  { cadence: '每季', metric: '正常化 EPS／營業現金流', upgrade: '獲利來自本業且現金流跟上', downgrade: 'EPS 主要由處分、匯兌或其他一次性項目' },
  { cadence: '專案事件', metric: 'BHTC／新技術量產', upgrade: '具名客戶、SOP、訂單或產能可核對', downgrade: '只有展示、驗證或概念合作' },
  { cadence: '盤前／盤後', metric: '事件與技術狀態', upgrade: '新增獨立證據、客戶驗證或放量突破確認', downgrade: '來源失敗、合作否認、跌回突破區或缺少應有交易日' },
];

export const auoAssumptions = [
  { id: 'A1', label: '模型單位', value: '除 EPS／比率外均為新台幣百萬元', basis: '與公司法說簡報一致' },
  { id: 'A2', label: '稀釋股數', value: '7,547 百萬股', basis: '2026Q2 法說揭露加權平均股數；未假設庫藏股或增資' },
  { id: 'A3', label: '2026Q3 分部營收', value: 'Mobility 約持平、Vertical +3%、Display -5%', basis: '將公司定性指引量化，屬研究估計' },
  { id: 'A4', label: '2027 基本情境', value: 'Mobility／Vertical 中個位數成長，Display H2 接近損平', basis: '不是公司指引，依分部獲利與產業供需推估' },
  { id: 'A5', label: '一次性項目', value: '基準預測 0；已公告處分另列敏感度', basis: '華亞與高雄 C5E 廠預計處分利益合計 176.7 億元；交割、最終歸屬與認列年度未核定，不塞進特定年度的基準報表 EPS，也不灌入正常化 EPS' },
  { id: 'A6', label: '稅率與非控制權益', value: '正稅前利益 20%；每季非控制權益 1 億元', basis: '簡化假設，敏感度低於分部營益率；法說後更新' },
  { id: 'A7', label: '普通股權益橋接', value: '2026Q2 普通股權益＋未來五季正常化淨利－股利＋資本／OCI', basis: '股利與資本／OCI 在三情境均明確假設為 0；這是模型假設，不是歷史實績，有公告或可核對證據後重算' },
  { id: 'A8', label: '旺宏格式核對', value: '沿用已找回的章節要求，原 PDF 尚未重新逐頁核對', basis: '原檔仍為 iCloud 佔位，沒有用舊 seed 數字代替' },
  { id: 'A9', label: '歷史 P/B 錨點', value: '60 個月底觀測的第 25／50／75 百分位為 0.70／0.77／0.85 倍', basis: '每筆由 TWSE 同日收盤、P/B 與當時採用財報季別核對；少於 48 個月即停止估值' },
  { id: 'A10', label: '轉型敏感度', value: '2029 年末 EPS × 倍數後，以 12%及約 3.25 年折現回研究日', basis: '只用來讀懂現價要求，不是公司指引或目標價；待客戶、產能、良率與毛利證據後重建' },
];
