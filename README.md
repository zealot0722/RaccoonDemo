# Raccoon AI Support Demo

可部署到 Vercel 的 AI 客服與商品推薦 demo。前台是客戶聊天頁，後台是客服 mock console；後端使用 Vercel Serverless Functions 呼叫 Groq 與 Supabase。

## 架構

```text
Browser
  -> Vercel static frontend
  -> /api/chat
  -> Groq intent classification with recent conversation context
  -> Supabase faq_articles / products / order_statuses
  -> decision center
  -> customer-facing reply with product info inline
  -> Supabase tickets / messages / ai_decisions
  -> /api/feedback writes CSAT feedback
```

不需要本機 n8n、Cloudflare Tunnel 或 Ollama。API keys 只放在 Vercel Environment Variables，前端不會直接拿到 Groq 或 Supabase service role key。

## 專案結構

```text
api/                    Vercel Serverless Functions
src/server/             Groq, Supabase, decision, FAQ, recommendation, order-status logic
supabase/schema.sql     Database schema, including csat_feedback and order_statuses
supabase/seed.sql       Demo FAQ, product, and mock order-status data
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

- `/`：客戶聊天頁。商品推薦會直接出現在聊天訊息與商品卡內，並累積在右下角推薦歷史；評分只會在使用者表示沒有其他問題後顯示。
- `/products/P001`：商品詳情頁；從客戶頁點入時使用 app 內導覽，返回後不重置對話。
- `/admin`：客服 mock console，顯示工單、對話、AI 判斷、推薦商品代號、CSAT 評分，並可更新後續處置與緊急分級。

評分流程採混合判斷：明確結束語由本地規則處理，模糊結束語交給 Groq 分類為 `conversation_end` 後才顯示評分。
亂碼、無意義數字或純閒聊會分流為 `unclear/chitchat`，連續三次無法辨識需求時會結束並鎖定該次對話。
查貨態先使用 `order_statuses` 的虛擬資料，例如 `RAC1001` / `RC123456789TW`；日後可替換成真實物流或訂單 API。
退貨申請會先要求送貨貨號、姓名與電話號碼；商品照片可由客戶上傳作為附件，資料齊全後建立待處理工單，交由客服人員人工判斷。

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
- 查貨態目前使用 demo DB 或內建 fallback，不呼叫真實物流 API。
- 評分會寫入 `csat_feedback`；若 production DB 尚未補上新表，API 會退回寫入 `messages` 的 system 訊息，避免前台功能中斷。
