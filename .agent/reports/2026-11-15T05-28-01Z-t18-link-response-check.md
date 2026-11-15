# Contabo 隔離回滾的歷史詳情連結驗收

在 Contabo 非 root 程序以標準輸入重播 `1d957e28ddf4ec4995792f10fc3f8f0eaeb1a6c6` 的三個精確 Git blobs，執行原 URL 防護、API payload 比對及 HTML 可見文字解析。另以 Node 執行兩個 Next.js 固定版本共用的原 sanitizer。此輪只用無私有資料的控制輸入。[原始結果與 Git blobs](../../openspec/changes/stockinsider-vnext-20/evidence/2026-11-15-t18-historical-link-response-verifier-control.json)

| 控制 | 本次觀測 |
| --- | --- |
| 已核實事實保留數值，連結為 null | 舊 API 驗證接受，固定 reader 對 null 也保持 null |
| 允許的證交所查詢／不明參數／未允許 vendor 查詢 | 原 staging 防護分別接受、拒絕、拒絕 |
| 對照為 null，API 回傳未允許的 fact source URL | 舊 API 驗證仍接受 |
| API 額外回傳未允許的獨立來源連結 | 舊 API 驗證仍接受 |
| 對照有允許的來源網址，API 把它省略 | 舊 API 驗證仍接受 |
| 事實數值改變 | 舊 API 驗證正確拒絕 |
| HTML 可見文字相同但連結目標替換 | 舊 HTML 比對無法辨別 |

共用 sanitizer 用以規範瀏覽器連結及移除敏感參數，不等同隔離 staging 的查詢網址政策。兩個固定版共用同一 `CandidateDetailView`，事實表呈現日期、值和單位，來源區則取獨立的 `sources` 與 `sourceLinks`。省略受阻事實網址，可保留原事實證據，不須讓 HTML 新增個別事實 href。[固定畫面](https://github.com/Kaichen9527/stockinsider/blob/169aad1b6cfa747f78ae3464b614f43c0749d806/web/src/app/stock/%5Bsymbol%5D/CandidateDetailView.tsx#L494) · [原 API 比對](https://github.com/Kaichen9527/stockinsider/blob/1d957e28ddf4ec4995792f10fc3f8f0eaeb1a6c6/deployment/staging/vnext/t17_keyfd/t18_detail_http.py#L28)

下一次使用真實還原副本重跑時，先核對原快照和 fact 指紋及原始診斷。僅在事實的 URL 欄且屬已驗的歷史來源類型時，評估將準確識別的受阻連結替換為 null。正文、事實值、時間、其他防護及可用官方連結都必須保持。非預期格式、衝突或受限制的獨立來源仍由原 guard 拒絕。固定 HTTP verifier 應核對每筆 API source URL 與預期的公開投影，確認該留的 canonical URL 保留、受阻欄位為 null，並檢查兩個版本在來源區實際渲染的 href。外層只輸出去敏布林、拒絕類別與既有摘要。HTML 原始資料和 URL 不寫進驗收收據。

此輪沒有重做正式備份還原與固定版 HTTP，也沒有變更原 staging 防護、正式服務或原發布門檻。
