# StockInsider｜Antigravity 接手與交付Prompt

v6｜2026-11-22（Asia/Taipei）。只貼正在用的client這一份；本檔不會自行啟動IDE、Agent、Goal或付費服務。

## 本次情境

`mode=resume`

預設接手半成品；全新案才改new（情境/限制→規格/AC→卡與依賴→必要UIUX→實作）；新增需求改change（保留原成果、先影響分析與確認）；卡住改triage（保留原卡與嘗試、不重建全案）；收尾改closeout（固定候選、整合/部署/使用者驗收Gate）。若本輪已確認範圍，不再重問。


## 這個client怎麼工作

先辨認Antigravity App／CLI／IDE與實際版本、host：本機、SSH到自有Linux，或Google-managed Remote Agents。Antigravity是client／平台，不是固定模型；模型另外記錄，只有介面或真hook提供可信觀測時才填，否則model=null。

讀根AGENTS.md／既有GEMINI.md及.agents/skills/project-delivery-resume/SKILL.md、本案references/project.md。官方目前推薦.agents/skills，可沿同一份Skill；CLI用/skills、必要時/skills reload，App用Customizations核實來源，不重造另一套tracker。只把實際可用工具給子Agent；工具名拼錯、未知能力或子Agent未取得上下文都要先修正。子Agent需要明確卡片／檔案／AC／歷史，不假定繼承父對話。

若要連已授權Site，保留既有.agents/mcp_config.json並依真端點合併mcpServers的serverUrl；App／CLI使用Streamable HTTP，完成OAuth後先真只讀再回報。不要把Claude的設定檔直接照搬，不在repo寫token。Google-managed Remote Agents不會自動繼承本機Skill／MCP／plugins；需在該環境驗證或先由對話讀repo規則並手動回報。SSH工作則核遠端自身設定，不能假定看到Mac外接盤。

官方hooks可在.agents/hooks.json觀測，但未有真payload不得稱已接線。Stop的decision=continue或PostInvocation的force_continue不得用於遙測，避免強制續跑；Stop／idle不等於卡片Done。CLI本機／自有host可用headless stream-json，Google remote目前不支援--print，不把同一collector套遍所有環境。只在真正支援且已授權時啟用；沒接線仍保存GitHub短狀態。

## 本案身份與既有成果

Repo Kaichen9527/stockinsider是public。2026-11-22 PR #412仍Draft／open，codex/launch-radar-close-clock head=41f2415f664b01b845870fc27e52de806de3e986，base codex/launch-radar-frozen-reviewed-valuation／019400a7。讀AGENTS、#385全scope、.loop-engineering/policy.yaml、#386/#403/#404/#395/#406最新comment。舊PR正文與歷史候選的測試總數不可移作當前source證據。

原VM唯一固定包須保全；Mac副本是舊分支。PR/source仍有獨立review與正式CI HOLD，不為文件更新或模型接力解除。

本次確認首批應是「保全原VM包並解除移交前提，接五個受限資料投影與真writer／正式review」。41f2415同Webtree已有types、lint0errors、Next16.3.4 build92/92、reader18/18、controlled IdP47/47，不能再用相同build充當進展。

#403 11/20最後comments確認原VM包29,047,935 bytes，SHA256 eac709cdc863ce1b9db8dc950eead56f87850efded07ec420d1caed872509025；沒有可驗owner-private export，Contabo接收目錄仍空。新VM仍vpn_enrollment_failed，且缺受限SSH身分／agent socket，停在TCP CONNECT前。這兩個缺件分開診斷，不反覆新建VM或重建包；先無敏小canary通過，才移交固定包並核size/hash。

#406需新增詳情財報／估值／反證等五個受限投影，原reader proxy僅榜單／成效，最小ACL、正例／拒絕／欄位／rankingRunId都要驗。容量足才用同正式備份隔離clone做固定A→B→A；既有正式舊包回滾證據不等於新雷達已過。#395原收據writerInvoked=false，需真21:30 writer及原queue／ledger、08:15／20:55／週檢查；兩個相鄰真交易日另列日曆等待。#388需真Google owner登入及有權全文，controlled IdP或RSS標題不能替代。

