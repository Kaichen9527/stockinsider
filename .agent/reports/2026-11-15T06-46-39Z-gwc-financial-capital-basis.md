# T07 環球晶正式 EPS、增資基準與 iXBRL 拒絕正本

11/15 在 Contabo 非 root 隔離環境取證，分析對象為 6488 的 2026 年第三季合併財報。證交所財報清單列示 `202603_6488_AI1.pdf`，2026-11-06 16:17:41 台北時間上傳，1,255,106 bytes；兩次取得的 SHA-256 一致。官方合併財報第 5、27、30 頁（PDF 頁序）分別載有獲利、增資及 EPS 股數。公司法說簡報也揭露單季 3.13、累計 15.00。PTT 11/03 和 11/05 兩篇標的線索以普通公開請求取得全文頁，原發布時間與本輪首次收集分開，兩篇都未被回填到先前的資料版本。[證交所財報清單](https://doc.twse.com.tw/server-java/t57sb01?step=1&kind=A&mtype=A&co_id=6488&year=115&colorchg=1) · [公司 11/03 法說簡報](https://www.sas-globalwafers.com/wp-content/uploads/2026/11/GWC_company-profile_20261103-CH.pdf#page=6) · [PTT 11/03](https://www.ptt.cc/bbs/Stock/M.1793703041.A.B9E.html) · [PTT 11/05](https://www.ptt.cc/bbs/Stock/M.1793855073.A.98B.html)

| 申報期間 | 歸母淨利（元） | 基本加權股數（仟股） | 稀釋加權股數（仟股） | 基本 EPS | 稀釋 EPS |
| --- | ---: | ---: | ---: | ---: | ---: |
| 07/01–09/30 | 1,501,354,000 | 479,201 | 479,533 | 3.13 | 3.13 |
| 01/01–09/30 | 7,176,259,000 | 478,480 | 479,015 | 15.00 | 14.98 |

財報附註列 **09/29** 為 5,000 萬股 GDS 增資基準日。公司公告的 09/22 是定價日；櫃買名單本次已確認 10/02 仍列舊股數，10/05 才列新股數。正式財報的股本期別與櫃買名單的資料時點要各自保存。用舊股數 478,113,725 加上新股於當期最後兩天的期間權重，可重算基本加權股數為 479,201 仟股（92 日）及 478,480 仟股（273 日）。使用 PDF 的兩組股數與歸母獲利可重算四筆 EPS。這組算術只支持已揭露的歷史期間，未取得未來 EPS 股數、可用行情調整因子或完整估值。[公司定價公告](https://www.sas-globalwafers.com/en/gwc_news_en_20260923/) · [櫃買名單歷史查核](https://github.com/Kaichen9527/stockinsider/blob/144c141deb80f4c58490d7c7e1bd9db032f05ff0/docs/operations/2026-11-15/launch-radar/tpex-6488-native-share-capital-boundary.json)

同一季官方 MOPS iXBRL 為 859,351 bytes。以固定 `f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43` 的程式與 Arelle 2.44.7 進行兩輪離線驗證，完整記錄 2,108 筆錯誤，其中 `xml.3.3.1:idMustBeUnique` 為文件層拒絕；原始 XML 確有兩個 `div` 使用相同的 `NonoperatingIncomeAndExpenses` ID。原 XML 雖有四筆同期間 EPS 宣告，未發現 weighted-average 命名的股數項目；TypeScript 保持 0 可用事實。不得修改原件以改變驗證結果，也不得把 PDF 人工重算值當成機器准入。診斷需約 80.459 秒、峰值 1,040,368 KiB。正式 parser 的資源配置未改。未建立資料庫收據、研究、估值或排名；正式服務保持 active，暫存來源已清除。
