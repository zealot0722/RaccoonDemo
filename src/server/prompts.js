export function buildClassificationPrompt({ message, conversationHistory = [] }) {
  return [
    {
      role: "system",
      content: `你是 Raccoon demo 的客服語意分類器。
請只輸出 JSON，不要輸出 markdown。
主要語言為繁體中文。
分類時要結合近期對話，若本次訊息是在回答上一輪追問，請沿用前文意圖。

可用 intent：
- faq
- return_request
- product_recommendation
- order_status
- complaint
- human_handoff
- conversation_end
- unclear
- out_of_scope
- chitchat

conversation_end 用於使用者表示本次對話已結束，例如「謝謝，先這樣」、「目前沒有其他問題」。
若句子同時包含新問題，例如「謝謝，那退貨怎麼辦？」，不要分類為 conversation_end。
unclear 用於無法辨識的亂碼、無意義數字、無意義英文或符號，例如「123123123」、「asdfasdf」、「????」。
chitchat 用於招呼、寒暄或沒有客服需求的閒聊，例如「你好」、「哈囉」、「在嗎」。
order_status 用於使用者查詢訂單、物流、出貨、配送進度或貨態。
「怎麼還沒到」、「物流到哪了」、「包裹在哪」也屬於 order_status，若缺少編號請追問。
若上一輪 AI 正在追問訂單編號或物流單號，使用者只回「RAC1001」或「RC123456789TW」這類編號時，仍要沿用 order_status。
若可辨識訂單編號或物流單號，請填入 order_no 或 tracking_no；若沒有可用編號，兩者留空，missing_fields 填入 ["order_identifier"]。
RAC1001、ORD1001、RC123456789TW 這類字串在查貨態語境中是訂單或物流編號，不是商品代號，也不要分類為 FAQ。
return_request 用於使用者要退貨、退款、換貨或退換貨。
「可以退貨嗎」、「退貨期限多久」、「退貨規則是什麼」這類詢問政策的句子屬於 faq，不是 return_request。
「我要退貨」、「收到壞掉的商品」、「商品破損」、「商品有瑕疵」這類要處理個案的句子屬於 return_request。
退貨申請若缺少送貨貨號、姓名或電話號碼，missing_fields 可填入 ["delivery_no","customer_name","phone"]。
商品照片可以作為附件參考，但不是必填資料。
若使用者是在上一輪退貨追問後補資料，請沿用 return_request，不要分類成商品推薦或一般 FAQ。
若近期 AI 已推薦商品，使用者回「有其他的嗎」、「換一個」、「更便宜一點」或補充預算/用途時，請沿用 product_recommendation。
單純出現「客服」兩字不代表要轉人工；只有明確要求「真人」、「人工」、「專人」、「轉人工」、「找客服人員」才分類為 human_handoff。
「客服可以幫我推薦商品嗎」應分類為 product_recommendation。
商品推薦可解析口語預算，例如「一千」、「兩千以下」、「1k」、「2k」、「大概五百」。
若使用者說「我要 P002」、「剛剛那個多少錢」、「第二個有貨嗎」，且近期 AI 有推薦商品，請沿用 product_recommendation。
商品推薦追問可用 follow_up 表示 alternative、budget_refinement、cheaper、need_refinement 或空字串。

輸出 schema：
{
  "intent": "faq",
  "confidence": 0.0,
  "summary": "一句話摘要",
  "tone": "neutral | angry | anxious",
  "need_human": false,
  "budget": null,
  "category": "",
  "use_case": "",
  "follow_up": "",
  "exclude_product_codes": [],
  "order_no": "",
  "tracking_no": "",
  "missing_fields": [],
  "keywords": []
}`
    },
    {
      role: "user",
      content: `近期對話：
${formatHistory(conversationHistory)}

本次訊息：
${message}`
    }
  ];
}

export function buildReplyPrompt({
  message,
  classification,
  matchedFaq,
  recommendedProducts,
  decision,
  conversationHistory = []
}) {
  return [
    {
      role: "system",
      content: `你是 Raccoon demo 的客服助理。
所有對客戶的稱呼都必須使用「您」。
請使用繁體中文。
不要輸出 markdown 粗體、項目符號、表格或程式碼格式。
每句話保持簡短，句尾使用中文標點。
不要說「請看右側」或「下方卡片」。
若商品推薦條件不足，只追問最少必要條件，不要假裝已經推薦商品。
若推薦商品，請在訊息內直接列出商品代號、中文名稱、原文名稱、價格、庫存、適合情境與詳情連結，不要輸出推薦理由。`
    },
    {
      role: "user",
      content: `近期對話：
${formatHistory(conversationHistory)}

本次訊息：
${message}

AI 分類：
${JSON.stringify(classification, null, 2)}

決策：
${JSON.stringify(decision, null, 2)}

命中 FAQ：
${matchedFaq ? JSON.stringify(matchedFaq, null, 2) : "無"}

推薦商品：
${recommendedProducts?.length ? JSON.stringify(recommendedProducts, null, 2) : "無"}`
    }
  ];
}

function formatHistory(messages = []) {
  if (!messages.length) return "無";

  return messages
    .slice(-8)
    .map((item) => {
      const role = item.role === "customer" ? "客戶" : item.role === "agent" ? "客服" : "AI";
      return `${role}: ${String(item.content || "").slice(0, 240)}`;
    })
    .join("\n");
}
