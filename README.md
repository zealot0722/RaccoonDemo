# Raccoon AI Support Demo

可部署到 Vercel 的 AI 客服與商品推薦 demo。前台是客戶聊天頁，後台是客服 mock console；後端使用 Vercel Serverless Functions 呼叫 Groq 與 Supabase。

## 架構

```text
Browser
  -> Vercel static frontend
  -> /api/chat
  -> Groq intent classification with recent conversation context
  -> Supabase faq_articles / products
  -> decision center
  -> customer-facing reply with product info inline
  -> Supabase tickets / messages / ai_decisions
  -> /api/feedback writes CSAT feedback
```

不需要本機 n8n、Cloudflare Tunnel 或 Ollama。API keys 只放在 Vercel Environment Variables，前端不會直接拿到 Groq 或 Supabase service role key。

## 專案結構

```text
api/                    Vercel Serverless Functions
src/server/             Groq, Supabase, decision, FAQ, recommendation logic
supabase/schema.sql     Database schema, including csat_feedback
supabase/seed.sql       Demo FAQ and product data
docs/design.md          Prompt, criteria, architecture notes
docs/test-cases.md      Demo test scripts
index.html              Customer page and admin page shell
app.js                  Frontend interaction
styles.css              UI styles
```

## Supabase 設定

1. 建立新的 Supabase project。
2. 在 SQL Editor 執行 `supabase/schema.sql`。
3. 在 SQL Editor 執行 `supabase/seed.sql`。
4. 到 Project Settings 取得：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

`SUPABASE_SERVICE_ROLE_KEY` 只能放在 Vercel 後端環境變數，不可放到前端。

## Vercel 環境變數

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

`DEMO_ACCESS_CODE` 用來保護 demo endpoint，避免公開 URL 被大量呼叫消耗 Groq quota。

## 路由

- `/`：客戶聊天頁。商品推薦會直接出現在聊天訊息內。
- `/products/P001`：商品詳情頁。
- `/admin`：客服 mock console，顯示工單、對話、AI 判斷、推薦商品代號、CSAT 評分。

## 本機驗證

```powershell
& 'D:\DevTools\nodejs\node.exe' scripts/dev-server.js
& 'D:\DevTools\nodejs\node.exe' --test --test-isolation=none
& 'D:\DevTools\nodejs\node.exe' --check api/chat.js
& 'D:\DevTools\nodejs\node.exe' --check api/feedback.js
```

## 目前範圍

- 不串接真實 LINE、Email、付款或庫存 API。
- 客服回覆只寫入 demo DB。
- 評分會寫入 `csat_feedback`；若 production DB 尚未補上新表，API 會退回寫入 `messages` 的 system 訊息，避免前台功能中斷。
