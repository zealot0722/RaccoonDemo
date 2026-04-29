# Demo 測試案例

測試前請先確認 Vercel 已設定 `DEMO_ACCESS_CODE`，並在前台輸入試用碼。

## FAQ

Input:

```text
請問商品可以退貨嗎？
```

Expected:

- `intent = faq`
- 命中 `F001`
- 客戶頁回覆退貨 FAQ
- 後台可看到 matched FAQ

## 商品推薦

Input:

```text
我想找 1000 元內的新手商品
```

Expected:

- `intent = product_recommendation`
- 推薦 1-3 個商品
- 至少推薦 `P001 入門保養組`
- 商品資訊、圖片與商品詳情連結出現在聊天訊息內
- 客戶頁右側不顯示 AI 判斷面板

## 條件不足

Input:

```text
推薦商品
```

Expected:

- `intent = product_recommendation`
- 不直接推薦商品
- 回覆追問預算、用途或品類
- 回覆稱呼使用「您」

## 上下文追問

Steps:

1. 輸入 `推薦商品`
2. AI 追問條件
3. 輸入 `1000 元以內，新手入門`

Expected:

- 第二則使用者訊息仍被判斷為 `product_recommendation`
- 系統讀到前文，不會把補充條件當成 out_of_scope
- 回覆推薦商品資訊與連結

## 轉人工

Input:

```text
我要找真人客服
```

Expected:

- `intent = human_handoff`
- `decision = needs_review`
- 建立待處理工單
- 後台顯示 handoff reason

## 客訴

Input:

```text
你們服務太差了，我要客訴
```

Expected:

- `intent = complaint`
- `tone = angry`
- `decision = needs_review`
- 建立高優先或待處理工單

## CSAT 評分

Steps:

1. 完成任一輪 AI 回覆
2. AI 詢問「請問您還有其他問題需要協助嗎？」
3. 若仍有問題，繼續輸入問題，評分不顯示
4. 輸入 `沒有了`
5. 客戶頁顯示 1-5 分評分
6. 可選填文字回饋

Expected:

- 一般回覆後不直接顯示評分
- 使用者表示沒有其他問題後才顯示評分
- `/api/feedback` 回傳 `{ "ok": true }`
- Supabase 寫入 `csat_feedback`
- 若 production DB 尚未新增 `csat_feedback`，回退寫入 `messages` 的 system 訊息
- 後台可看到該工單的 CSAT

## 客服後台

Steps:

1. 進入 `/admin`
2. 選擇一張工單
3. 查看 AI 判斷、對話紀錄、商品代號、CSAT
4. 輸入 mock 客服回覆

Expected:

- 新增一筆 `agent` message
- 工單狀態更新為 `in_progress`
