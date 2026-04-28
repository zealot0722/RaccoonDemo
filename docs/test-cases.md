# Demo 測試案例

## FAQ

若部署環境設定 `DEMO_ACCESS_CODE`，先在首頁輸入展示碼。

Input：

```text
請問商品可以退貨嗎？
```

Expected：

- `intent = faq`
- 命中 `F001 退換貨政策`
- 自動回覆，不轉人工

## 商品推薦

Input：

```text
我想找 1000 元內的新手商品
```

Expected：

- `intent = product_recommendation`
- 回傳 1-3 張商品卡
- 至少推薦 `P001 入門保養組`
- 商品卡顯示中文名稱、原文名稱、圖片、價格、庫存與連結

## 條件不足

Input：

```text
推薦商品
```

Expected：

- `intent = product_recommendation`
- 不直接推薦商品
- 追問預算與用途

## 轉人工

Input：

```text
我要找真人客服
```

Expected：

- `intent = human_handoff`
- `decision = needs_review`
- 建立工單
- 後台可看到 handoff reason

## 客訴

Input：

```text
你們服務太差了，我要客訴
```

Expected：

- `intent = complaint`
- `tone = angry` 或 `frustrated`
- `decision = needs_review`
- 建立待處理工單

## 範圍外

Input：

```text
幫我寫履歷
```

Expected：

- `intent = out_of_scope` 或低信心分類
- 不編造商品或政策
- 引導回 FAQ 或商品推薦範圍

## 後台

Steps：

1. 開啟 `/admin`
2. 點選 `T001` 或新建立的工單
3. 查看對話紀錄與 AI 判斷
4. 輸入 mock 客服回覆

Expected：

- 新增一筆 `agent` message
- 工單狀態改為 `in_progress`
