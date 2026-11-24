# StockInsider 接續 profile

## 2026-11-22 續作與執行環境更新（本節優先）

本節記錄使用者本輪的新要求。下方11/21快照保留作歷史線索；與本節衝突的「只能原VM／Contabo只能部署」環境偏好由本節取代，其他產品範圍、驗收、資料保護、金融／交易及發布門檻保持。新的GitHub讀回不代表本機／VM未推WIP全部已保存。

- 先用有限唯讀查核整理已完成、待驗、剩餘、blocked與建議首批，提供一次具體範圍／優先序確認；若本次同範圍已有使用者確認，引用原決策直接續作，不重開已批准全產品訪談。
- 使用者已明確指定Codex VM優先，具體不可用時採隔離Contabo開發／研究環境；不要再問是否接受這個原則。切換前以migration卡保存source／候選／資料與依賴manifest、未推修改、attempts及owner；確認可恢復後才移交，不能碰production服務或清零預算。
- Codex Chat／Claude是互動與工具入口；執行地點依實際能力核對。有shell或SSH才可做執行，只有MCP／讀取能力時先討論、協調與review，不假稱已開VM或已跑命令。
- 卡住由Triage角色交一份有證據、已試方法、選項、建議與影響的決策包，向使用者討論後版本化回板；新需求也先討論確認，不自行補成產品行為。背景無互動出口就保存待決策，不宣稱已通知。
- 小型來源、規格、原任務狀態、交接、決策、發現、嘗試及去敏證據索引推GitHub並讀回SHA。原memory與tracker仍是權威；文件支援分支已保存不等於產品分支／各client已採用。

### 本案最新讀回與優先事項

- 11/22 PR412 head仍41f2415f664b01b845870fc27e52de806de3e986；repo是public。#403最後三則comment仍確認原29,047,935-byte包在原VM、未有可驗owner-private export；新VM缺VPN及受限SSH身份兩項前提，不能把新VM當已解除。
- 原VM可用則保留；具體不可用時可採本輪已指定的隔離Contabo dev環境，但要先保全source與唯一固定包、交接owner／attempts；不占用production服務／DB建置，不以遷移解除HOLD／受保護runner／獨立review。
- 相符Webtree的build／reader／受控IdP證據已存在；接移交、#406五投影、真writer／真來源及完整release gate，不以相同build填時間。
- public repo只保存本案可公開程式、規格、通用工作規則與去敏收據；六案portfolio、私人Mac路徑、私有包、主機／憑證資訊和其他案profile不得放入。根報告慣例為.agent/reports/ISO日期前綴。
- 根CLAUDE.md的舊來源Active表落後於AGENTS的typed runtime能力說明；實際成功只依最新健康與來源證據，不能按靜態表宣稱已收資料。

---

## 2026-11-21 歷史profile（與上節衝突的環境偏好已更新）

## 快照與入口

