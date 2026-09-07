export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12 text-slate-900">
      <h1 className="text-3xl font-semibold">StockInsider 隱私政策</h1>
      <p>StockInsider 使用 Threads 官方 API 搜尋公開投資討論，僅保存研究所需的貼文識別碼、作者公開名稱、發布時間、原文連結與股票命中；不使用登入 Cookie，也不代替使用者發文。</p>
      <p>資料用於來源發現、去重、可追溯研究與系統品質驗證。未經授權的內容不會被轉載為全文，也不出售個人資料。</p>
      <p>撤銷 Threads 授權後，系統停止新的 API 取得。刪除既有授權資料請依資料刪除頁面操作；依法或為稽核必要保留的最小紀錄會限制存取並於保留期後清除。</p>
      <p>本政策最後更新：2026-09-07。</p>
      <a className="text-blue-700 underline" href="/data-deletion">資料刪除說明</a>
    </main>
  );
}