## 本輪第一步

一次確認移交／真門檻的順序；先一次有界診斷兩個移交缺件，同時允許不依賴它們的受限投影程式工作；未可恢復前保持原VM與checkpoint_pending。

## 分工與執行環境

Coordinator管理#385原DAG與唯一整合；環境owner解VPN／受限收件；DB/release writer領明確ACL／投影；source/scheduler engineer領真來源與writer；獨立reviewer驗最終head與既有正式gate。初期最多兩互斥writer。

依11/22新偏好，Codex VM可用則續用原VM；若具體不可用，Contabo只能在隔離dev帳號／目錄／port／資源額度開發，不使用production DB／服務做建置。先保存source與唯一29MB包，讀回到可恢復位置後才遷移writer。原受限staging、正式發布、macOS／等價Linux runner變更仍按維護者與獨立review程序；cloud-first不是放寬HOLD。

## 本案容量、模型與資料界線

原Contabo約18.3GB只是11/20歷史，下一phase要重測。完整演練既有估23.2GiB與17GiB部分門檻不同，不停正式服務騰空間。新log有限、去敏收據上Git；不放私有包、來源私文、備份、VPN/SSH秘密或私人帳戶資料到public repo。原包、正式備份與恢復所需資料保留，不能因改用Contabo就刪原VM。

日常Sol／Sonnet；受限SQL、權限、交易日cutoff或跨環境根因才有界升Astra／Opus。VPN／SSH缺件不以換模型代替；不新增下單／持倉／盤中交易範圍。

本案repo是public。只提交本案可公開來源、規格、通用續作規則與去敏收據；其他專案的名稱、portfolio、私有profile、私人主機路徑／位址、私人Site URL、token、原始資料包與秘密都不可入庫。看板端點由本次client的受保護連線設定取得。

## 執行與交接契約

使用 project-delivery-resume 與 project-storage-guard；先讀這個repo的AGENTS.md、client入口、原指定memory/tracker、.agents/skills/project-delivery-resume/references/project.md。缺少Skill就明列缺口，按本Prompt做可驗證工作。既有使用者指示優先，不重做已確認的訪談。只有本輪剩餘範圍未確認或證據衝突，才把可審查方案與問題集中請Kai確認一次。

每案一位Coordinator。只在有實際子Agent工具時啟用分工；UIUX、實作、QA、Triage按卡啟動，不讓九個角色空轉。不同writer用不同worktree/branch與owned paths，review固定candidate SHA。相同實體工作目錄只准一個writer；同一DB、port、Simulator和Git index另計共享資源。必須核實舊process已停和checkpoint，再轉移ownership；lease過期不等於安全接管。未接入的IDE不會被網站物理封鎖。

同一張卡保留ID、revision、AC、依賴、估時範圍、active time、失敗fingerprint、累計attempts及原absolute deadline（含時區的絕對截止時間）。一次有價值的切片就保存證據和checkpoint；每張卡完成後繼續本輪已核准且依賴滿足的下一張，不以寫文件或完成一張卡當整案收尾。沒有新假說不得重跑相同失敗；先遵循原案上限，沒有才以同因2次、實作迭代5次為初始界限。換模型、主機、chat、branch都不清零，也不把deadline改成「現在起再一小時」。服務端admission attempts與同因失敗次數分開記錄；任一預算耗盡就Triage，延長需保存對應使用者決定。估時上限亮黃，超1.5倍又無新證據轉Triage。runner還要真正設timeout和output/artifact上限，Prompt不是計時器。

卡住保留原stage及紀錄，進獨立Triage佇列；由Triage Agent做一次有限診斷，寫明原因、已試方法、2–3個選項、建議、需要Kai哪個決定。可自行解的工程問題依既有授權處理；需要需求/費用/權限/風險決定才詢問，答覆保存decision再放回Ready的原階段。沒有常駐runner/API就不能聲稱網站已喚醒Agent或通知Kai；下一個client讀該卡繼續。

