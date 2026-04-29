# Raccoon Demo 語意辨識測試計畫

## 目的

驗證 AI 客服 demo 在常見客服語境中能正確判斷 intent、延續上下文、追問必要資料，並避免把 FAQ、退貨申請、查貨態、商品推薦、轉人工、閒聊與亂碼互相誤判。

本文件用於 `semantic-guardrail-matrix` 分支測試。通過後才合併到 `main`，由 Vercel 部署 production。

## 測試環境

- 分支：`semantic-guardrail-matrix`
- 測試方式：本機自動測試優先，Vercel Preview 手動驗證其次
- 必要環境變數：
  - `GROQ_API_KEY`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DEMO_ACCESS_CODE`

## 通過標準

- 自動測試全數通過。
- 語法檢查全數通過。
- 手動語意矩陣中不得出現高風險誤判：
  - 退貨規則 FAQ 被當成退貨申請。
  - 商品破損被當成商品推薦。
  - 商品推薦被「客服」兩字誤轉人工。
  - 查貨態口語句被當成閒聊。
  - 使用者補資料時上下文中斷。
- 客戶端訊息仍全部使用「您」。
- 無 markdown 粗體符號 `**` 出現在客服回覆。

## 自動測試

### 指令

```powershell
& 'D:\DevTools\nodejs\node.exe' --test --test-isolation=none
```

### 語法檢查

```powershell
$files = @(
  'app.js',
  'scripts/dev-server.js',
  'src/client/chat-lock.js',
  'src/client/ticket-ui.js',
  'src/server/message-quality.js',
  'src/server/chat-service.js',
  'src/server/llm.js',
  'src/server/prompts.js',
  'src/server/recommendation.js',
  'src/server/return-request.js',
  'src/server/order-status.js',
  'api/chat.js',
  'api/feedback.js',
  'api/health.js',
  'api/tickets/index.js',
  'api/tickets/[id].js',
  'api/tickets/[id]/reply.js'
)
foreach ($file in $files) {
  & 'D:\DevTools\nodejs\node.exe' --check $file
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

## 語意矩陣

| 類別 | 輸入 | 前置上下文 | 預期 |
|---|---|---|---|
| 退貨 FAQ | `請問商品可以退貨嗎？` | 無 | `intent = faq`，不追問退貨資料 |
| 退貨申請 | `我要退貨` | 無 | `intent = return_request`，追問送貨貨號、姓名、電話號碼 |
| 瑕疵商品 | `收到壞掉的商品怎麼辦` | 無 | `intent = return_request`，不可推薦商品 |
| 退貨補資料 | `送貨貨號 RC123456789TW，姓名王小明，電話 0912345678` | 前一輪 AI 追問退貨資料 | `decision = needs_review` |
| 商品推薦起始 | `客服可以幫我推薦商品嗎` | 無 | `intent = product_recommendation`，不可轉人工 |
| 商品條件不足 | `推薦商品` | 無 | 追問預算、用途或品類 |
| 商品中文預算 | `預算大概一千` | AI 追問商品預算 | `budget = 1000`，延續商品推薦 |
| 商品口語預算 | `兩千五以下` | AI 追問商品預算 | `budget = 2500` |
| 商品指定 | `我要 P002` | AI 已推薦 `P002` | 延續商品推薦並顯示 `P002` |
| 商品換品項 | `不要這個，有其他嗎` | AI 已推薦商品 | `follow_up = alternative`，排除前次商品 |
| 商品更便宜 | `有沒有更便宜` | AI 已推薦商品 | `follow_up = cheaper` |
| 商品改預算 | `那我最後確定要 2000 以下的` | 先前已推薦 `P002` | `follow_up = budget_refinement`，保留 `P002` |
| 查貨態起始 | `我想查貨態` | 無 | `intent = order_status`，追問訂單編號或物流單號 |
| 查貨態口語 | `怎麼還沒到` | 無 | `intent = order_status`，追問訂單編號或物流單號 |
| 查貨態長尾口語 | `RAC1004的東西在哪` | 無 | `intent = order_status`，命中 demo 貨態，不轉人工 |
| 查貨態補編號 | `RAC1001` | AI 已追問訂單編號或物流單號 | 查詢並回覆配送狀態 |
| 查無貨態 | `請幫我查 RAC9999 的貨態` | 無 | `decision = needs_review` |
| 轉人工 | `我要找真人客服` | 無 | `intent = human_handoff`，建立待處理工單 |
| 客訴 | `你們服務太差了` | 無 | `intent = complaint`，轉人工 |
| 閒聊 | `哈囉` | 無 | `intent = chitchat`，請使用者描述需求 |
| 亂碼 | `123123123` | 無或商品上下文 | `intent = unclear`，不可當正式商品推薦 |
| 連續亂碼 | `asdfasdf`、`987987987`、`123123123` | 連續三輪 | 第三輪 `autoClosed = true` |
| 結束 | `沒有了` | 任一正常回覆後 | `conversation_end = true`，顯示評分 |
| 混合句 | `謝謝，那退貨怎麼辦？` | 無 | 不結束，處理退貨需求 |

## 手動測試流程

1. 開啟 Vercel Preview 或本機 dev server。
2. 輸入 demo access code。
3. 依照「語意矩陣」逐筆輸入。
4. 每筆檢查：
   - 客戶回覆是否合理。
   - 後台工單 intent 是否正確。
   - AI decision 是否符合預期。
   - 需要轉人工時是否建立 `needs_review` 工單。
   - 商品推薦是否只使用 DB 內商品。
5. 使用手機尺寸重測預設選項、商品詳情返回、評分後鎖定。

## Vercel 驗證

- Preview 測試通過後才合併 PR。
- Production 若部署後出現問題，可使用 Vercel rollback 回上一版。
- Production smoke test：
  - `/api/health` 回傳 `ok = true`
  - 前台可完成 FAQ、商品推薦、查貨態、退貨申請、轉人工、評分
  - `/admin` 可看到工單與 AI 判斷摘要

## 測試紀錄格式

```text
日期：
分支 / commit：
測試 URL：
自動測試結果：
語法檢查結果：
手動測試結果：
未通過案例：
處理方式：
```
