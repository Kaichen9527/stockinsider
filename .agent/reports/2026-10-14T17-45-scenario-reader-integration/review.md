# 實體檔案至完整 scenario/cash 材料：工程整合與精確收據

2026-10-14。Candidate source `1ff6d59a0bd4e37c69a251a2ea2b144a66ebb479`，base approvedmain `1f152fdf43add6bc7f97a00d7e36a7e8cfc105d4`，tree `5ac6b728300a1bb3079e308a293c127981ec271c`，branch `codex/research-scenario-cash-reader-integration-oct14`。本報告保存已實際完成的工程；尚無本 candidate PR、ordinary GHA、formal exact approval、protected、merge 或部署。原三階段 goal 仍 active。

## 實際材料與作者範圍

Root scenario source `e8de7d76c852d86d6383f52f10c7aad74b9fa1f3` 使用原15d4的186行 calculator 與 clock exactbytes，完整3 scenarios ×6 quarters，加原 bounded historical-cash projection。612個數值 assertions 是兩個測試內的比較，不是612個測試。保留Oct8 original cutoff、Oct14 artifact/extraction 與 actual read-known-at 的不同意義；Q2 weighted shares、H1 cash、June issued-capital denominator 分開，forecastCash=null，source/PIT/investment/publication flags=false。Root初版2ec3PASS6FAIL stale cap reference、其最小修補與9/38 PASS各自原始stdout/subject保留。

Cloud對此 Root 模組的獨立 code review evidence `b5131dcd38cce013a8b01dda59c250d1713342a4`，receipt `6dde02fcae89c84ad89638ad8c05a6398e0475923349974f09c780849c4720c3`，scoped CODE PASS，0新P0/P1/P2。Root實核20raw與13source SHA/bytes/blob；peer實跑38 tests、module TS及獨立數值/來源/邊界 probes。原peer probe clock +00:00被Z-only契約拒絕，原RED留存，修的是probe表示法，沒有改產品clock契約。該 review 沒有 appbuild 或 formalrelease 批准。

Cloud reader original source `6313d9e455eb4d5c17a76c94300c4fa676f6ddc9`，delivery `195de5d2fcead7adff4c1c32c3243a0337213e22`，receipt `d8cdadd86b8e72cfde33a508c3349b2c8fe08d768c685578ebc2aa0a643cf478`。Root實核55raw、16source entries/13unique、6provided blobs及manifest連結，並獨立看實際 owner/engine。Maker48及type/lint/正常build真PASS，1798 serverfiles；Root沒有親讀每份compiled bytes或稱自己重build。

原reader test hardcode /workspace：Root對原6313 repository command真0PASS1FAIL/ENOENT，不能改稱舊19PASS。Root fixture-only scratch harness對unchanged runtime真19PASS；其後只修 portable fixture setup/handoff的 `9daf8248355568c45bb0bda3ade224be1b84b9f0` 真repository48PASS，runtime/descriptor/webtree與6313相同。原REQUEST_CHANGES/P2與RED保留。Canonical OS home +exclusive0700 fixture保留所有ancestor/FD guards，沒有 /tmp例外。Root未自簽自己的 portable 修補；後述 c2 delta review另行閉合。

## 完整一次 acquisition

Root整合1ff只用一個 fixed private helper與同一 process owner/deadline。固定AUO9/EMC7全FD/raw/parents → pinned literal carrier → server Date read-known-at →完整 scenario/cash projector →再次namespace validation → confirmed cleanup →deadline check →return。沒有先cash後另一read/owner/clock，沒有caller supplied path/hash/executable/clock。所有FD保留至fullmaterial計算與驗證後；unconfirmed cleanup/late settlement會阻擋legacy、cash、scenario全部facades，直到真正settle。Legacy≤8 facade目前仍是新identity的診斷介面，並未宣稱原fresh-v2完整計算lifecycle或原77b1執行。

20-file candidate內18 assembly entries中14項對至少一個6313/9daf/e8de origin逐byte相同；另改facade、descriptor、兩ordinaryworkflows，加integration test與handoff。新14-file leaf descriptor `f28549ba9d63ff909e3470a144793d5ca4940491822f38684a65f126d4d54624` 的所有file bytes與sortedcompact metadata hash已重新核。sourceClosureApproved=false/enabledForLiveV2=false；這不是未實作完整HTTP/PG/author pipeline的closure，不可拿它批准將來schema/controller變更。SQL/roles/HBA/authority/protected/oracle/root-web locks未改。