換模型或quota將滿時，先停新工作、讓本步到安全點，更新原memory與小型receipt，推已授權分支並讀回remote SHA。記task/revision、scope、owned files、WIP缺口、候選、有效測試、attempts、原absolute deadline、資源與下一精確動作。停止writer並釋放或交接lease。新client先唯讀核對，再以同task/revision及原absolute deadline領寫入權；原VM不可達則列明最後遠端SHA之後未知，保護原VM。不得宣稱本機commit等於GitHub已備份。

跨案共用規則只維護在獨立私人Hub；產品程式、spec、卡與最新memory仍在產品repo。Obsidian只用Hub的knowledge小型Markdown作想法、決策與索引，不另造第二套進度。每次對話保留已決定/未決定/否決理由/來源/下一步摘要，不默認其他模型能讀原聊天。共用vault每次只有一位integrator；其他Agent寫獨立Inbox筆記。

可攜工作優先Codex VM；一次有限恢復仍不可用才把同卡同attempts移交隔離Contabo。Mac只做必要平台工作；Colab只適合可中斷計算，不當長駐控制台。重型步驟前量實際filesystem空間，reserve+峰值須同時滿足。planned 1TB不是已掛載；核VolumeUUID/真mount/path/格式/內外free，不在缺盤時mkdir假Volumes。每run有限log、artifact、時間和重試；只保留當前候選、必要rollback、代表失敗及驗收證據。唯一原件/存檔/DB/keys/原畫/未解失敗先保全，不以摘要取代必要原檔。不泛刪.run、不重設環境來掩蓋失敗。

模型從本client實際可選列表選，優先達成AC的最省選項。高風險根因或架構再申請有界升級；說明理由、預算、預期證據。無切模工具就請Kai手動選，不能假稱已換。訂閱額度與API計費分開；不擅加付費、不繞額度限制。最後回報真可操作版本、驗過/未驗項目、GitHub SHA、blocked原因和下一步；不能把build通過或小人走動算功能完成。


## 網站與工作區

從受保護的client設定取得已授權看板，不把私人端點或Hub路徑寫入public repo。

projectId=stockinsider；client=antigravity；provider=antigravity；model只填實際可見值，未知model=null。先讀真MCP工具schema與既有registry，按真repo/host/canonical worktree註冊或核對workspace；新工作區也遵循此流程。取得服務端write lease、記owner/run/epoch並按schema續租；領取失敗、失聯或revision不合時先停止寫入。憑證/lease token不寫進Git、Obsidian或公開事件。相同根目錄別名須resolve，主機名稱不能用新字串避開既有鎖。

v6租約TTL為30–300秒、預設120秒；長build/test開始前須驗證runner能在過期前機械續租，且續租失敗會停止該writer及受控子程序。這次交付未安裝常駐runner／renew watchdog；手動呼叫一次MCP不會自動續租。未具備此機制時，只做已核實舊process停止的人工單writer接力，標「未受服務端鎖保護」，不可把長指令包裝成已受租約管控。過期保留占用；先確認原process停止，再依真schema提供stopEvidence及使用者決定處理。新工作區只註冊已授權repo／目錄，不靜默掃描全機。

真正開始/進展/卡住/停止才回報事件；心跳、最後進展、最後GitHub checkpoint分開。沒有collector就標「未接入/最後已知」，不假動畫或假百分比。網站可獨立開啟，但不會替已關閉IDE繼續工作。完整完成率只在已確認scope分母與驗收證據齊全時計算；未知顯示未建立，不填0或猜80%。Site改卡後讀新revision，舊結果不能蓋過新需求。尚未連上MCP時，單writer人工接力與GitHub保存仍可進行，但不可聲稱已受服務端鎖保護。


## 查證範圍

帶日期的本案事實是接手線索，不是今天重新測完產品。原較嚴限制繼續有效。官方查證（2026-11-22）：https://antigravity.google/docs/skills ；https://antigravity.google/docs/mcp ；https://antigravity.google/docs/hooks ；https://antigravity.google/docs/remote-agents/ 。實際版本／方案可能影響可用能力。
