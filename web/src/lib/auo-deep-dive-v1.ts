import type { ForecastQuarterInput, ScenarioAdjustment } from './auo-deep-dive-model';

export const AUO_RESEARCH_VERSION = 'auo-2409-2026-09-19.v1';
export const AUO_AS_OF = '2026-09-18';
export const AUO_PRICE = 30.35;
export const AUO_DILUTED_SHARES_MILLION = 7_547;
export const AUO_BOOK_VALUE_PER_SHARE = 20.46;

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
    fairPb: 0.75,
  },
  base: {
    label: '基本',
    revenueMultiplier: { mobility: 1, vertical: 1, display: 1, other: 1 },
    marginDelta: { mobility: 0, vertical: 0, display: 0, other: 0 },
    fairPe: 20,
    fairPb: 1.0,
  },
  bull: {
    label: '樂觀',
    revenueMultiplier: { mobility: 1.06, vertical: 1.07, display: 1.06, other: 1.04 },
    marginDelta: { mobility: 0.020, vertical: 0.020, display: 0.025, other: 0.012 },
    fairPe: 24,
    fairPb: 1.35,
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
    title: 'Micro LED、CPO 與新技術：保留選擇權，不灌入基本情境',
    evidence: '公司已展示 Micro LED 與 CPO／GCS 技術，但公開資料尚不足以建立可驗證的訂單、收入與毛利時間表。',
    transmission: '若客戶驗證後形成量產，可提高高階顯示或先進封裝相關收入，並改變市場對公司技術定位。',
    timing: '目前歸類為研發／驗證，待量產客戶、產能、單價與毛利揭露後才進模型。',
    financial: '基本與保守情境均為零；樂觀情境也只透過整體組合改善反映，沒有單列夢想收入。',
    falsifier: '展示停留在樣品、客戶驗證延後，或資本支出先發生而收入未跟上。',
    sources: ['S12', 'S13'],
  },
];

