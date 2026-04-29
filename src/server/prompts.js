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
- product_recommendation
- order_status
- complaint
- human_handoff
- conversation_end
- out_of_scope
- chitchat

conversation_end 用於使用者表示本次對話已結束，例如「謝謝，先這樣」、「目前沒有其他問題」。
若句子同時包含新問題，例如「謝謝，那退貨怎麼辦？」，不要分類為 conversation_end。
order_status 用於使用者查詢訂單、物流、出貨、配送進度或貨態。
若可辨識訂單編號或物流單號，請填入 order_no 或 tracking_no；若沒有可用編號，兩者留空，missing_fields 填入 ["order_identifier"]。

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
若推薦商品，請在訊息內直接列出商品代號、中文名稱、原文名稱、價格、庫存、適合情境、推薦理由與詳情連結。`
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
