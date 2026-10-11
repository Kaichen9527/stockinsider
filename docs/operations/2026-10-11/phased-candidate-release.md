# 先讓候選可用，再逐檔補齊研究

2026-10-11 使用者要求縮短首次可用時間：已具資料的候選先展示，尚在驗證的來源、文章及策略繼續由 Codex 工程接續處理。本方向取代「等全部研究工作完成才交付」的安排，不變更投資資格或既有保護規則。

## 切換前盤點（11:54Z歷史快照，後文已部署）

本次實際讀取正式首頁、公開 radar API 與唯讀 PostgreSQL，並以 Internal Browser 搜尋2409：

- 正式入口：http://5.104.83.211/ ，HTTP200。搜尋可用；完成快照載入後可搜尋友達及進入來源連結。
- 公開快照：272 found、1 waiting、0 actionable；首次 API 分頁只回40筆 found，不是全候選只有40筆。
- 快照發布時間：2026-10-11T11:42:25.789Z；個股技術日2026-10-08。友達來源9筆、6發布者、2平台；這是現有系統統計，不是本次重新核實9個獨立消息根源。
- 正式執行檔仍是9fd86fe620ccc63c89c4acd208327bf2c4e15332；PR364的2e078df尚未合併或部署。本次沒有產生正式寫入、重新發布或服務切換。
- DB最新交易日原始階段為336 found／1 waiting；公開快照272／1。兩者範圍不可直接混算，差異仍須逐檔核對，不宣稱全母體已覆蓋或漏件為零。

## 第一批發布邊界

保留候選名單、搜尋、來源引用、價量日期、研究與技術分數及尚未達成條件。候選可以因一項待查傳聞進入研究，不必等每個平台都接通，也不必等所有公司都有深度文章。

完整深度文章、條件式財測及交易資格分別接受審查後才開放；缺資料顯示待研究，不能為增加可行動檔數降低資格。單一來源與同源轉載不得假冒獨立確認。現有0 actionable照實保留。

首批新程式部署必須通過該精確版本必要檢查、安裝安全與首頁／個股頁檢查；不等待全平台內容驗收、全市場策略有效性或五個未來交易日。五交易日是部署後運作驗收，正式模型研究排程仍按其各自驗收啟用。

## 早先 PR364 發布阻擋（後續完整功能）

1. 受保護模型閘門的 Mac runner 指向已移除的舊CLI。產品272/272和其他三項實際PASS保留，但不能代替失敗的模型閘門。首次信任遷移例外尚未獲明確批准；使用者的分批發布意圖不能推定為保護設定變更授權。
2. 另一次普通CI38130038830出現financial_parent_replaced。現有嚴格讀取器在無關 sibling 變動 parent metadata時也拒絕；已重現機制，尚未證明CI實際變動路徑。已將一件測試隔離修復交給既有idle VM，獨立branch、保留所有斷言及真實測試，不改正式guard。
3. 現有頁面行情與完整度訊息不一致：公開API asOf為2026-09-12、大盤freshness明示過期；個股技術日10/08、preliminary完整度98.77%、daily_price:empty，但首頁有完整度100%與大盤趨勢文字。不可把快照新發布時間當資料全部新鮮。需釐清各欄位範圍並修正誤導，不用補空數字。

## 首批改採已批准 main，與 PR364 分開

2026-10-11T12:39Z 再查實際 GitHub：main `169aad1b6cfa747f78ae3464b614f43c0749d806` 已包含候選與逐檔突破／回檔計畫。PR282 的真正受保護檢查 run `36014062080` 七項成功，於9/24合併；其 head `110a7197afadfca6fd4f570c68a9c216d11aa9b4` 與 main 的 tree 同為 `fb62be71161857affbaa8ea8ed7f4d7921a4b3c9`。正式執行檔9fd較舊，尚未取得這批已批准功能。

因此第一批部署 main169，不等待 PR364、新 runner 信任遷移、全部來源或文章。這不是用舊批准替 PR364 背書，亦不需要再合併已合併的 main。

- Linux build run `38138212902` 成功；固定 checkout 與 packager 皆為 main169。98項 entry-plan、7項打包測試、4項瀏覽器測試、型別、lint及正常build通過。
- artifact `11701238074`：壓縮27,563,099 bytes、內容79,290,260 bytes／2,584檔。root逐檔核對大小、權限與SHA256，禁止路徑穿越、連結及秘密檔案。
- 精確 migration 在 VM 的隔離 PostgreSQL 驗證：9組PASS、49次預期SQLSTATE拒絕、重複安裝一致。證據commit `2e9723aff0c8cfe656f8ba3e57cdb4bea4091da3`；不宣稱已套用正式DB。
- 部署腳本 `a3a6981a…` 完成獨立 unsigned scoped CODE／預算審查。使用既有三鎖、完整套件驗證、固定DB身分、原子切換、writer註冊及可驗證故障恢復；非受保護簽章。
- 不在VPS建置，archive留 `/run`；依實際4KiB區塊將此操作部署配置限定128MiB，其他WAL、暫存、成長、記憶體預留及15GiB硬門檻維持。即時需至少19,998,441,472 bytes可用，仍須鎖內實測。
- 12:29鎖內准入失敗；12:36唯讀可用僅15,004,835,840 bytes，同機其他App建置造成波動。尚未傳輸、套用正式migration或切換。已與該App既有聊天協調；未取得新的範圍授權前，不清共享Docker cache、images或volumes。

