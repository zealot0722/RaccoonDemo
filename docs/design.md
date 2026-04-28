# Raccoon AI Support Demo 設計說明

## 選用工具原因

本 demo 使用 Codex/ChatGPT 進行 Vibe coding，原因是它可以同時讀取既有 HCT 交接資料、整理規格、產生前後端程式、撰寫 SQL 與文件，並用測試驗證決策邏輯。部署架構選擇 Vercel + Supabase + Groq，因為三者能提供穩定 URL、雲端資料庫與真實 LLM 語意判斷，不需要本機 n8n 長時間運作。

公開 demo 會設定 `DEMO_ACCESS_CODE`。展示碼不是正式登入系統，但能避免任何人直接打 `/api/chat` 消耗 Groq 額度。

## Prompt 設計

### Intent Classification Prompt

系統要求模型只回傳 JSON，欄位包含：

```json
{
  "intent": "product_recommendation",
  "confidence": 0.86,
  "summary": "使用者想找適合新手的商品",
  "tone": "neutral",
  "need_human": false,
  "budget": 1000,
  "category": "",
  "use_case": "新手入門",
  "missing_fields": [],
  "keywords": ["新手", "商品"]
}
```

可用 intent：

- `faq`
- `product_recommendation`
- `order_status`
- `complaint`
- `human_handoff`
- `out_of_scope`
- `chitchat`

### Reply Generation Prompt

回覆生成 prompt 會提供：

- 使用者原始訊息
- 分類結果
- 命中的 FAQ
- 候選商品清單

規則是使用繁體中文、FAQ 不編造政策、商品推薦需說明推薦理由、資訊不足時先追問、需要真人時明確告知已建立工單。

## 判斷邏輯 Criteria

- 使用者明確要求真人：`decision = needs_review`
- `intent = complaint`：`decision = needs_review`
- `tone = angry`：`decision = needs_review`
- `confidence < 0.5`：`decision = needs_review`
- FAQ 查無資料且 `confidence < 0.7`：`decision = needs_review`
- 商品推薦缺少預算或用途：自動追問，不轉人工
- 商品推薦條件足夠：查 `products` 並回傳 1-3 張商品卡
- 其他未觸發風險：`decision = auto_reply`

## 範例 Input / Output

### FAQ

Input：

```text
請問商品可以退貨嗎？
```

Output：

```text
商品到貨後七天內可申請退換貨，請保留完整包裝與購買資訊。
```

AI 判斷：

```json
{
  "intent": "faq",
  "confidence": 0.78,
  "decision": "auto_reply",
  "matched_faq": "F001"
}
```

### 商品推薦

Input：

```text
我想找 1000 元內的新手商品
```

Output：

```text
依照你的需求，我推薦 P001 入門保養組。下方卡片有價格、圖片、庫存與推薦理由。
```

商品卡：

```text
P001｜入門保養組
Raccoon Starter Care Kit
NT$ 890
適合：新手入門、日常使用、送禮
```

### 轉人工

Input：

```text
我要找真人客服
```

Output：

```text
我已經幫你建立待處理工單，真人客服會接手確認。
```

AI 判斷：

```json
{
  "intent": "human_handoff",
  "decision": "needs_review",
  "handoff_reason": "使用者明確要求真人客服，建立待處理工單。"
}
```

## 待改進內容

- 串接真實商品資料與庫存 API。
- 加入多輪對話記憶，讓使用者補充預算或用途時沿用前文。
- 加入向量搜尋，提高 FAQ 命中率。
- 串接 LINE、Email 或客服系統，讓 mock 後台變成真實通知流程。
- 增加管理員登入、權限與稽核紀錄。
- 加入 IP/session rate limit，進一步降低公開 API 被濫用的風險。
