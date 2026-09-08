export default function DataDeletionPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12 text-slate-900">
      <h1 className="text-3xl font-semibold">Threads 資料刪除</h1>
      <p>先在 Threads／Meta 的「應用程式和網站」設定撤銷 StockInsider 權限，避免後續資料取得。</p>
      <p>需要刪除與授權帳號相關的 StockInsider 紀錄時，請使用 Meta App Review 頁面所列的開發者聯絡方式，提供授權帳號識別碼與主旨「StockInsider data deletion」。請勿提供密碼或 access token。</p>
      <p>收到可驗證請求後，將刪除可連結至該授權帳號的 token、credential registry 與非必要衍生資料，並回覆處理結果；依法必須保留的最小稽核紀錄會去識別化並限制存取。</p>
      <p>本說明最後更新：2026-09-07。</p>
      <a className="text-blue-700 underline" href="/privacy">返回隱私政策</a>
    </main>
  );
}
