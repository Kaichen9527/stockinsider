# 股癌官方音訊元資料與跨市場公告時鐘

## 真實節目索引與音訊上限

Contabo 在 2026-11-15 讀取股癌官方 SoundOn RSS。EP712／713／714 的 GUID 與官方單集頁身分一致。三集有音訊 enclosure，未見 transcript、chapter、caption 或內容授權欄位。EP713 發布於台北 11/11 15:21:09，EP714 於 11/14 12:00:04。索引和單集頁尚未提供可驗的完整口述與時間定位。[官方 RSS](https://feeds.soundon.fm/podcasts/954689a5-3096-43a4-a80b-7810b219cef3.xml) · [EP714](https://podcasts.apple.com/tw/podcast/ep714/id1500839292?i=1000801859237)

EP714 enclosure 標示 1 byte。僅使用 HEAD 檢查官方網域，再由同一供應商的媒體主機取得 `Content-Length=50,845,214`、`Accept-Ranges: bytes`。這是網路標頭，沒有讀取音訊或驗證整集原檔。固定版本轉錄使用 `Range: bytes=0-26214400`，若伺服器遵循只涵蓋 51.56% 的檔案位元組。這個比例不能換算成口述時長。程式也要求文字格式，未取得絕對時間位置。後續若有音訊授權，須驗證媒體身分、編碼、實際回應區間、完整覆蓋及對應原始時點。創作者提供具時鐘的 VTT／SRT 亦可驗收。現在仍保留內容缺口。[固定轉錄程式](https://github.com/Kaichen9527/stockinsider/blob/f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43/web/src/lib/research-v2.ts#L5657-L5685) · [SoundOn 使用條款](https://www.soundon.fm/terms)

## 公司公告不可回填早期榜單

NVIDIA 的 8-K 所載董事會事件日期為 11/11。公司透過 GlobeNewswire 發布的時間是 11/12 08:48 ET，即台北 21:48。SEC 收件時刻為台北 21:52:41。兩份所查一手資料都晚於台股 11/12 21:30 截止。EP714 是 11/14 出刊，這三份資料的時間不能相互替代。NVDA 可作市場背景，屬美國上市證券。不應從美股公司公告自動推定任何台股被提及，也不應自動寫出台灣供應商受益或受損。這是獨立公告可知時點的實例，尚未驗證主持人實際口述或候選。[公司發布](https://www.globenewswire.com/news-release/2026/11/12/3401635/0/en/nvidia-announces-ceo-transition.html) · [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1045810/000104581026000082/0001045810-26-000082-index.html)

未下載原始音訊、送模型請求或新增費用，未啟用採集或發布候選。