export const auoArticleSections = [
  {
    id: 'question', number: '01', title: '核心投資問題：30.35 元交易的是轉型成功，不只是面板回溫',
    paragraphs: [
      '友達現在的市場敘事有兩層。第一層是熟悉的面板循環：供給紀律、稼動率與報價回穩，讓巨額固定成本的虧損縮小。第二層是估值重估：BHTC 車用人機介面、智慧座艙與垂直場域方案，能把公司由純面板製造商變成較穩定的系統與方案供應商。股價 30.35 元、P/B 約 1.48 倍，已高於帳面價值甚多；所以問題不是「最壞是否過去」，而是非顯示事業能否持續賺錢，並快到足以支撐市場已支付的溢價。',
      '本研究同意轉型已經進入財報：Mobility 與 Vertical 在 2026Q2 合計占收入 48%，兩者都呈現正營業利益。不同意的是把營收占比直接等同轉型完成。同期 Display 也占 48%，營益率 -3.2%，三大事業利益加總後仍要負擔總部與其他成本；合併營益率只有 0.3%。在 6–18 個月視角，估值的核心是「Display 何時不再吞掉轉型成果」以及「Mobility／Vertical 能否在中國車載供應擴張下繼續擴大利潤」。',
      '我們的基本情境不是崩壞，而是改善速度比股價隱含期待慢。2027 年正常化 EPS 即使逐步回升，現價仍需要約 1.3–1.7 元 EPS 才能在 18–24 倍區間成立。這代表市場要求歸屬普通股淨利約 98–128 億元，遠高於 2026 上半年約 2 億元，且必須主要來自可重複營運，而不是處分或匯兌。因此中期評價偏保守；短線價格趨勢偏多，兩個結論必須分開。',
    ], sources: ['S1', 'S2', 'S14'],
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
      'Micro LED、先進封裝與 CPO／GCS 目前更像技術選擇權。公司展示的技術能力具有策略價值，但沒有公開足夠的量產客戶、收入與毛利資料。本模型將它們放在追蹤清單，基本情境不計收入；等到客戶驗證、資本支出、量產時程與單位經濟可核對後才加入。這樣做會犧牲部分想像，卻避免把研發新聞當成已實現獲利。',
    ], sources: ['S1', 'S10', 'S11', 'S12', 'S13', 'S20'],
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
    id: 'valuation', number: '06', title: '財務預估與估值：現價需要的獲利，比基本情境快兩步',
    paragraphs: [
      '模型由 2026Q2 已揭露的分部組成與營益率出發，下一個未公布季度遵循公司指引：Mobility 營收約持平、Vertical 低個位數增長、Display 小幅下降。2027 年的基本情境讓 Mobility 與 Vertical 維持中個位數增長，Display 到下半年才接近損平。分部營業利益加總後，再扣公司與其他成本、加入經常性業外、20%稅率與非控制權益，得到歸屬普通股正常化淨利。未指定的一次性處分、匯兌與減損一律為零。',
      'P/E 在接近損平時非常敏感：EPS 從 0.3 元變成 0.6 元，倍數會直接減半，卻不代表企業價值減半。因此保守情境 EPS 為負或接近零時標示不適用；基本與樂觀情境才用 20 倍與 24 倍檢查成長能否支撐現價。同時以普通股權益推得每股淨值 20.46 元，套用 0.75、1.0、1.35 倍 P/B。參考價以 P/B 為主要權重，因為友達仍有大量循環資產與不穩定 EPS；P/E 是驗證轉型獲利的第二把尺。',
      '即使基本情境持續改善，估值仍落在現價以下；樂觀情境必須同時滿足 Display 明顯改善、Mobility／Vertical 成長且提利潤，才接近現價。反推更直觀：30.35 元若給 20 倍，需要 EPS 1.52 元、約 115 億元歸屬普通股淨利。以約 2,830 億元年營收計算，淨利率約 4.1%。這不是不可能，但相較 2026 上半年接近損平，代表市場已把一大段尚未發生的改善買進去。',
      '估值結論不是精確到小數點的目標價，而是條件區間。保守情境反映面板再轉弱與轉型利潤停滯；基本情境反映兩個新事業穩定貢獻、Display 緩慢損平；樂觀情境才包含三支柱同時上修。沒有可校準的歷史命中率，本研究不替三種情境填主觀機率，也不沿用舊版 16.55 元。',
    ], sources: ['S1', 'S2', 'S3'],
  },
  {
    id: 'entry', number: '07', title: '技術面與進場劇本：趨勢偏多，但條件未成立就等待',
    paragraphs: [
      '截至 2026 年 9 月 18 日，收盤 30.35 元，股價位於 MA5、20、60、120 與 240 日線之上，MACD 位於零軸上且柱體為正，顯示中短期動能偏多。另一方面，RSI 已進入偏熱區，過去二十日高點 32.2 元仍是上方供給；最新成交量雖高於二十日均量，但沒有同時完成突破。這不是低風險追價點。',
      '第一個劇本是回測承接：等價格回到 MA5–MA20 所形成的區間，成交量縮、日 K 不破關鍵支撐且重新站回短均線，再考慮分批。失效價由 MA20 減 1.5 倍 ATR 計算，不是人工指定。第二個劇本是放量突破：收盤越過二十日高點，成交量至少達二十日均量 1.5 倍，下一日不跌回突破區才算成立。目標先看六十日高點，再用區間量度；若報酬風險比低於約 1.5，不應為了「一定要有買點」硬做。',
      '第三個劇本是失敗：日收盤跌破失效價、MA20 轉下，或突破後兩日內跌回壓力下方，就取消波段假設。觀察期限為二十個交易日，超過期限由新資料重算。技術轉強只回答幾週到三個月的供需，不會把基本面合理價一起抬高；所以本頁可以同時顯示「中期估值缺乏安全邊際」與「短線趨勢偏多、等條件」。',
    ], sources: ['S14'],
  },
  {
    id: 'monitor', number: '08', title: '接下來追蹤什麼：能讓結論改變的五個數字',
    paragraphs: [
      '每月先看營收，但不要把單月反彈當作獲利。需要把月營收與面板報價、主要終端拉貨及存貨天數一起讀；若營收升而存貨與應收也升，品質較差。每季法說更新三事業營收占比與營益率，特別檢查 Mobility 是否維持 4%以上、Vertical 是否守住約 6%，以及 Display 是否按模型縮小虧損。',
      '車用追蹤 BHTC 新專案的 SOP、量產車款、單車內容與價格年降；垂直場域追蹤排除凌華合併後的內生成長與現金流；新技術只在公開量產客戶、產能及財務貢獻後納入。估值每季以最新股數、普通股權益與正常化 EPS 重算。若現價不變而 2027 EPS 走低，Forward P/E 只會更高；若 EPS 上修到 1.5 元以上且主要來自營業利益，才接近支持目前價格。',
      '技術資料只使用最新完整交易日，超過七天即標示過期並停用價位。基本面則在月營收、面板報價、法說或重大專案事件後更新。任何來源矛盾都保留並列，優先採公司財報與交易所資料；媒體、券商摘要與產業報告負責提出假說，不取代原始數字。',
    ], sources: ['S1', 'S8', 'S9', 'S14', 'S16', 'S17'],
  },
] as const;