一般CI隔離修復另已推送 PR369（code da660bfc、證據7913bc7）：820項中818PASS、0FAIL、2項明示native-profile skip；型別、lint、build及獨立局部複審通過。原斷言、讀取器與14項批准腳本不變；它是後續PR364修復，不阻擋本次main169發布。新runner候選892c93e的fixture保持未啟用，獨立審查接續，沒有冒稱受保護閘門已修復。

2026-10-11T12:41:54Z 已完成真實正式切換：同機App在自己的範圍清理舊映像／快取後，鎖內可用20,815,044,608 bytes、預留後16,922,730,496 bytes，准入通過。精確artifact與migration再次核hash、套用正式SQL、RLS／ACL驗證、writer啟用及服務／loopback健康全部成功；正式current及唯一active writer皆為main169。啟動初期一次3100連線拒絕由既有ready重試恢復，最後驗證成功，原stderr保留。沒有以失敗的runner或PR364批准取代main169原批准。

切換後已啟動既有 authenticated core pipeline，全候選、非dryRun、不設symbols、不使用skipIfResearchSessionComplete；pipeline `918db413-a56c-4cd6-86f8-617b4a6b1239`、research `d500fa84-e57b-4c3d-bafd-deac37ebf249`、model `candidate-research-v4.4.2`，12:43仍running。本次也獨立通過原4GiB工作配置准入。接續核對 `expected = evaluated + dataInsufficient`、同run revision及新公開快照；running不能記作已發布。

Internal Browser 已驗證新版首頁候選搜尋、友達既有immutable revision及新增進出場計畫區塊；該舊revision如實顯示尚無可驗證計畫，不用新行情改寫。桌面與390×844手機可讀，手機未見橫向溢出，當次瀏覽器error紀錄為空。新run產生後仍須驗證新計畫與快照。缺資料可明列，不能偽造可交易結果。

精確量測、腳本、unsigned審查與版本清單保存在 `.agent/reports/2026-10-11T12-39-merged-main-candidate-release.json` 及同名目錄。

## 切換後持續更新與現有限制（13:13Z）

新版程式已上線；完整候選資料更新仍待本輪結束，兩者不混為一談。手動HTTP等待20分鐘在13:02Z回傳500 timeout，但底層flow／DB lease仍running；沒有重送。21:00既有排程在OS鎖釋放後被DB lease以409拒絕，沒有第二個research run；原failed紀錄保留、timer未改。預定僅取消等待中的service因精確waiting predicate不再成立而沒有執行，不假稱已取消。

13:11Z啟動單次最多90分鐘的唯讀觀察器，固定追蹤pipeline918db413／researchd500fa84並持有既有重型／production-write鎖；只讀狀態、保存收據，不能重試或發布。原deadline超時P2已用5個純mock閉合；原RED保留。服務與root0700輸出目錄已實際驗證，收據在 `/run/stockinsider-main169-refresh-watch-oct11/latest.json`。如先終態即退出；若觀察到期而工作未完成，工程heartbeat繼續核對底層工作，不據此重送。0 candidateCount／0items發生於前置取得階段，不能宣稱全市場為零或已完整覆蓋。

PR369真正普通GitHub CI38139887387成功，原金融讀取器及斷言未削弱；protected仍沒有批准。runner892c93e獨立103項局部測試通過但保持inactive，不是完整信任復原。首次信任遷移例外未批准，PR364完整Agent功能未部署。

VPS已擴容，實體154.894GB；同機其他App建置令可用空間再次波動，13:09Z讀到14.826GB低於15GiB保留，13:10Z15.989GB仍偏低，13:13Z恢復17.017GB，但尚不足新重型工作准入。已請該App既有聊天在自己的授權範圍處理；root未清共享Docker，也沒有新增重型工作。這不撤銷已成功部署，但後續重型工作仍須重新通過原容量准入。

桌面／手機先前檢查通過；13:11Z再讀首頁HTTP200、web／worker／preview active，已保存首頁截圖。一次DOM helper逾時單獨記錄，後續截圖成功，不將工具逾時當網站故障。公開候選仍272／1／0，價格日期10/08及資料缺口明示；新run快照、完整度文字範圍與母體差異仍待驗證。

## 後續逐批增加

先核對候選覆蓋及資料日期，再依現有Top20研究佇列逐檔完成作者→獨立反證→財測→發布；各平台僅在實讀通過後啟用。策略按獨立實驗與使用者批准版本接入，不把部署或文章長度當獲利證明。

既有每小時stockinsider工程接續已更新為此發布順序，沒有新建重複排程，也沒有啟用尚未驗收的正式研究排程。Cloud既有「Set up stockinsider」接到普通CI隔離修復一件工作；開始前確認idle，禁止重複派工。未完成範圍持續保留，不因先交付候選而標成全部完成。
