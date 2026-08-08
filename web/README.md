# Web Module (StockInsider)

本目錄是 StockInsider 的 Next.js Web 應用。

完整建置、環境設定、Webhook、Production 驗收流程請看根目錄文件：

- `../README.md`

## 常用指令（web only）

```bash
npm run dev -- --port 3000
npm run lint
npm run build
npm run start

# preview deploy（詳見 ../README.md 第 8 節）
npx vercel pull --yes --environment=preview
npx vercel build
npx vercel deploy --prebuilt

# production deploy（詳見 ../README.md 第 8 節）
npx vercel pull --yes --environment=production
npx vercel build --prod
npx vercel deploy --prebuilt --prod
```

## 主要 API Routes

- `POST /api/line/bind`
- `POST /api/internal/ingestion-run`
- `POST /api/internal/pipeline-run`
- `POST /api/internal/line-dispatch`
- `GET /api/internal/line-diagnostics`
- `POST /api/webhook/line`
