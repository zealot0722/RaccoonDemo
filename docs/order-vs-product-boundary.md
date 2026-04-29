# 查貨態與商品推薦分界設計

## 目標

避免使用者想查訂單或物流狀態時，被商品推薦上下文誤導成 `product_recommendation`。

這個分界要同時保留兩種能力：

- 查貨態：查訂單、物流、包裹、配送進度。
- 商品資訊：查推薦商品是否有庫存、是否現貨、是否適合用途。

## Intent 優先順序

同一句話命中多個訊號時，優先順序如下：

1. `human_handoff`：明確真人、人工、專人。
2. `complaint` / `return_request`：客訴、退貨、破損。
3. `order_status`：訂單、物流、包裹、配送進度、貨態。
4. `product_recommendation`：推薦商品、改預算、換品項、商品庫存。
5. `faq` / `chitchat` / `unclear`。

`order_status` 一旦由 deterministic routing 命中，不得再被商品上下文覆寫。

## 查貨態訊號

判為 `order_status`：

- 明確貨態詞：
  - `查貨態`
  - `貨態`
  - `物流`
  - `物流單號`
  - `配送進度`
  - `出貨`
  - `到貨`
  - `包裹`
  - `訂單`
- 口語物流問題：
  - `怎麼還沒到`
  - `我的包裹在哪`
  - `物流到哪`
  - `還沒收到`
- 查詢動詞 + 訂單/物流編號：
  - `幫我查 RAC1001`
  - `查一下 RC123456789TW`
  - `RAC1001 現在到哪`
- 在已追問訂單編號或物流單號後，裸編號也判為 `order_status`：
  - `RAC1001`
  - `RC123456789TW`

## 商品資訊訊號

判為 `product_recommendation` 或商品上下文延續：

- 推薦需求：
  - `推薦商品`
  - `我想找 1000 元內`
  - `有其他的嗎`
  - `不要這款`
- 商品指代 + 庫存/現貨：
  - `這款有庫存嗎`
  - `這款有現貨嗎`
  - `第二個有貨嗎`
- 商品指代 + 適用情境：
  - `它適合通勤嗎`
  - `第二個適合送禮嗎`

## 分界規則

| 使用者輸入 | 上下文 | 預期 intent | 原因 |
|---|---|---|---|
| `我想查貨態` | 無 | `order_status` | 明確貨態詞 |
| `我想查貨態` | 剛推薦商品 | `order_status` | 明確貨態詞優先於商品上下文 |
| `幫我查 RAC1001` | 剛推薦商品 | `order_status` | 查詢動詞 + 訂單編號 |
| `查一下 RC123456789TW` | 剛推薦商品 | `order_status` | 查詢動詞 + 物流單號 |
| `我的包裹在哪` | 剛推薦商品 | `order_status` | 包裹/物流問題 |
| `這款有庫存嗎` | 剛推薦商品 | `product_recommendation` | 商品指代 + 庫存，不是物流貨態 |
| `這款有現貨嗎` | 剛推薦商品 | `product_recommendation` | 商品指代 + 現貨，不是物流貨態 |
| `第二個有貨嗎` | 多商品推薦後 | `product_recommendation` | 商品序號指代 |
| `RAC1001` | AI 剛追問訂單/物流單號 | `order_status` | 已有查貨態上下文 |
| `RAC1001` | 剛推薦商品，沒有查貨態上下文 | `out_of_scope` 或追問確認 | 裸編號沒有足夠上下文，避免誤查或誤推薦 |

## 實作策略

- 在 workflow routing 中先判定 `order_status`。
- `enrichProductClassification` 不得覆寫 protected intents：
  - `order_status`
  - `return_request`
  - `human_handoff`
  - `complaint`
  - `unclear`
- 商品上下文只可覆寫低風險 intent：
  - `chitchat`
  - `out_of_scope`
  - `faq`，且訊息必須有商品指代、預算、用途、換品項等商品訊號。
- 預算 parser 不解析訂單/物流編號中的數字：
  - `RAC1001`
  - `RC123456789TW`
  - `ORD1234`

## 驗收

- 商品上下文後輸入 `幫我查 RAC1001` 不得推薦商品。
- 商品上下文後輸入 `查一下 RC123456789TW` 不得推薦商品。
- 商品上下文後輸入 `這款有現貨嗎` 仍要查商品庫存。
- 訂單上下文後輸入裸編號要查貨態。