export const auoMonitoringChecklist = [
  { cadence: '每月', metric: '合併營收＋面板報價', upgrade: '營收年增且報價／稼動率同步改善', downgrade: '營收由價格或合併口徑支撐，終端拉貨轉弱' },
  { cadence: '每季', metric: '三事業營益率', upgrade: 'Mobility >4%、Vertical ≥6%、Display 虧損連續收斂', downgrade: '兩個成長事業獲利率下滑或 Display 再低於 -3%' },
  { cadence: '每季', metric: '正常化 EPS／營業現金流', upgrade: '獲利來自本業且現金流跟上', downgrade: 'EPS 主要由處分、匯兌或其他一次性項目' },
  { cadence: '專案事件', metric: 'BHTC／新技術量產', upgrade: '具名客戶、SOP、訂單或產能可核對', downgrade: '只有展示、驗證或概念合作' },
  { cadence: '每日重算', metric: '技術觸發', upgrade: '回測承接或放量突破完整成立', downgrade: '跌破失效價、突破失敗或資料超過七天' },
];

export const auoAssumptions = [
  { id: 'A1', label: '模型單位', value: '除 EPS／比率外均為新台幣百萬元', basis: '與公司法說簡報一致' },
  { id: 'A2', label: '稀釋股數', value: '7,547 百萬股', basis: '2026Q2 法說揭露加權平均股數；未假設庫藏股或增資' },
  { id: 'A3', label: '2026Q3 分部營收', value: 'Mobility 約持平、Vertical +3%、Display -5%', basis: '將公司定性指引量化，屬研究估計' },
  { id: 'A4', label: '2027 基本情境', value: 'Mobility／Vertical 中個位數成長，Display H2 接近損平', basis: '不是公司指引，依分部獲利與產業供需推估' },
  { id: 'A5', label: '一次性項目', value: '未來季度預設 0', basis: '資產處分、匯兌、減損未具可預測性，不灌入正常化 EPS' },
  { id: 'A6', label: '稅率與非控制權益', value: '正稅前利益 20%；每季非控制權益 1 億元', basis: '簡化假設，敏感度低於分部營益率；法說後更新' },
  { id: 'A7', label: '估值權重', value: 'P/B 65%、P/E 35%', basis: 'EPS 接近損平且資產密集；P/E 作轉型獲利驗證' },
  { id: 'A8', label: '旺宏格式核對', value: '沿用已找回的章節要求，原 PDF 尚未重新逐頁核對', basis: '原檔仍為 iCloud 佔位，沒有用舊 seed 數字代替' },
];
