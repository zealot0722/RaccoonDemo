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
supabase/patch_csat_feedback.sql  Production patch for older DBs without CSAT table
supabase/reset_demo_tickets.sql  Destructive SQL reset for demo tickets only
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

若 demo 後台累積太多測試工單，可在 Supabase SQL Editor 執行 `supabase/reset_demo_tickets.sql`，清空目前工單並建立 `T001` 到 `T004` 測試工單。也可以在本機設定 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 後執行：

```powershell
$env:CONFIRM_RESET_DEMO_TICKETS='YES'
& 'D:\DevTools\nodejs\node.exe' scripts/reset-demo-tickets.mjs
```

若 production DB 是較早建立的版本，請先在 Supabase SQL Editor 執行 `supabase/patch_csat_feedback.sql`，讓評分資料寫入正式 `csat_feedback` 表，而不是 fallback 到 `messages`。

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

## Vibe Coding 交付說明

### 可查看成果

- Demo URL: https://raccoondemo.vercel.app/
- 試用碼: `raccoon2026`
- GitHub Repo: https://github.com/zealot0722/RaccoonDemo

### 設計邏輯

這個 demo 的目標是建立一個能夠回答常見問題、推薦商品，並在必要時轉接真人客服的 AI 客服系統。系統分成客戶聊天頁與客服 mock console：客戶頁聚焦自然語言問答、商品資訊、查貨態、退貨與評分；客服後台則負責查看工單、對話紀錄、AI 判斷原因、轉人工原因、工單狀態與緊急程度。

目前為了展示方便，客戶頁與客服頁放在同一個 demo 專案中。正式版會拆成客戶端與客服端兩套入口，並補上帳號權限、總控管與營運監控功能。

### Prompt 設計

Prompt 分成兩層：

1. 語意分類：使用 Groq 判斷使用者 intent、confidence、tone、missing fields、keywords、budget 與是否需要人工。
2. 回覆生成：先依 intent 查資料庫，再用資料結果生成客服語氣回覆。

分類結果不會被完全信任。後端會再用 deterministic guardrail 修正可明確判斷的情境，例如價格上下限、查貨態、退貨、亂碼、純符號、多意圖與上下文追問。

回覆生成採「資料先行」原則：

- FAQ 內容來自 `faq_articles`。
- 商品推薦來自 `products`。
- 貨態來自 `order_statuses`。
- 工單、訊息、AI 判斷與評分寫入 `tickets`、`messages`、`ai_decisions`、`csat_feedback`。

模型不能自行創造商品、價格或政策。對客戶的文字統一使用「您」，並移除 markdown `**` 等不適合客服聊天的格式。

### 判斷邏輯 Criteria

- `faq`：政策或流程問題，例如退貨、付款、配送、保固。
- `product_recommendation`：使用者想找商品、比較商品，或提供預算、用途、品類。
- `return_request`：使用者實際要申請退貨或換貨。
- `order_status`：使用者要查貨態、查件、問貨在哪。
- `human_handoff`：使用者明確要求真人、人工或客服人員。
- `complaint`：使用者表達客訴、不滿、服務很差或要求申訴。
- `unclear`：亂碼、純符號、無意義數字或無法判斷的內容。
- `chitchat`：打招呼或無明確客服需求的閒聊。
- `conversation_end`：使用者明確表示沒有其他問題，才進入評分。
- `multi_intent`：同一句包含多個需求時，先處理可處理部分，再補問缺資料；不一律轉人工。

商品推薦會硬性比對 DB 價格：

- `1000 元內`：只推薦價格小於等於 1000 的商品。
- `1000 以上`：只推薦價格大於等於 1000 的商品。
- `1000 到 2000`：同時符合上下限才推薦。
- 沒有符合 DB 條件的商品時，不讓模型自行編造商品。

### 範例 Input / Output

Input: `請問商品可以退貨嗎？`