- 觀測日：2026-11-21；已讀目前GitHub來源與本次Mac有界入口盤點，具體本機差異見文末。未直接連進本案原VM／Contabo。
- 此profile是歷史接手線索，**不是持續任務真相**；刷新PR／最新comments／現場，不reset舊SHA。
- Repo：`Kaichen9527/stockinsider`；完整scope沿[主規格 #385](https://github.com/Kaichen9527/stockinsider/issues/385)。
- 應用候選[PR #412](https://github.com/Kaichen9527/stockinsider/pull/412)當時open、Draft。
- Branch：`codex/launch-radar-close-clock`；head `41f2415f664b01b845870fc27e52de806de3e986`。
- Base：`codex/launch-radar-frozen-reviewed-valuation`、`019400a7bb1cf554f8404c265876b3b208c0aaf1`。
- PR #411為`codex/launch-radar-combined-validation`／`2784faddcf12ed5333dfdd73333905308f2bfd1e`。
- 原PR #384仍Draft／open、舊cbb5816候選在HOLD；保留受保護分支鏈，不另建平行pipeline。
- 保護dirty／未推工作與原VM唯一封包；在可驗保全前不替換／終止原VM。

## 權威來源與陳舊陷阱

- 讀現行AGENTS、#385、`.loop-engineering/policy.yaml`及#386/#403/#404/#395最新comments。
- #395/#404的11/19與#403的11/20收據取代較早「完整VM build未驗」等假設。
- 根AGENTS的Next15／Vercel／GHA19cron是泛舊概覽，不據此重啟舊排程／nightshift大掃描。
- PR #411正文132項收據綁舊1011b368來源，不能搬成2784fadd／41f2415已過。
- #404說明019400a7是#411 head之後15提交直系候選，#412是其直接子提交。
- #412只修observer真擷取時鐘與Python測試；body hash後取真recordedAt，與observedAt分列。
- 歷史不同SHA的數百次測試不可加總成專案通過數；沿精確source／受影響邊界判定重用。

## 已有證據與真卡點

- 41f2415同Web tree已有types、lint0errors/37warnings、Next16.3.4 build92/92收據。
- 同來源reader18/18、受控IdP owner/private47/47；不要以重跑已過build作唯一進度。
- 原VM standalone包：29,047,935 bytes；SHA256 `eac709cdc863ce1b9db8dc950eead56f87850efded07ec420d1caed872509025`。
- #403證實未有可驗owner-private export，Contabo空0700接收目錄存在但原包未移交。
- 新Cloud仍vpn_enrollment_failed，且缺受限staging SSH身份／agent socket，尚未到TCP CONNECT。
- VPN與SSH是兩個獨立缺件，不是Contabo服務未啟，也不是換新聊天／VM自然會好。
- Contabo較近容量約18.3GB、完整演練估需23.2GiB；每次按目標工作重測，不能拿歷史值當今天。
- 17GiB只屬部分收盤簽章門檻，不是新舊release／完整還原並存門檻，禁止停正式服務騰空間。
- #406 stage工具尚未進候選；舊reader proxy僅榜單／成效兩投影，詳情需新增五個受限投影。
- #395九作業有journal，但writerInvoked=false、officialCalendarAndRankingCertified=false。
- 41f2415採集收據為single_symbol_receipt_only，不能算全市場完整性或兩真實相鄰發布日通過。
- #412保護runner缺同SHA exact-review ref，三審查準備失敗／code gate跳過，**HOLD仍有效**。
- #386等價Linux Cloud runner只是待維護者／獨立reviewer的提案，不能自刪gate或補假review ref。

## 第一批卡與分工

時間盒為首次工程估計；外部owner／真交易日等待獨立計，不保證交期。

| 原卡／子工作 | 可交付結果 | owner／環境 | 時間盒 |
|---|---|---|---|
| #386/#403移交 | 原受管Cloud驗VPN Publish/Republish、受限SSH；42-byte canary後傳固定包核size/hash | 環境owner＋ops | 30–45分一次診斷 |
| #403/#406投影 | 固定A/B manifests、真備份clone、五投影最小ACL與rankingRunId，故障回A | DB/release＋獨立QA | 2小時內首切片 |
| #386/#404 review/runner | 維護者正常改受保護base；固定runner／工具鏈／oracle，獨立review最終head | 維護者＋reviewer | 先60分差距核對 |
| #388／來源票/#404 | 真Google owner登入＋Gmail/有權全文及另兩來源，保留位置／身份／去重 | source engineer＋資料QA | 60–90分首接點 |
| #395 writer | 真21:30 writer與原queue/ledger接線，名冊／停牌／處置完整性、同rankingRunId | scheduler engineer＋QA | 60–120分工程切片 |
| #404→#405交付 | 首版所有原gate後按授權部署，再續八來源與剩餘scope | coordinator／發布者 | 依gate，不預造日期 |

- #403移交缺件就blocked並保全原VM；其他可行前沿繼續，不用build／SSH重試填時間。
- #406五投影涵財報／估值／反證；正例、拒絕、實際欄位、同rankingRunId均驗，不開任意SQL。
- 容量足夠才在受限stage以同clone演練A→B→A；程式先VM驗，舊收據保留。
- #388受控IdP47/47不是Google真登入；RSS／title／合成資料不算有權正文。
- #395沿08:15／20:55／21:30與週檢查，不造平行writer；缺料保留舊榜日期，不能冒稱更新。
- 兩個未來相鄰實際交易日按原cutoff驗首頁／API／詳情；日曆等待不持續輪詢跑大測試。
- 單一主控整合／回存，初始兩個不衝突worker＋獨立QA，實際上限取環境較小值。
- 每票通過後沿原DAG下一可行票；全scope完成或所有剩餘前沿具體blocked才交接。

## 反迴圈、保護與資料

- 原policy：max_task_iterations=5、same_failure_limit=2、continue_after_task_pass=true。
- 原policy：auto_merge/deploy=false；新Skill不能靜默提高2次上限或覆蓋HOLD／正式CI。
- 作者不得修改核准AC／正向斷言／pins來過關；同根因無新資訊即停該路徑。
- 換agent／模型／聊天不重設attempts，保留失敗指紋、已否證假說與下一個解除owner。
- 受保護runner／macOS條件等變更走維護者正式流程，普通產品代理不能直接放寬。
- 開發／build在VM，受限Contabo staging驗收與正式發布分開，不干擾既有生產服務。
- 先驗固定包／新功能邊界，不重建已過產物；來源不同才明示重建原因與新source。
- 小型去敏收據回GitHub；公開repo不放私有包、VPN／SSH秘密、來源私文或真帳戶資料。
- 新run摘要／hash／必要失敗原件有界保留；不刪唯一29MB封包、正式備份或活躍job資料。
- 開發助理按卡片選模；升級須新難點與收益，不假稱Skill能切換，網路／身份缺件不靠大模型解。

## 完整交付定義

- 保留#385來源先行、20active、Top0–10、發動分／財報／估值／反證與版本／歷史／候選。
- 另含私人研究、成效、每日／週排程、回復封存；先研究首版再補全部八來源。
- 沒有下單、持倉或盤中系統需求，不擴成交易產品；不以收益宣稱代替軟體驗收。
- 首版需同候選獨立review／正式CI、三來源、兩場、真writer、兩日、回復／容量等原gate。
- HOLD只由真證據與原授權解除；按指定PR／受限部署流程上Contabo並驗同版本服務。
- 推送後讀回SHA；包移交另驗size/hash／owner-private可取，Git收據不等於已交付原包。
- 三個月成效由持久服務累積，交付後顯示尚待觀察，不讓開發Goal空轉等三個月。
- 進度以accepted AC與真事件呈現，阻塞／等待日曆分開；不以動畫、build數或採集journal冒充完成。

## 本次 Mac 來源核對

Mac直接核對2026-11-21：多份本機分支6b648fa8、12c131aa、7f467529、5678e23f均早於目前41f2415候選。部分status逾時，不能稱clean或刪唯一原件；不由舊Mac副本重建取代原Cloud固定包。

## v5 四 client 與外接碟補充（2026-11-22）

Codex Chat／Codex VM／Claude／Antigravity 共用既有任務、revision、AC、GitHub checkpoint、attempts 與唯一 owner。依 `antigravity.md` 查實際工具，不假設 managed remote 繼承本機 Skill 或 MCP。五種情境為 new／resume／change／triage／closeout；本半成品預設 resume，不重開全部規劃。

可攜工作依已給偏好先具能力 Codex VM，有限診斷仍阻塞後使用隔離 Contabo；平台必需時才使用合格 Mac。計畫購買的1 TB外接碟仍需按 `external-disk.md` 核 mount／UUID／filesystem／路徑與內外容量，不能抹掉上文更嚴的停止／恢復／總額／研究時計限制，也不能自動搬移或格式化。
