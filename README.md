# Raccoon AI Support Demo

可部署到 Vercel 的 AI 客服與商品推薦 demo。前端提供聊天、商品推薦卡、AI 判斷面板與客服後台；後端使用 Vercel Serverless Functions 呼叫 Groq 與 Supabase。

## 架構

```text
Browser
  -> Vercel static frontend
  -> /api/chat
  -> Groq intent classification
  -> Supabase faq_articles / products
  -> Groq reply generation
  -> decision center
  -> Supabase tickets / messages / ai_decisions
  -> frontend decision panel + product cards
```

沒有依賴本機 n8n、Cloudflare Tunnel 或 Ollama。`DEMO_FALLBACK=true` 只供本地或展示環境檢查 UI 使用；正式提交應設定 Groq 與 Supabase。

## 檔案結構

```text
api/                    Vercel Serverless Functions
src/server/             Groq, Supabase, decision, FAQ, recommendation logic
supabase/schema.sql     建表與 RLS
supabase/seed.sql       FAQ、商品與示例工單
docs/design.md          題目要求的設計說明
docs/test-cases.md      Demo 測試腳本
index.html              Demo UI
app.js                  前端互動
styles.css              前端樣式
```

## Supabase 初始化

1. 建立新的 Supabase project。
2. SQL Editor 執行 `supabase/schema.sql`。
3. SQL Editor 執行 `supabase/seed.sql`。
4. 到 Project Settings 記下：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

所有資料存取都經由 Vercel API，service role key 不會放到瀏覽器。

## Vercel 環境變數

在 Vercel Project Settings 設定：

```text
GROQ_API_KEY=
GROQ_CLASSIFIER_MODEL=llama-3.1-8b-instant
GROQ_REPLY_MODEL=llama-3.1-8b-instant
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=
DEMO_ACCESS_CODE=raccoon2026
DEMO_FALLBACK=false
```

`DEMO_ACCESS_CODE` 用來保護公開 demo endpoint，避免陌生人直接消耗 Groq 額度。若未設定，API 會維持免展示碼，方便本機開發。

## 部署

1. 將此資料夾推到 GitHub。
2. 在 Vercel 匯入此 repo。
3. Framework Preset 選 `Other`。
4. 設定環境變數。
5. Deploy。
6. 打開 `/api/health` 應看到 `groqConfigured: true` 與 `supabaseConfigured: true`。
7. 若設定了 `DEMO_ACCESS_CODE`，首頁會要求輸入展示碼後才允許呼叫聊天與後台 API。

## 本機檢查

此專案沒有 npm dependency。可用 Node 20+ 執行：

```bash
node scripts/dev-server.js
node --test --test-isolation=none
node --check api/chat.js
```

在此 Windows 環境可用：

```powershell
& 'D:\DevTools\nodejs\node.exe' scripts/dev-server.js
& 'D:\DevTools\nodejs\node.exe' --test --test-isolation=none
```

## Demo 路徑

- `/`：聊天、商品推薦、AI 判斷面板。
- `/products/P001`：商品詳情頁。
- `/admin`：客服後台 mock console。

## 重要限制

- 不串 LINE、Email、付款或真實庫存 API。
- 客服後台的回覆只寫入 demo DB，不外送。
- 商品與工單是示例資料，使用 `P001`、`T001` 等代號。
- 公開 demo endpoint 以展示碼降低濫用風險；正式產品仍應加上更完整的 rate limit、登入與稽核。
