import pbHistory from '../data/auo-pb-history-v1.json' with { type: 'json' };
import { historicalPbQuartiles, type ForecastQuarterInput, type ScenarioAdjustment } from './auo-deep-dive-model.ts';

export const AUO_RESEARCH_VERSION = 'auo-2409-2026-09-22.v2';
export const AUO_AS_OF = '2026-09-22';
export const AUO_PRICE = 36.65;
export const AUO_DILUTED_SHARES_MILLION = 7_547;
export const AUO_BOOK_VALUE_PER_SHARE = 20.46;
export const AUO_COMMON_EQUITY_MILLION = 154_397.339;
export const AUO_ENDING_COMMON_SHARES_MILLION = 7_547.098972;
export const AUO_PB_HISTORY = historicalPbQuartiles(pbHistory, AUO_AS_OF);

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
  { id: 'S14', type: '官方市場資料', title: 'TWSE 友達日成交資訊', url: 'https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=20260901&stockNo=2409', date: '2026-09-18', supports: '最新完整交易日 OHLCV 與技術指標' },
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
] as const;

export const auoMarketEvents = [
  { date: '2026-08-31', label: '已確認', title: '友達公開 CPO／GCS 階段性成果', detail: '友達揭露 Micro LED CPO 系統模組、RDL、光學耦合及與康寧合作的玻璃核心基板；尚未揭露客戶訂單、量產收入與毛利。', impact: '這是轉型可行性的事前證據，應建立條件式重估情境，但不直接增加 2027 EPS。', sources: ['S23'] },
  { date: '2026-09-20', label: '市場傳聞', title: '公開報導出現 Intel 合作說法', detail: '目前可核對的公開報導稱 Intel 洽談合作；尚未找到雙方聯名公告、採購合約或量產時程。', impact: '提高市場對友達由面板廠切入先進封裝／光互連的期待，先改變事件風險與倍數討論。', sources: ['S24', 'S25'] },
  { date: '2026-09-21', label: '價格確認', title: '突破原 32.2 元門檻', detail: '收盤 33.35 元、成交量 8.23 億股，符合原先 9/19 放量突破條件。', impact: '原波段劇本由等待轉為觸發；不能事後把門檻上移後仍顯示等待。', sources: ['S14'] },
  { date: '2026-09-22', label: '目標到達', title: '收盤 36.65 元，到達原量度目標', detail: '兩個交易日由 30.35 元上漲 20.76%，原 36.6 元技術量度目標已到達。', impact: '追價的報酬風險比惡化；下一個判斷改為等待整理、查證事件與重新建立劇本。', sources: ['S14'] },
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
  { company: '京東方／TCL 華星', role: '大尺寸與車用顯示規模供應', signal: '中國供應商擴大車載出貨；TCL 車載業務高速增長且新線持續投入', implication: '友達不能只靠「車用成長」提高毛利，需證明系統整合與客戶黏著能抵抗價格競爭。' },
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
    falsifier: 'Intel／友達否認、客戶驗證延後、良率或可靠度不過關，或資本支出先發生而收入未跟上。',
    sources: ['S12', 'S23', 'S24', 'S25', 'S27'],
  },
];