Output: `您可以參考以下流程：先確認商品狀態與訂單資料，再提供送貨貨號、姓名、電話號碼。若商品破損、瑕疵或少件，也可以上傳商品照片供客服參考。收到必要資料後，客服人員會協助確認退貨或換貨處理。`

Input: `我想找 1000 元內的新手入門商品`

Output: `依照您的需求，為您推薦以下選項。P001｜入門保養組，價格：NT$ 890，庫存：有庫存，詳情連結：/products/P001`

Input: `1000以上的`

Output: 僅推薦價格大於等於 1000 的商品，例如 `P002｜行動辦公耳機`。

Input: `RAC1004 的東西在哪`

Output: 系統會回覆該訂單目前貨態、物流單號、目前位置、最後更新時間與預計到貨時間。

Input: `我要退貨`

Output: `請提供您的送貨貨號、姓名、電話號碼。若方便，您也可以上傳商品照片供客服參考。收到必要資料後，我會把退貨申請轉交客服人員確認。`

Input: `我要找真人客服`

Output: `請稍後，客服人員將很快為您服務。`

Input: `123123123`

Output: `請您重新敘述您的問題，或補充需要協助的事項。我可以協助退換貨、付款、配送、保固、查貨態或商品推薦。`

### 待改進內容

- Groq Free tier 有 rate limit，正式展示或多人試用應改用付費 API key，或加入排隊與快取機制。
- 客戶使用頁面與客服人員使用頁面目前為了展示方便放在同一個 demo 專案中，正式版應拆成客戶端與客服端兩套入口。
- 後續需要補上總控管功能，例如客服帳號、權限、工單統計、回覆品質監控與營運 dashboard。
- 商品資料目前是 demo catalog，之後應串正式商品、庫存與價格 API。
- 查貨態目前使用 demo DB，正式版需串接真實物流或 ERP。
- 客服回覆目前只寫入 demo DB，尚未串 LINE、Email、CRM 或通知工具。
- 圖片上傳目前作為附件紀錄，尚未做 AI 圖像辨識。
- 後台目前是 mock console，正式版需要登入權限、角色控管、操作紀錄與審計。

### 選用 Codex / Groq / Vercel / Supabase 的原因

本次使用 Codex 進行 Vibe coding，原因是它適合在既有 repo 中快速讀取檔案、修改程式、補測試、執行 smoke test 並推送到 GitHub。相較於只產生單一片段程式碼，Codex 可以直接維護整個專案結構，包含 Vercel API、前端 UI、Supabase schema、測試腳本與文件。

模型選擇上，Groq 主要是基於成本與部署速度考量，適合作為 MVP 階段的語意分類與回覆生成服務。後續如果要提升穩定性與準確性，可以考慮本地部署的 Ollama、Gamma，或使用 GPT、Gemini 作為更可靠的語意分析工具。

採用 Codex 也與模型能力和使用成本有關。最新 GPT-5.5 模型在實作、推理與修正能力上不比 Claude Opus 4.6 差，但在可用量與成本上較適合長時間開發。若是正式開發場景，會依任務拆分不同模型，例如使用強推理模型處理架構與複雜 bug，用較快或較低成本模型處理重複修改與文件整理。

- Vercel：提供公開 URL、Serverless API Routes 與 GitHub 自動部署，不需要本機 n8n 長時間運行。
- Supabase：提供 Postgres DB，能保存 FAQ、商品、工單、訊息、AI decision 與 CSAT。
- Groq：提供低成本、低延遲的 LLM inference，適合 MVP 快速驗證。
- Codex：協助快速完成端到端 demo、修正 bug、建立測試、整理文件與部署流程。

整體設計重點是客戶的易用性：讓客戶盡量用自然語言或一般口語表達方式完成自己的需求，例如查詢政策、推薦商品、查貨態、申請退貨或轉接真人客服，而不是被迫理解系統分類或固定指令。

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