Root sealed WIP86a實跑62/62 PASS（reader19/core14/cash15/scenario9/integration5），zero fail/skip/todo，module-only TS PASS。Final1ff只增加handoff；原62不是全新正式HTTP/PG驗收。歷史48/38與此62重疊，不相加。

## 真獨立 delta review與新正常build

Cloud turn01a139ab completed，evidence `c2c0535f78aa082fb7e1113711b0c63a936b2d1a`，receipt `6bf63431571738d6b3ee52b8ce5bc417bd5cffc358ea59e7598efef15487bbfe`。Cloud是原6313 engine作者，因此明確只對 Root integration/portable修補/descriptor/ordinaryworkflow 提供 scoped independent CODE PASS、0新P0/P1/P2，不自簽其原engine；原engine範圍由Root獨立 review另述。本組不是完整formal exactrelease attestation。

此 exact1ff 真重新執行62/62、六個獨立 actualFD cases、normal typecheck/lint/build，皆PASS；lint33既有warnings。六個cases涵蓋兩公司FD保持可讀到最後namespace檢查、第三次檢查插入真sibling拒絕及cleanup、stalled close無成功/三facade互斥/真settlement後復原。Probe縮短deadline時已armed的wait仍是10s，不能稱35ms wall abort；沒有hardkernel/CPU cancel或immutable string wipe承諾。

Actual Node22.14.0/Next16.3.4 normalbuild BUILD_ID `hBqUTTRdliBGyZ0YwXavx`，1798serverfiles/59967117bytes。Buildmanifest SHA `9f7f4cc3d377f3e712dde794c3a537bb7ee0f09249dc8deb91a4848cfe1e2a13`。本次是新1ff build，不沿原6313舊build；Root未在Mac fullbuild，亦未逐一讀回遠端compiledfilebytes。各phase循序，sampled RSS最大1669005312、workspace最低8617132032bytes；是實際sample，不是hard cgroup證明。Fixture已清、source乾淨，沒有PG/server/HTTP。

Root核c2的29raw/report、20changedsource SHA/bytes/blob、14closurefiles、60origin comparisons（不存在檔案記null）與1798entry manifest總量，沒有重跑已完成tests/build。Root初次錯把null比較成False導致AssertionError，初始detail檔名過早寫成metadata-discrepancy；修正harness ternary後全部比較吻合，這不是source discrepancy或productFAIL。原錯誤與解釋另封存，未改peer receipt/source。Peer初次缺local9dafobject的readonlylookup RED也保留，exact fetch後核對。

## 下一件與正式未完

真idle28後只接一件20min contract/proof task，Cloud turn `01a139ca-a442-7209-b4e5-1f9dacf0dbc4` /cursor29 inProgress，branch `codex/research-versioned-complete-input-contract-oct14` /base1ff。Owned只自有ADR/probes/source摘錄/handoff/evidence；Root只report，沒有重派reader或重做本次62/build。需核實原15d4 complete-input/deep job admission/SQL與四actualcaller，提出完整v3 finite schema/版本化prepare-read-seal/舊sealed replay與fresh-v2保留/跨version同quota的精確接線及actual taggedcanonical/PG尺寸proof。不能偷把fresh-v2禁用或當原77執行，不能改SQL/roles/expectation來綠；做不到逐項pending。

本turn沒有新VPS/DB/role/ACL/capacity/HTTP/crawl/PTT343/策略/排程/部署/cache操作。Main1f與PR370..379 terminal保持，不跑其checks/helpers。容量沿08:25:32Z最後真值available16095801344<19998441472、deficit3902640128，正式current169，不重測同必敗heavy/降reserve/重問20GB/擅付費。完整v3 schema/closure、legacy sealed replay/fresh compatibility、共享4slot524288/120s/livefences、HTTPPG/所有author-review-publisher consumers、formalpeer/normalprotected/capacity/migration/deploy仍待；兩篇材料工程PASS不等正式role-bound文章發布/Top20/研究排程資格。
