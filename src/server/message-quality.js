export const LOW_VALUE_INTENTS = new Set(["unclear", "chitchat"]);

const SUPPORT_KEYWORDS = /退貨|退款|換貨|付款|配送|運送|物流|貨態|保固|發票|真人|人工|客服|客訴|投訴|推薦|商品|產品|預算|新手|送禮|禮物|耳機|保養|清潔|杯|入門|3c|訂單|出貨|到貨/i;

export function isLikelyUnclearInput(message = "") {
  const text = String(message || "").trim();
  if (!text) return false;
  if (SUPPORT_KEYWORDS.test(text)) return false;

  const normalized = text.replace(/\s+/g, "");
  if (!normalized) return false;

  if (/^[^\p{L}\p{N}]+$/u.test(normalized)) return true;
  if (/^(\p{L}|\p{N})\1{3,}$/u.test(normalized)) return true;
  if (/^(.{2,4})\1{2,}$/u.test(normalized)) return true;
  if (/^\d{6,}$/.test(normalized) && !/[元塊]/.test(text)) return true;
  if (/^[a-z]{4,}$/i.test(normalized)) return true;

  const meaningful = normalized.match(/[\p{Script=Han}a-z0-9]/giu) || [];
  return meaningful.length > 0 && meaningful.length / normalized.length < 0.45;
}

export function isChitchatInput(message = "") {
  return /^(您好|你好|哈囉|哈啰|嗨|hi|hello|hey|早安|午安|晚安|在嗎|有人嗎)[。！!?.？\s]*$/i.test(
    String(message || "").trim()
  );
}

export function isLowValueSupportTurn(classification = {}, message = "") {
  return LOW_VALUE_INTENTS.has(classification.intent) ||
    isLikelyUnclearInput(message) ||
    isChitchatInput(message);
}

export function countRecentLowValueCustomerTurns(conversationHistory = []) {
  const customerMessages = conversationHistory
    .filter((item) => item.role === "customer")
    .map((item) => String(item.content || "").trim())
    .filter(Boolean);

  let count = 0;
  for (const message of customerMessages.reverse()) {
    if (!isLikelyUnclearInput(message) && !isChitchatInput(message)) break;
    count += 1;
  }
  return count;
}

export function applyMessageQualityGuardrail(classification = {}, message = "") {
  if (["human_handoff", "complaint", "conversation_end"].includes(classification.intent)) {
    return classification;
  }

  if (isChitchatInput(message)) {
    return {
      ...classification,
      intent: "chitchat",
      confidence: Math.max(Number(classification.confidence || 0), 0.84),
      summary: "客戶輸入閒聊或招呼語",
      missing_fields: [],
      keywords: [...new Set([...(classification.keywords || []), "chitchat"])]
    };
  }

  if (isLikelyUnclearInput(message)) {
    return {
      ...classification,
      intent: "unclear",
      confidence: Math.max(Number(classification.confidence || 0), 0.88),
      summary: "客戶輸入無法辨識的內容",
      missing_fields: [],
      keywords: [...new Set([...(classification.keywords || []), "unclear"])]
    };
  }

  return classification;
}
