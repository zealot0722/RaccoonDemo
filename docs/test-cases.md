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
- 商品資訊與商品詳情連結出現在聊天訊息內
- 商品圖片直接顯示在商品卡，不只顯示圖片路徑文字
- 已推薦過的商品會出現在客戶頁右下角的歷史紀錄小區塊
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
- 若缺少用途，回覆可使用「請問您要用來做什麼呢？」這類柔和追問
- 回覆稱呼使用「您」

## 查貨態

Input:

```text
我想查 RAC1001 的貨態
```

Expected:

- `intent = order_status`
- 命中 demo 貨態資料
- 回覆包含 `RAC1001`、`RC123456789TW` 與 `配送中`
- 後台可看到 AI decision 與查詢摘要

## 查貨態條件不足

Input:

```text
我想查貨態
```

Expected:

- `intent = order_status`
- 不建立查不到資料的假結果
- 回覆追問訂單編號或物流單號

## 查貨態查無資料

Input:

```text
請幫我查 RAC9999 的貨態
```

Expected:

- `intent = order_status`
- `decision = needs_review`
- 回覆包含緩和用語，例如「十分抱歉」
- 後台工單摘要包含客戶訊息、查詢資料與轉人工原因

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
- 工單摘要整理客戶訊息、AI 判斷與轉人工原因，供客服接手
- 後台顯示 handoff reason

## 退貨申請資料不足

Input:

```text
我要退貨
```

Expected:

- `intent = return_request`
- 不直接當一般 FAQ 結案
- 回覆包含「請提供您的送貨貨號、姓名、電話號碼」
- 商品照片可上傳作為附件，但不是退貨申請必填欄位
- 不顯示評分，也不追加「請問您還有其他問題需要協助嗎？」

## 退貨申請轉人工

Steps:

1. 輸入 `我要退貨`
2. AI 追問退貨資料
3. 輸入 `送貨貨號 RC123456789TW，姓名王小明，電話 0912345678`

Expected:

- 第二則使用者訊息仍被判斷為 `return_request`
- `decision = needs_review`
- 建立待處理工單
- 工單摘要是 `客服摘要：退貨申請` 格式，包含退貨資料
- 客服後台可看到對話紀錄與 AI 轉人工原因

## 退貨照片附件

Steps:

1. 輸入 `我要退貨`
2. 使用聊天輸入區的「上傳照片」選擇商品照片
3. 補上 `送貨貨號 RC123456789TW，姓名王小明，電話 0912345678`

Expected:

- 照片在聊天訊息中顯示縮圖
- 後台對話紀錄可看到附件縮圖
- 工單摘要包含附件張數

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

## 模糊結束語

Input:

```text
謝謝，先這樣就好
```

Expected:

- 不是本地明確結束語
- 交給 Groq 語意分類
- 若 Groq 回傳 `intent = conversation_end`，才顯示 CSAT 評分
- 若訊息仍包含新問題，例如 `謝謝，那退貨怎麼辦？`，應繼續回答 FAQ，不顯示評分

## 客服後台

Steps:

1. 進入 `/admin`
2. 選擇一張工單
3. 查看 AI 判斷、對話紀錄、商品代號、CSAT
4. 輸入 mock 客服回覆

Expected:

- 新增一筆 `agent` message
- 工單狀態更新為 `in_progress`
