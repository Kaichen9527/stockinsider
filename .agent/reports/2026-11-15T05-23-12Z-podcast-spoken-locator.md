# Podcast 口述定位的格式重播

固定 `f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43` 的現有 parser 在 Contabo 以非 root、標準輸入及十秒上限執行。六項格式控制只測發現與解析層，未執行 writer，也沒有使用任何指定來源的逐字稿。確切 blob、雜湊和輸出見 [OpenSpec 收據](../../openspec/changes/stockinsider-vnext-20/evidence/2026-11-15-podcast-spoken-locator-control.json)。

- 合法 VTT cue 保留 9–12 秒。純文字和有 0:09 標記的 HTML 皆回 0 秒。前者本來沒有時間，後者失去來源時鐘。
- 結束早於起始的 VTT cue 仍可解析。JSON 的空字串時間被當成 0 秒保留。0 秒可以是真實 cue 開頭，前提是輸入確有時間。
- 同一集先列純文字、後列 VTT 時，feed parser 只留下純文字。原規格允許多格式並存。[Podcast Namespace](https://podcasting2.org/docs/podcast-namespace/tags/transcript)
- 同步流程將 cues 合併後才識別股票，且依賴「股票代號」等前綴。資料庫現存整段 `timed_segments` 並未將特定股票與 cue 綁定。缺逐字稿而有 rights flag 時，標題和摘要仍走舊 weak signal 路徑。[同步入口](https://github.com/Kaichen9527/stockinsider/blob/f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43/web/src/lib/research-v2.ts#L5774) · [個股辨識](https://github.com/Kaichen9527/stockinsider/blob/f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43/web/src/lib/research-v2.ts#L5688)

強勢雷達在既有入口增加逐段證據，維持舊同步呼叫和停用的通用影音轉錄。選用同集具授權與有效時鐘的 artifact，保留發行者、原語言、原始發布時間、內容雜湊及有效起訖。標題、章節及無法定位的逐字稿保留覆蓋狀態。逐段對照台灣上市／上櫃公司主檔和唯一別名，身分不明維持未知。按 episode identity／內容版扣來源額度，重跑不重扣。以來源 rights scope 限制保存及公開欄位，驗證共用快取無私人內容。T05 仍須使用真正股癌節目驗證股票、原音定位及不明身分或反證。

優先使用創作者供應的帶時鐘 VTT、SRT 或 JSON。若取得可分析音訊的同意，可在一次性 Codex VM 衡量無按次費用的轉錄方式，紀錄音訊雜湊、模型版本、時間區間，人工回聽核對公司名稱。參考專案採用的 MLX 無法直接當成 Linux VM 實測；其程式授權無法確立節目逐字稿供應權利。本輪只核對接線及格式，未啟用付費轉錄或複製節目素材。[轉錄參考實作](https://github.com/huijoson/gooaye-agent/blob/1bc2f2ff5bc7dcfb78644237b38af5dba3796fce/docs/adr/0006-official-audio-asr-fallback.md) · [SoundOn 條款](https://www.soundon.fm/terms/)
