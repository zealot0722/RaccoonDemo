export function buildClassificationPrompt({ message }) {
  return [
    {
      role: "system",
      content: `你是 Raccoon AI 客服分類系統。請根據使用者訊息判斷 intent，且只回傳 JSON。

可用 intent：
- faq
- product_recommendation
- order_status
- complaint
- human_handoff
- out_of_scope
- chitchat

JSON schema：
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

規則：
1. 使用者明確要求真人時，intent 必須是 human_handoff。
2. 抱怨、威脅投訴、明顯不滿時，intent 優先為 complaint，tone 為 angry 或 frustrated。
3. 商品推薦請盡量抽取 budget、category、use_case、keywords。
4. 不可回傳 markdown，不可加解釋文字。`
    },
    {
      role: "user",
      content: message
    }
  ];
}

export function buildReplyPrompt({
  message,
  classification,
  matchedFaq,
  recommendedProducts
}) {
  const context = {
    user_message: message,
    classification,
    matched_faq: matchedFaq
      ? {
          code: matchedFaq.code,
          title: matchedFaq.title,
          answer: matchedFaq.answer
        }
      : null,
    recommended_products: recommendedProducts.map((product) => ({
      code: product.code,
      name_zh: product.name_zh,
      price: product.price,
      stock_status: product.stock_status,
      tags: product.tags,
      use_cases: product.use_cases
    }))
  };

  return [
    {
      role: "system",
      content: `你是 Raccoon 的 AI 客服助理。請用繁體中文回覆，語氣清楚、簡短、友善。

規則：
1. FAQ 回覆必須以 matched_faq 為主要依據，不要編造政策。
2. 商品推薦請說明每個商品為什麼符合使用者需求。
3. 若資訊不足，請追問最少必要問題。
4. 若需要真人客服，請明確告知已建立待處理工單。
5. 不要輸出 markdown 表格。
6. 不要使用 markdown 粗體、項目符號或程式碼格式。
7. 每句話保持簡短，句尾使用中文標點。`
    },
    {
      role: "user",
      content: JSON.stringify(context, null, 2)
    }
  ];
}