export const auoArticleSections = [
  {
    id: 'question', number: '01', title: '核心投資問題：36.65 元正在交易轉型選擇權，還不是已證實獲利',
    paragraphs: [
      '友達現在的市場敘事有三層。第一層是面板循環；第二層是 BHTC 車用系統與垂直場域；第三層是 Micro LED CPO、玻璃核心基板與 Intel 合作傳聞帶來的技術定位重估。36.65 元是市場真實成交價，不是假的共識；但它也不是經公司確認的基本面合理價。研究的責任是拆出這個價格需要哪些營運與商業化條件，而不是拿舊模型直接否定市場。',
      '本研究同意轉型已經進入財報：Mobility 與 Vertical 在 2026Q2 合計占收入 48%，兩者都呈現正營業利益。不同意的是把營收占比直接等同轉型完成。同期 Display 也占 48%，營益率 -3.2%，三大事業利益加總後仍要負擔總部與其他成本；合併營益率只有 0.3%。在 6–18 個月視角，估值的核心是「Display 何時不再吞掉轉型成果」以及「Mobility／Vertical 能否在中國車載供應擴張下繼續擴大利潤」。',
      '傳統營運的 2027 樂觀情境約 EPS 1.37 元、24 倍約 32.9 元，仍低於 36.65 元。差額可以被解讀成市場替轉型選擇權、資產重估與資金動能付費。這不是把差額當泡沫，也不是直接承認 36.65 元合理；接下來要用具名客戶、驗證節點、試產、產能、良率與毛利逐步驗證。',
    ], sources: ['S1', 'S2', 'S14', 'S23', 'S24', 'S25'],
  },
  {
    id: 'history', number: '02', title: '公司如何走到今天：從產能競賽改成三支柱',
    paragraphs: [
      '傳統 TFT-LCD 的困難不是沒有需求，而是產品標準化、產能龐大且價格由邊際供需決定。當中國面板廠擴產、品牌庫存變動或終端換機走弱，售價下跌會直接穿透到高固定成本工廠。友達近年的方向，是減少只靠面板景氣決定獲利，將能力往 Mobility Solutions、Vertical Solutions 與更高階的 Display 延伸。2026 年 7 月組織再調整，把三大支柱與前瞻技術研究院的責任邊界講得更清楚。',
      'BHTC 是這條路最重要的外部成長。友達完成收購後，自 2024 年 4 月起把其結果納入合併，讓車用事業由面板往人機介面、控制與整合方案延伸。這同時造成閱讀財報的陷阱：2024 年後車用營收增加，部分是合併範圍改變，不全是原有業務自然成長。凌華自 2025 年 6 月底納入合併，也使 Vertical 的同比比較需要拆分併購與內生成長。',
      '資產調整則讓 EPS 與本業有時脫鉤。2024Q4 營業虧損 33.23 億元，歸屬母公司卻獲利 16.19 億元，公司明確提到資產處分利益。2025 全年四季合計營業虧損約 10.55 億元，歸屬母公司淨利卻約 68.43 億元，也提醒我們不能把報表 EPS 全部乘上本益比。這篇文章把報表 EPS 保留作會計結果，估值主要看不含未指定一次性收益的正常化 EPS，並用 P/B 做資產型循環公司的交叉檢查。',
    ], sources: ['S5', 'S6', 'S10', 'S21'],
  },
  {
    id: 'business', number: '03', title: '目前賣什麼、怎麼賺錢：三個事業其實是三種經濟模型',
    paragraphs: [
      'Display 包含電視、監視器、筆電及 LED 顯示等，收入受面板面積需求、平均售價、稼動率與產品組合影響。它仍是最大收入來源，也最吃產能利用率。2026Q2 的 48%收入占比與 -3.2%營益率說明：即使毛利率已由 Q1 的 11.9%回到 13.0%，傳統顯示仍未穩定跨過損平點。基本情境只假設 2027H2 接近損平，因為單季報價穩定不足以證明結構性改善。',
      'Mobility 的產品從中控、數位儀表、乘客顯示、抬頭與曲面顯示，延伸到 BHTC 的 HMI 控制與整合。它的價值在於車規認證、長產品週期、軟硬體整合與單車內容，而不只是尺寸更大的車用面板。2026Q2 占收入 29%、營益率 3.8%，已經是可驗證的正貢獻；但距離 Visteon 這類座艙系統商兩位數的調整後 EBITDA margin 仍有距離，顯示友達尚在組合升級途中。',
      'Vertical Solutions 涵蓋智慧零售、醫療、教育、企業、工業與公共顯示、能源服務，以及合併後的凌華。它在 2026Q2 占收入 19%、營益率 5.6%，是目前三支柱中利潤率最高的一塊。這類業務可能包含專案、設備、整合與服務，收入節奏不像面板按月平滑；估值不該直接套軟體倍數。研究上要看排除合併效果後的成長、重複收入占比、訂單轉收入與營益率，而不是只看「解決方案」名稱。',
      'Micro LED、先進封裝與 CPO／GCS 是技術選擇權，但已不能只寫成一行「研發中」。友達 8/31 已揭露其在巨量轉移、RDL、光學耦合、系統架構與玻璃加工的角色；Intel 傳聞則把市場問題推到「是否能成為 AI 互連與先進封裝供應鏈」。本研究保留其重估影響，同時要求四個里程碑：客戶驗證、design win／試產、產能與良率、量產收入與毛利。',
    ], sources: ['S1', 'S10', 'S11', 'S12', 'S23', 'S24', 'S27'],
  },
  {
    id: 'industry', number: '04', title: '產業與海外競爭：兩條戰線都沒有讓友達輕鬆過關',
    paragraphs: [
      '短期面板環境是「價格尚穩、需求轉弱」。TrendForce 在 2026 年 9 月初觀察主要 TV、Monitor 與 Notebook 面板價格大致持平，但 NB 第三季採購可能季減 15%–20%，第四季仍有下修風險。這與友達第三季 Display 小幅下滑的指引一致。對財務模型的含義是，不能用價格平穩就假設 Display 立即恢復正常利潤；若稼動率或產品組合不改善，固定成本仍會壓住營益率。',
      '車用也不是避風港。Omdia 預估中國面板廠的車用顯示出貨占比，會由 2026H1 的 59%升到 H2 的 65.2%。供給增加會壓縮單純顯示器件的價格與市占空間，因此本模型只讓 Mobility 營益率緩慢提升。友達若要高於這個假設，必須證明 BHTC 帶來的 HMI、控制、軟體與整合內容增加得比面板價格下降更快，並在量產專案中反映。',
      '同業給了兩種路徑。LG Display 聚焦 OLED、高階 IT 與遊戲顯示，顯示高值化可以改善結構，但重整與資本負擔仍會造成季度波動。TCL 華星則以規模、車載高速增長與持續新產能向前推進。前者提醒友達技術升級需要資本與時間，後者提醒供給競爭沒有消失。Visteon 的座艙系統獲利與約 20 億美元新訂單，則提供 Mobility 更高層次的比較：重點是系統訂單、軟體與專案執行，不是車用螢幕出貨片數本身。',
      '本地與資產面比較則應看群創與友達自身的歷史 P/B。兩者都受面板循環與重資產結構影響；友達可以因非顯示業務得到溢價，但溢價應由 ROE、自由現金流與獲利穩定性驗證。現價約 1.48 倍 P/B 已經先支付部分轉型成果，若 2027 年正常化 ROE 仍只有低個位數，這個溢價難以長期維持。',
    ], sources: ['S1', 'S16', 'S17', 'S18', 'S19', 'S20'],
  },
  {
    id: 'growth', number: '05', title: '未來成長與反證：每個故事都要能被推翻',
    paragraphs: [
      '基本情境把成長拆成三條可驗證路徑，而不是一次給公司一個總營收成長率。Mobility 看量產專案與單車內容；Vertical 看排除合併後的內生成長與利潤率；Display 看報價、稼動率與虧損收斂。每季更新時，若一個驅動的證據沒有出現，就應調低對應業務的營收或利潤率，不能以另一個題材補洞。',
      '最關鍵的反證是 Mobility 與 Vertical 明明成長，合併營業利益卻沒有同步改善。這可能代表 Display 再度惡化、整合成本過高，或新增收入的品質不如預期。另一個反證是月營收看似持穩，但現金流被存貨與應收帳款吃掉。2026Q2 存貨天數由去年同期 53 天升到 58 天，模型因此沒有假設需求改善會立刻轉成現金。',
      '八季實績也顯示單季 EPS 很容易被業外與處分扭曲。2024Q4 與 2025Q4 都出現營業虧損但歸屬母公司獲利的組合；相反地，2026Q2 營業利益只有 2.18 億元，歸屬淨利為 13.43 億元。若未來上修只來自一次性利益，合理倍數不應提高。只有分部營益率、正常化 EPS 與現金流一起上升，才足以把基本情境往樂觀情境移動。',
    ], sources: ['S1', 'S3', 'S5', 'S6'],
  },
  {
    id: 'valuation', number: '06', title: '財務預估與估值：傳統營運與轉型選擇權必須分開',
    paragraphs: [
      '模型由 2026Q2 已揭露的分部組成與營益率出發，下一個未公布季度遵循公司指引：Mobility 營收約持平、Vertical 低個位數增長、Display 小幅下降。2027 年的基本情境讓 Mobility 與 Vertical 維持中個位數增長，Display 到下半年才接近損平。分部營業利益加總後，再扣公司與其他成本、加入經常性業外、20%稅率與非控制權益，得到歸屬普通股正常化淨利。未指定的一次性處分、匯兌與減損一律為零。',
      'P/E 在接近損平時非常敏感，因此保守情境標示不適用；基本與樂觀情境用 20 倍與 24 倍檢查傳統營運。P/B 只作資產與 ROE 交叉檢查。60 個月資料的第 75 百分位是 0.85 倍，但最高曾到 1.65 倍；舊版把 P75 寫成「歷史上緣」是錯誤，本版明確更正，也不再用 P/B 分位數封住全部上行。',
      '36.65 元若給 20 倍，需要 EPS 1.83 元；若給 24 倍，需要 1.53 元。這比模型的 2027 基本 EPS 0.62 元與樂觀 EPS 1.37 元都高。若市場其實交易 2029 年成果，則必須把更遠期 EPS 折現，並在客戶、試產、產能與毛利資料出現後重建模型。本版先呈現敏感度，不替尚未確認的 Intel 合作填收入或成功率。',
      '因此本版沒有把 36.65 元硬改成新的基本目標價。傳統營運的情境值、P/B 資產交叉檢查與轉型敏感度分開呈現。市場價格可領先財報，但若後續只有轉載而沒有客戶驗證，選擇權會收縮；若出現 design win、量產規格與可核對的毛利，才有理由把轉型移入財務預估。',
    ], sources: ['S1', 'S2', 'S3', 'S22'],
  },
  {
    id: 'entry', number: '07', title: '技術面與進場劇本：原突破已成立且到達目標，現在不追價',
    paragraphs: [
      '9/19 研究所保存的突破門檻是收盤高於 32.2 元且成交量至少達當時二十日均量 1.5 倍。9/21 收盤 33.35 元、成交量 8.23 億股，條件成立；9/22 收盤 36.65 元並觸及原 36.6 元量度目標。舊頁面仍顯示等待，是狀態機沒有執行，而不是市場沒有給訊號。',
      '兩日上漲 20.76%後，原突破劇本的預期報酬已實現，不能把 36.6 元目標再改高來合理化追價。新部位等待兩種條件：價格整理後量縮守住突破區並重新轉強，或公司／供應鏈提出足以重建盈利的證據。若只剩傳聞擴散、量價背離或收盤跌回原突破區，事件交易的風險快速升高。',
      '短線強勢與中期估值可以同時成立。前者描述資金與預期，後者要求獲利兑现。頁面會保留原劇本的發布日、觸發日、確認日與目標到達日，不再每日重算門檻後永遠顯示「等待」。',
    ], sources: ['S14'],
  },
  {
    id: 'monitor', number: '08', title: '接下來追蹤什麼：能讓結論改變的五個數字',
    paragraphs: [
      '每月先看營收，但不要把單月反彈當作獲利。需要把月營收與面板報價、主要終端拉貨及存貨天數一起讀；若營收升而存貨與應收也升，品質較差。每季法說更新三事業營收占比與營益率，特別檢查 Mobility 是否維持 4%以上、Vertical 是否守住約 6%，以及 Display 是否按模型縮小虧損。',
      '車用追蹤 BHTC 新專案的 SOP、量產車款、單車內容與價格年降；垂直場域追蹤排除凌華合併後的內生成長與現金流；新技術只在公開量產客戶、產能及財務貢獻後納入。估值每季以最新股數、普通股權益與正常化 EPS 重算。若現價不變而 2027 EPS 走低，Forward P/E 只會更高；若 EPS 上修到 1.5 元以上且主要來自營業利益，才接近支持目前價格。',
      '技術資料使用最新完整交易日；缺少一個以上應有交易日就標示過期並停用新價位。市場事件每日盤前、盤後各搜尋一次，記錄成功來源與覆蓋缺口。任何來源矛盾都保留並列，優先採公司財報與交易所資料；媒體、券商與社群負責發現假說，不取代原始數字。',
    ], sources: ['S1', 'S8', 'S9', 'S14', 'S16', 'S17'],
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
  { id: 'A5', label: '一次性項目', value: '未來季度預設 0', basis: '資產處分、匯兌、減損未具可預測性，不灌入正常化 EPS' },
  { id: 'A6', label: '稅率與非控制權益', value: '正稅前利益 20%；每季非控制權益 1 億元', basis: '簡化假設，敏感度低於分部營益率；法說後更新' },
  { id: 'A7', label: '普通股權益橋接', value: '2026Q2 普通股權益＋未來五季正常化淨利－股利＋資本／OCI', basis: '股利與資本／OCI 在三情境均明確假設為 0；這是模型假設，不是歷史實績，有公告或可核對證據後重算' },
  { id: 'A8', label: '旺宏格式核對', value: '沿用已找回的章節要求，原 PDF 尚未重新逐頁核對', basis: '原檔仍為 iCloud 佔位，沒有用舊 seed 數字代替' },
  { id: 'A9', label: '歷史 P/B 錨點', value: '60 個月底觀測的第 25／50／75 百分位為 0.70／0.77／0.85 倍', basis: '每筆由 TWSE 同日收盤、P/B 與當時採用財報季別核對；少於 48 個月即停止估值' },
  { id: 'A10', label: '轉型敏感度', value: '2029 EPS × 倍數後，以 12%折現回研究日', basis: '只用來讀懂現價要求，不是公司指引或目標價；待客戶、產能、良率與毛利證據後重建' },
];
