# StockInsider 續作 profile（可公開版）

版本：v5-20261122。本文件僅含StockInsider公開GitHub已有資訊與通用工作規則；私人進度室網址、主機／帳戶資料、其他專案狀態及個人Mac路徑不在此保存。這是有日期的接手線索，開工必須刷新實際來源與授權環境。

## 原權威來源與版本

- Repo：[Kaichen9527/stockinsider](https://github.com/Kaichen9527/stockinsider)，public。
- 原scope：[Issue #385](https://github.com/Kaichen9527/stockinsider/issues/385)，沿原任務依賴與發布門檻。
- [PR #412](https://github.com/Kaichen9527/stockinsider/pull/412)於11/22讀回為Draft/open，分支codex/launch-radar-close-clock，head 41f2415f664b01b845870fc27e52de806de3e986。
- Base為codex/launch-radar-frozen-reviewed-valuation／019400a7bb1cf554f8404c265876b3b208c0aaf1。保留#384→#407→#411→#412的既有審查／整合關係，不重建平行pipeline。
- 讀AGENTS.md、CLAUDE.md、.loop-engineering/policy.yaml及#386/#403/#404/#395/#406最新comments。較晚明示的有效規則優先於舊概覽。
- 根CLAUDE.md舊來源Active表只是歷史宣稱；實際收集能力、權限與結果依AGENTS的typed runtime terminal證據。連接器設定存在不等於取得可用全文。

## 目前可續作前沿

- 同41f2415 Webtree已有types、lint、Next16.3.4 build、reader與受控IdP的範圍內收據，見[#404](https://github.com/Kaichen9527/stockinsider/issues/404)。來源與影響範圍相符才重用，不能把舊候選測試總數加總成新候選通過。
- [#403最後移交查核](https://github.com/Kaichen9527/stockinsider/issues/403#issuecomment-7028152927)仍缺原VM受管輸出及受限staging SSH身分。VPN與SSH是兩項獨立前提；未完成時保全原工作環境，不重建相同包或持續重開VM。
- 公開收據中的固定包為29,047,935 bytes，SHA256 eac709cdc863ce1b9db8dc950eead56f87850efded07ec420d1caed872509025。Git收據不代表包實體已移交；實際收件仍需核size/hash及可取回性。
- #406需詳情財報／估值／反證等五個受限投影，維持最小ACL，驗正例、拒絕、實際欄位與同rankingRunId；不能擴成任意SQL。
- 原正式備份／舊包回滾證據不等於新雷達固定包已驗。容量與身份滿足後，依原gate在同clone驗固定A→B→A及受影響真HTTP行為。
- #395真21:30 writer、原queue／ledger與相鄰實際交易日證據仍須分別成立。writerInvoked=false或single-symbol收據不能當正式榜單更新；日曆等待另列，不用大測試填時間。
- #388真owner登入、有權全文與原來源範圍保持；controlled IdP、RSS或標題不能替代正式內容驗收。

## 11/22執行環境偏好更新

使用者已指定Codex VM優先，具體不可用時可以使用隔離Contabo開發環境；無需重問這個原則。較早「Contabo只部署」的環境偏好在此範圍更新，但正式production、資料、獨立review與release gate保持。

切換前建立一張可審查migration卡：保存可讀回的source、固定包及manifest、未推差異、attempts與owner；以獨立dev帳號／目錄／port／資源額度隔離production，確認原owner退出再接手。未保全唯一成果，不終止原VM。搬機不能重置失敗計數、改驗收oracle或解除發布HOLD。

Codex Chat、Codex VM、Claude、Antigravity共用這份來源與卡片契約，但各自先核實工具能力。沒有shell／SSH的client只做討論、協調與review；不聲稱已啟動背景工作。私人辦公室MCP與網址由使用者於受保護設定提供，不寫進公開文件。

## 接手確認、分工與解卡

接手先以有界唯讀查核整理剩餘範圍、已過／待驗／blocked、首批卡、估時與可見成果，向使用者取得本次一次確認；同scope已有決策則引用直接續作，不重做全案訪談。

Coordinator唯一整合；環境owner處理受限移交；DB/release writer處理具體投影與ACL；source/scheduler工程師處理真來源與writer；獨立reviewer核固定最終head。最多先兩位檔案範圍互斥writer，保持同檔單writer與單重型owner。

卡住後由Triage角色做一次有限診斷，交代證據、已試方法、確定度、可選方案、推薦、時間／資料／費用影響及一個待答問題。需使用者決策時保存Waiting／Blocked並討論；真回答後以decision引用與新revision回到適當phase。普通新卡或動畫不代表已派Agent執行。

## 反迴圈、容量與GitHub

- max_task_iterations=5、same_failure_limit=2、continue_after_task_pass=true、auto_merge/deploy=false沿原policy。換聊天／模型／機器／revision不歸零，不新增額度。
- 相同輸入與失敗無新資訊不重跑。新修法有可否證假說；小改做受影響檢查，固定候選才做必要整合。源碼／測試／驗收條件不為過關而放寬。
- 每卡記active估時、外部等待、最後有效證據、硬timeout、log／artifact上限與checkpoint。模型依難度選，環境／帳號缺件不靠大模型解除。
- 開始前測實際磁碟及phase峰值；歷史容量不是開跑許可，不停止production服務騰空間。新log有限、保留必要未解原件與恢復索引。
- GitHub保存本案程式、規格、任務、交接、決策、發現、attempts與去敏證據；只stage本卡檔案，commit後push並讀回SHA。失敗為checkpoint_pending，不刪唯一工作區。
- 不放秘密、正式DB、私有包、私有來源全文、其他專案profile或個人環境資訊至public repo。大產物存核准私有位置，公開僅去敏manifest與可驗收據。
- 新支援套件分支只是可採用文件，不代表active產品分支已採用或已部署；根報告慣例為.agent/reports/ISO日期前綴。

## 完成定義

保留#385完整研究產品範圍與後續來源，不新增下單／持倉／盤中交易系統。單票Done需要相符候選與原AC；產品Ready、使用者接受、合併與正式部署分開。HOLD僅能由真證據及原正式程序解除。

一次切片完成並保存後繼續已確認DAG，不只做第一張便宣稱全案完成。有限scope完成、所有剩餘前沿具體blocked或真執行預算到達時，交付可操作版本、實測範圍、剩餘門檻與下一步。三個月成效由持久服務累積，不讓開發Goal空轉等待。

## 第四client與外接磁碟

Antigravity從正確repo root讀同一份`.agents/skills/project-delivery-resume`。本機App／CLI／IDE、SSH與Google-managed remote各自核版本、權限、Skill／MCP與真事件；managed remote不繼承本機已安裝設定。模型為實際觀測值或unknown，不以平台名猜模型。

五情境new／resume／change／triage／closeout沿同卡、決策與GitHub checkpoint，本案預設resume。可攜工作優先具能力Codex VM，有限診斷後才隔離Contabo。新外接1TB仍為計畫，採用須核實UUID、掛載、解析後路徑與內外容量；不將外接free代替內部reserve，不新增自動格式化或搬動production的授權。詳見共用external-disk規則。
