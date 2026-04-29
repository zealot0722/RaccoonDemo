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
- 點擊商品詳情後使用 app 內導覽，返回客戶頁時原對話仍保留
- 客戶頁右側不顯示 AI 判斷面板

## 商品資訊不足追問

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

## 不明輸入與閒聊

Input:

```text
123123123
```

Expected:

- `intent = unclear`
- 不因上一輪商品上下文誤判成正式商品推薦
- 回覆包含「請您重新敘述您的問題」
- 可顯示預設商品卡，並提示「您可以考慮下面產品」

Input:

```text
哈囉
```

Expected:

- `intent = chitchat`
- 回覆請客戶重新敘述或描述實際客服需求
- 不追加「請問您還有其他問題需要協助嗎？」

Steps:

1. 連續輸入三次無法辨識的內容，例如 `asdfasdf`、`987987987`、`123123123`

Expected:

- 第三次回傳 `autoClosed = true`
- 回覆包含「若您無待處理問題，本次對話將會關閉」
- 客戶聊天輸入被鎖定
- 對話進入評分或結束流程

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

## 查貨態長尾口語

Input:

```text
RAC1004的東西在哪
```

Expected:

- `intent = order_status`
- 命中 demo 貨態資料
- 回覆包含 `RAC1004`、`RC555666777TW` 與目前狀態
- 不轉人工

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
- 客戶頁回覆為「請稍後，客服人員將很快為您服務。」
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

## 商品推薦追問其他品項

Steps:

1. 輸入 `我想找 1000 元內的新手商品`
2. AI 推薦 `P001 入門保養組`
3. 輸入 `有其他的嗎？`

Expected:

- 第三則使用者訊息仍被判斷為 `product_recommendation`
- 系統讀到前一則 AI 回覆中的 `P001`
- 新推薦排除 `P001`，改推其他符合預算或相近條件的品項

## 商品推薦追問更低預算

Steps:

1. AI 已追問或推薦商品
2. 輸入 `預算 600 元以內` 或 `有沒有更便宜一點的？`

Expected:

- `follow_up` 為 `budget_refinement` 或 `cheaper`
- 回覆改推更符合新預算或更低價的商品
- 不把補充預算誤判成閒聊或範圍外問題

## 轉人工

Input:

```text
我要找真人客服
```

Expected:

- `intent = human_handoff`
- `decision = needs_review`
- 建立待處理工單
- 客戶頁回覆為「請稍後，客服人員將很快為您服務。」
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
- 客戶頁回覆為「請稍後，客服人員將很快為您服務。」
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
- 客戶完成評分後，聊天輸入、上傳照片與送出按鈕會被鎖定
- 系統訊息顯示「請關閉此視窗，如有其他需求請重新整理或另開視窗。」

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
4. 將後續處置改為未完成或已完成
5. 將工單分級改為一般或緊急
6. 輸入 mock 客服回覆

Expected:

- 後台上方顯示全部、未完成、待接手、緊急與已完成數量
- 左側工單列表限制高度，可用滾輪查看
- 工單卡顯示狀態與分級標示
- 更新後續處置會寫回 `tickets.status`
- 更新工單分級會寫回 `tickets.priority`
- 新增一筆 `agent` message
- 工單狀態更新為 `in_progress`

## 商品預算連續追問

Steps:

1. 輸入 `我要 1000 元以下的商品`
2. AI 推薦符合 1000 元以下的商品
3. 輸入 `我不要 1000 以下了，改 2000`
4. AI 應可推薦接近 2000 預算的商品，例如 `P002`
5. 輸入 `加碼到 5000`
6. AI 不應因示例商品都低於 5000 就回答「沒有商品」，仍應保留符合條件的商品推薦
7. 輸入 `那我最後確定要 2000 以下的`

Expected:

- `intent = product_recommendation`
- `follow_up = budget_refinement`
- 最後一輪仍保留上下文，優先推薦 `P002` 這類接近 2000 預算且已被確認合適的商品
- 不會因為商品曾經被推薦過，就在預算調整時排除它
- 只有在使用者明確說「有其他的嗎」、「換一個」、「更便宜」時，才排除已推薦商品

## 語意辨識邊界案例

Inputs / Expected:

- `請問商品可以退貨嗎？` 應分類為 `faq`，不是退貨申請。
- `收到壞掉的商品怎麼辦` 應分類為 `return_request`，並追問送貨貨號、姓名、電話號碼。
- `客服可以幫我推薦商品嗎` 應分類為 `product_recommendation`，不是 `human_handoff`。
- 商品推薦上下文中輸入 `預算大概一千`，應解析為 `budget = 1000` 與 `follow_up = budget_refinement`。
- `怎麼還沒到` 應分類為 `order_status`，並追問訂單編號或物流單號。
- 查貨態上下文中只輸入 `RAC1001`，應延續 `order_status` 並查詢貨態。
- 商品推薦上下文中輸入 `我要 P002`，應延續商品推薦並顯示 `P002`。
- 商品推薦上下文中輸入 `不要這個，有其他嗎`，應為 `follow_up = alternative`。
- 商品推薦上下文中輸入 `有沒有更便宜`，應為 `follow_up = cheaper`。

## 手機預設選項

Steps:

1. 使用手機尺寸開啟客戶客服頁
2. 點擊任一預設選項
3. 等待 AI 回覆

Expected:

- 預設選項區不因第一次點擊而消失
- 小螢幕下選項以雙欄顯示，極窄螢幕改為單欄
- 選項過多時只在選項區內垂直捲動，不靠水平捲動藏住其他按鈕
