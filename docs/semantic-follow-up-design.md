# Raccoon Demo 後續語意修正設計

## 目前部署狀態

- 修正分支：`semantic-guardrail-matrix`
- 最新分支 commit：`82264e2 Add semantic test plan`
- 目前 `main` commit：`3db08d7 Fix product budget context on mobile`
- Vercel production health check：`/api/health` 回傳 `ok = true`
- 結論：本次語意 guardrail 修正已推到 GitHub 分支，但尚未合併到 `main`，因此尚未確認進入 Vercel production。若 Vercel 有開啟 branch preview，應先用 preview 驗證；通過後再合併 PR 讓 production 部署。

## 目標

降低使用者自由輸入時的語意誤判，讓 demo 從「可展示主要流程」提升到「可承受一般試用者追問、改條件、補資料」。

本階段不改架構，不新增外部服務，不更換 Groq。優先在本機決策層加入可測試的 deterministic guardrail，再讓 Groq 負責語意摘要與較開放的回覆生成。

## 修正範圍

### 1. 商品上下文指代解析

問題：

- `剛剛那個多少錢`
- `剛剛那個連結給我`
- `那款還有庫存嗎`
- `這款還有現貨嗎`
- `它適合通勤嗎`
- `第二個多少錢`
- `第2個可以嗎`
- `第三個有貨嗎`

目前常見誤判：

- 被判成 `chitchat`
- 永遠抓第一個商品
- 把 `第2個` 的 `2` 誤判成預算
- 沒有從上一輪 AI 回覆中的商品順序反查商品

設計：

- 新增 product reference resolver。
- 從最近 AI 訊息解析商品順序，例如 `P001｜...`、`P002｜...`。
- 將 `第一個`、`第1個`、`第一款` 對應第一個商品。
- 將 `第二個`、`第2個`、`第二項` 對應第二個商品。
- 將 `這個`、`那個`、`這款`、`那款`、`它`、`上一個` 對應最近一次推薦的主要商品。
- 指代成立時，將 intent 固定為 `product_recommendation`，並設定：
  - `follow_up = product_reference`
  - `reference_product_code = Pxxx`
  - `budget` 不從 ordinal 數字抽取

驗收：

- `第二個多少錢` 回覆第二個商品資訊。
- `第2個可以嗎` 不得解析成 `budget = 2`。
- `這款還有現貨嗎` 需延續上一個商品並顯示庫存。
- `它適合通勤嗎` 需延續上一個商品並回答適合情境。

### 2. 預算範圍解析

問題：

- `1000 到 2000`
- `一千到兩千`
- `1000-2000`
- `500~1000`
- `1k 到 2k`
- `1-2k`
- `一千以上兩千以下`
- `兩千到三千`

目前常見誤判：

- 只抓第一個數字。
- `1-2k` 被解析成 `1`。
- 中文範圍只抓前段。

設計：

- 新增 budget parser，回傳結構化資料：
  - `min_budget`
  - `max_budget`
  - `budget`
  - `budget_source`
- 對商品推薦預算篩選，預設使用 `max_budget` 作為上限。
- 支援分隔詞：
  - `到`
  - `至`
  - `-`
  - `~`
  - `～`
  - `以上...以下`
- 支援單位：
  - `k`
  - `千`
  - `元`
  - 中文數字
- 排除 ordinal 來源數字，例如 `第二個`、`第2個`。

驗收：

- `1000 到 2000` 解析為 `max_budget = 2000`。
- `1-2k` 解析為 `max_budget = 2000`。
- `一千以上兩千以下` 解析為 `max_budget = 2000`。
- `第二個多少錢` 不得建立任何 budget。

### 3. 退貨資料累積與自然格式解析

問題：

- `王小明 0912345678 RC123456789TW`
- `退貨資料：王小明，0912345678，RC123456789TW`
- `只有這個 RC123456789TW`
- 使用者分三次補：`貨號...`、`電話...`、`姓名...`

目前常見誤判：

- 未標籤姓名抓不到。
- 在退貨上下文中，只有貨號時可能變成 `out_of_scope`。
- 缺少跨訊息累積欄位。

設計：

- 將退貨資料解析從「只看當前訊息」改為「當前訊息 + 最近退貨上下文」。
- 在退貨上下文中，裸露的 `RC/TRK/SHIP/RAC/ORD` 類編號視為 `delivery_no` 候選。
- 當同一句同時有手機與貨號時，允許推測 2-4 字中文姓名。
- 將已收集欄位寫入 ticket summary 或 ai decision raw data，下一輪可繼續補齊。
- 必要欄位齊全後一律 `needs_review`，回覆「請稍後，客服人員將很快為您服務。」

