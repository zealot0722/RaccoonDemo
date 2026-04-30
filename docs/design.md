# Raccoon AI Support Demo 設計說明

## 產品定位

此 demo 拆成兩個角色：

- 客戶頁 `/`：只保留聊天、商品資訊、商品連結與對話結束後評分。
- 客服後台 `/admin`：顯示工單、對話紀錄、AI intent、confidence、decision、handoff reason、推薦商品代號與 CSAT。

這樣避免客戶看到內部判斷面板，也避免客服頁出現對處理工單沒有幫助的右側商品展示。

## 參考 HCT AI 客服的機制

原 HCT workflow 的核心概念是：

- 格式化輸入。
- 分流一般訊息、對話結束與 CSAT。
- 建立 ticket 與 messages。
- Groq 分類。
- KB 查詢。
- 集中決策 `auto_reply / human_review / error`。
- 轉人工時建立待處理工單。
- 客服回覆寫回 messages。

本 demo 對應成：

- `/api/chat`：格式化輸入、讀取近期對話、Groq 分類、查 FAQ/products/order_statuses、判斷退貨資料是否足夠、決策、寫入 tickets/messages/ai_decisions。
- `/api/tickets`：客服後台讀取工單與對話。
- `/api/tickets/[id]`：客服後台更新工單後續處置與分級，例如未完成、已完成、緊急。
- `/api/tickets/[id]/reply`：mock 客服回覆。
- `/api/feedback`：客戶明確表示沒有其他問題後才顯示評分，寫入 `csat_feedback` 或回退寫入 `messages`。

## Prompt 設計

### Intent Classification

分類 prompt 會收到近期對話與本次訊息，近期對話包含客戶訊息與 AI 回覆。若本次訊息是回答上一輪追問，例如先輸入「推薦商品」，下一句補「1000 元以內，新手入門」，分類器要沿用商品推薦意圖。若 AI 已經推薦過商品，客戶回「有其他的嗎」、「更便宜一點」或補充預算時，也要沿用商品推薦意圖，並由後端排除前次已推薦商品後重新排序。

輸出 JSON：

```json
{
  "intent": "product_recommendation",
  "confidence": 0.86,
  "summary": "客戶想找 1000 元內的新手商品",
  "tone": "neutral",
  "need_human": false,
  "budget": 1000,
  "category": "",
  "use_case": "新手入門",
  "follow_up": "",
  "exclude_product_codes": [],
  "order_no": "",
  "tracking_no": "",
  "missing_fields": [],
  "keywords": ["新手", "推薦"]
}
```

### Reply Generation

回覆規則：

- 所有對客戶的稱呼使用「您」。
- 不輸出 markdown 粗體、表格、項目符號或程式碼格式。
- 每句話簡短，句尾用中文標點。
- 不說「請看右側」或「下方卡片」。
- 條件不足時只追問必要條件。
- 推薦商品時，訊息中直接列出商品代號、中文名稱、原文名稱、價格、庫存、適合情境與詳情連結；推薦理由保留在後台或 AI 判斷資料中，不出現在客戶訊息。
- 商品圖片由前端商品卡直接顯示，不在回覆文字中只丟圖片路徑。
- 商品詳情連結使用 app 內導覽，同一分頁返回客服頁時不重置對話；同時把本分頁對話暫存在 `sessionStorage`，避免意外重載後看不到剛才的對話。
- 查貨態時，若缺少訂單編號或物流單號，先柔和追問；若查不到資料，建立待客服確認的工單。
- 退貨申請先要求送貨貨號、姓名與電話號碼；商品照片可上傳作為附件，但不是必填。
- 客服後台 summary 使用 `客服摘要：...` 的精簡格式，保留處理狀態、必要資料與轉人工原因。
- 一般回答完成後詢問「請問您還有其他問題需要協助嗎？」。
- 使用者回覆「沒有了」、「謝謝」、「不用了」等結束語後，才顯示 CSAT 評分。
- 使用者完成 CSAT 評分後，客戶聊天輸入會鎖定，並顯示「請關閉此視窗，如有其他需求請重新整理或另開視窗。」
- 明確結束語由本地規則直接判斷；模糊結束語交給 Groq 分類為 `conversation_end` 後才顯示評分。
- 若句子同時包含新問題，例如「謝謝，那退貨怎麼辦？」，不可視為對話結束，應繼續回答問題。
- 亂碼、無意義數字、無意義英文或符號會分類為 `unclear`；招呼語或純閒聊會分類為 `chitchat`。
- `unclear` 第 1-2 次會請客戶重新敘述問題，不顯示商品卡；單獨 `?`、`？`、`??`、純符號與無意義數字都走此邏輯。
- 同一客戶連續 3 次 `unclear/chitchat` 時，API 會回傳 `autoClosed = true`，前端鎖定輸入並顯示「若您無待處理問題，本次對話將會關閉」。
- 客服後台左側工單欄固定高度並可滾動，上方顯示全部、未完成、待接手、緊急與已完成數量。