驗收：

- `王小明 0912345678 RC123456789TW` 可抓到三個欄位。
- `只有這個 RC123456789TW` 在退貨上下文中仍是 `return_request`。
- 分段補齊後可轉人工，不重複追問已提供資料。

### 4. `客服` 字眼歧義處理

問題：

- `我想找客服幫我推薦商品`
- `找客服查貨態`

目前常見誤判：

- 因為出現 `客服` 就被判成 `human_handoff`。

設計：

- 調整 routing 優先序。
- 若句子同時包含明確任務，先走任務 intent：
  - 推薦、商品、預算、用途：`product_recommendation`
  - 查貨、貨態、物流、訂單：`order_status`
  - 退貨、退款、換貨、破損：`return_request`
- 只有明確包含以下語意才轉人工：
  - `真人`
  - `人工`
  - `專人`
  - `轉人工`
  - `客服人員接手`
  - `我要人處理`

驗收：

- `我想找客服幫我推薦商品` 不轉人工，需追問預算或用途。
- `找客服查貨態` 不轉人工，需追問訂單編號或物流單號。
- `我要找真人客服` 仍轉人工。

### 5. 排除條件與負向偏好

問題：

- `不要耳機，有沒有杯子`
- `不要保養，送禮用`
- `不要這款，換杯子`

目前常見誤判：

- 有時仍推薦被排除的品類。
- 負向詞只對「前次商品」有效，不一定對品類有效。

設計：

- 新增 negative preference parser。
- 解析 `不要`、`不想要`、`別`、`排除` 後面的商品、品類、用途字詞。
- 設定：
  - `exclude_product_codes`
  - `exclude_categories`
  - `exclude_keywords`
- 商品排序前先排除命中的品項。

驗收：

- `不要耳機，有沒有杯子` 不得優先推薦耳機。
- `不要保養，送禮用` 不得優先推薦保養商品。
- `不要這款，換杯子` 應優先推薦杯類或生活用品。

### 6. 多意圖處理策略

問題：

- `我要退貨，順便查 RAC1001 貨態`
- `我想先查貨態，但收到壞掉也想退`

目前狀態：

- 系統會選一個主要 intent，另一個需求被忽略。

設計：

- MVP 不做多 intent 並行流程。
- 偵測到多個強任務 intent 時，改為請使用者先選一件事處理。
- 若包含退貨或客訴，優先建立 `needs_review` 並把另一個需求寫入客服摘要。

驗收：

- 多意圖句不得默默忽略第二個需求。
- 客服後台摘要需看得到兩個需求。

## 實作順序

1. 新增測試案例，先把五輪盲點轉成自動測試。
2. 實作商品指代解析，處理 ordinal 與 pronoun。
3. 實作預算範圍 parser，避免 ordinal 數字污染預算。
4. 實作退貨資料累積與未標籤姓名解析。
5. 調整 `客服` routing 優先序。
6. 加入負向偏好排除。
7. 加入多意圖提示與後台摘要。
8. 跑本機自動測試與 syntax check。
9. 推到 feature branch，使用 Vercel Preview 驗證。
10. 通過後合併 `main`，再讓 Vercel production 更新。

## 測試策略

### 自動測試

新增或擴充：

- `tests/recommendation.test.js`
- `tests/chat-service.test.js`
- `tests/order-status.test.js`
- `tests/return-request.test.js`

每個盲點至少一個 failing-first 測試。

### 手動測試

在 preview URL 測：

- 桌面尺寸
- 手機尺寸
- 點商品詳情再返回
- 評分後鎖定對話
- 後台工單摘要

### Production smoke

合併到 `main` 後，測：

- `/api/health`
- FAQ
- 商品推薦與追問
- 商品第二個/這款/它
- 退貨分段補資料
- 查貨態
- 轉人工
- 評分與後台紀錄

## 不在本階段處理

- 更換模型供應商。
- 真實 LINE、Email、付款、庫存 API 串接。
- 多商品結帳流程。
- 真正的圖片 AI 辨識。
- 完整 CRM 權限系統。

## 風險

- 過多 deterministic guardrail 可能讓規則互相干擾，因此每次修正都需要回歸測試 FAQ、退貨、查貨態、商品推薦、轉人工。
- Groq classification 仍可能和本機 guardrail 結果不同，因此 preview 需要至少跑一輪 live API 測試。
- 若直接合併到 `main`，production 會自動部署；建議先用 preview 驗證後再 merge。