## 決策 criteria

- 使用者要求真人：`decision = needs_review`
- `intent = complaint`：`decision = needs_review`
- `tone = angry`：`decision = needs_review`
- `confidence < 0.5`：`decision = needs_review`
- FAQ 查無資料且 `confidence < 0.7`：`decision = needs_review`
- 商品推薦缺少預算或用途：`decision = auto_reply`，但只追問條件，不回傳商品
- 商品推薦條件足夠：查 `products`，回傳 1-3 個商品並顯示在聊天訊息內
- 商品推薦 follow-up：讀取近期 AI 回覆中的商品代號與價格；「有其他的嗎」排除前次商品，「更便宜一點」優先推薦更低價商品，後續補預算時以新預算重新排序。
- `unclear`：`decision = auto_reply`，請客戶重新敘述問題，不附預設商品卡。
- `chitchat`：`decision = auto_reply`，請客戶描述實際客服需求。
- 連續 3 次 `unclear/chitchat`：`conversationEnded = true` 並鎖定前端輸入。
- 查貨態缺少訂單編號或物流單號：`decision = auto_reply`，只追問必要編號
- 查貨態命中 `order_statuses` 或 demo fallback：`decision = auto_reply`
- 查貨態查無資料：`decision = needs_review`，並把客戶訊息、查詢資料與轉人工原因整理到客服後台
- 退貨申請缺少送貨貨號、姓名或電話號碼：`decision = auto_reply`，請客戶補資料
- 退貨申請資料齊全：`decision = needs_review`，整理退貨資料到客服後台
- 多意圖：先拆出可處理的 `faq`、`order_status`、`product_recommendation`、`return_request` 逐步回覆；只有包含明確真人、客訴、低信心或退貨資料齊全需要人工判斷時才 `needs_review`。

## 範例

### 商品資訊不足追問

Input:

```text
推薦商品
```

Output:

```text
可以的，我先幫您縮小範圍。
請問您要用來做什麼呢？如果方便，也可以一起告訴我大約預算或想找的品類。
```

### 商品推薦

Input:

```text
我想找 1000 元內的新手商品
```

Output excerpt:

```text
依照您的需求，我先幫您整理幾個比較適合的選項。

P001｜入門保養組
原文名稱：Raccoon Starter Care Kit
價格：NT$ 890
庫存：現貨
適合情境：新手入門、日常使用、送禮
詳情連結：/products/P001
```

### 商品推薦追問

Input:

```text
有其他的嗎？
```

Expected:

```text
系統會讀取上一則 AI 回覆曾推薦的商品代號，排除該商品後再推薦其他品項。
```

### 查貨態

Input:

```text
請幫我查 RAC1001 的貨態
```

Output excerpt:

```text
我幫您查到目前的貨態如下。
訂單編號：RAC1001
物流單號：RC123456789TW
目前狀態：配送中
```

### 轉人工

Input:

```text
我要找真人客服
```

Output:

```text
請稍後，客服人員將很快為您服務。
```

### 退貨申請

Input:

```text
我要退貨
```

Output:

```text
請提供您的送貨貨號、姓名、電話號碼。
若方便，您也可以上傳商品照片供客服參考。
收到必要資料後，我會把退貨申請轉交客服人員確認。
```

Follow-up input:

```text
送貨貨號 RC123456789TW，姓名王小明，電話 0912345678
```

Expected:

```text
請稍後，客服人員將很快為您服務。
```

## 待改進

- 加入正式登入系統與角色權限。
- 加入 rate limit。
- 將 CSAT 與回覆品質調整流程接到分析後台。
- 串接真實 LINE、Email、庫存與訂單 API。
- 用 production migration 工具管理 Supabase schema 版本。
