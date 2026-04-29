import { getConfig, hasGroqConfig } from "./config.js";
import { applyMessageQualityGuardrail, isChitchatInput, isLikelyUnclearInput } from "./message-quality.js";
import { extractOrderIdentifiersFromText } from "./order-status.js";
import { buildClassificationPrompt, buildReplyPrompt } from "./prompts.js";
import { getMissingReturnFields, isReturnRequestMessage } from "./return-request.js";

export async function classifyMessage(message, options = {}) {
  const config = options.config || getConfig();
  const conversationHistory = options.conversationHistory || [];
  if (!hasGroqConfig(config)) return classifyWithHeuristics(message, conversationHistory);

  const content = await callGroq({
    messages: buildClassificationPrompt({ message, conversationHistory }),
    model: config.classifierModel,
    apiKey: config.groqApiKey,
    temperature: 0.1
  });

  return normalizeClassification(parseJsonObject(content), message);
}

export async function generateReply(input, options = {}) {
  const config = options.config || getConfig();
  if (!hasGroqConfig(config)) return fallbackReply(input);

  return callGroq({
    messages: buildReplyPrompt(input),
    model: config.replyModel,
    apiKey: config.groqApiKey,
    temperature: 0.35
  });
}

async function callGroq({ messages, model, apiKey, temperature }) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function parseJsonObject(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Groq classification did not return JSON");
    return JSON.parse(match[0]);
  }
}

function classifyWithHeuristics(message, conversationHistory = []) {
  const text = String(message || "");
  const normalized = text.toLowerCase();
  const angry = /太差|客訴|投訴|不爽|生氣|爛|糟/.test(text);
  const wantsHuman = /真人|人工|專人|轉人工|找人|真人客服|人工客服|客服人員|找客服|聯絡客服/.test(text);
  const returnRequest = isReturnRequestMessage(text, conversationHistory);
  const orderStatus = /查貨|貨態|物流|配送進度|包裹|訂單|出貨|到貨了嗎|到貨沒|怎麼還沒到|還沒到|物流到哪|包裹在哪|物流單號|訂單編號/.test(text);
  const faq = /退貨|退款|付款|配送|運送|保固|發票|換貨/.test(text);
  const product = /推薦|商品|產品|預算|新手|送禮|禮物|耳機|保養|清潔|杯|入門|3c|家用|\bP\d{3,}\b/i.test(normalized);
  const priorProductContext = hasRecentProductContext(conversationHistory);
  const looksLikeProductFollowup = /(\d+\s*(元|塊|以內|以下)?)|[一二兩三四五六七八九十百千萬]+(?:元|塊|以內|以下)?|其他|別的|還有嗎|還有其他|換一個|不同|更便宜|便宜一點|預算|新手|送禮|禮物|自用|家用|入門|保養|清潔|耳機|杯|\bP\d{3,}\b/i.test(text);
  const budgetValue = extractBudgetValue(text);

  if (isChitchatInput(text)) {
    return normalizeClassification({
      intent: "chitchat",
      confidence: 0.86,
      tone: "neutral",
      need_human: false,
      summary: "客戶輸入閒聊或招呼語",
      keywords: ["chitchat"]
    }, message);
  }

  if (isLikelyUnclearInput(text)) {
    return normalizeClassification({
      intent: "unclear",
      confidence: 0.9,
      tone: "neutral",
      need_human: false,
      summary: "客戶輸入無法辨識的內容",
      keywords: ["unclear"]
    }, message);
  }

  if (wantsHuman) {
    return normalizeClassification({
      intent: "human_handoff",
      confidence: 0.9,
      tone: angry ? "angry" : "neutral",
      need_human: true,
      summary: "客戶要求真人客服協助",
      keywords: ["真人客服"]
    }, message);
  }

  if (angry) {
    return normalizeClassification({
      intent: "complaint",
      confidence: 0.86,
      tone: "angry",
      need_human: true,
      summary: "客戶提出客訴或負面服務體驗",
      keywords: ["客訴"]
    }, message);
  }

  if (returnRequest) {
    const base = {
      intent: "return_request",
      confidence: 0.86,
      tone: "neutral",
      need_human: false,
      summary: "客戶提出退貨或退換貨申請",
      missing_fields: [],
      keywords: extractKeywords(text, ["退貨", "退款", "換貨", "退換貨", "送貨貨號", "照片"])
    };
    base.missing_fields = getMissingReturnFields(base, text);
    return normalizeClassification(base, message);
  }

  if (orderStatus) {
    const identifiers = extractOrderIdentifiersFromText(text);
    const missingFields = identifiers.orderNo || identifiers.trackingNo ? [] : ["order_identifier"];

    return normalizeClassification({
      intent: "order_status",
      confidence: 0.84,
      tone: "neutral",
      need_human: false,
      summary: "客戶詢問訂單或物流貨態",
      order_no: identifiers.orderNo,
      tracking_no: identifiers.trackingNo,
      missing_fields: missingFields,
      keywords: extractKeywords(text, ["查貨", "貨態", "物流", "配送進度", "包裹", "訂單", "出貨", "到貨", "物流單號", "訂單編號"])
    }, message);
  }

  if (faq) {
    return normalizeClassification({
      intent: "faq",
      confidence: 0.78,
      tone: "neutral",
      summary: "客戶詢問 FAQ 類問題",
      keywords: extractKeywords(text, ["退貨", "退款", "付款", "配送", "運送", "保固", "發票", "換貨"])
    }, message);
  }

  if (product || (priorProductContext && looksLikeProductFollowup)) {
    const useCase = inferUseCase(text, conversationHistory);
    const missingFields = [];
    const productFollowUp = inferProductFollowUp(text, priorProductContext);
    if (!budgetValue && !productFollowUp) missingFields.push("budget");
    if (!useCase && !productFollowUp && !budgetValue) missingFields.push("use_case");

    return normalizeClassification({
      intent: "product_recommendation",
      confidence: priorProductContext && !product ? 0.76 : 0.84,
      tone: "neutral",
      budget: budgetValue,
      category: inferCategory(text),
      use_case: useCase,
      follow_up: productFollowUp,
      missing_fields: missingFields,
      keywords: extractKeywords(text, ["新手", "送禮", "禮物", "自用", "家用", "入門", "保養", "清潔", "耳機", "杯", "3C"])
    }, message);
  }

  return normalizeClassification({
    intent: text.length < 12 ? "chitchat" : "out_of_scope",
    confidence: 0.62,
    tone: "neutral",
    summary: "一般訊息或服務範圍外問題",
    keywords: []
  }, message);
}

function fallbackReply({ classification, matchedFaq, recommendedProducts }) {
  if (classification.intent === "human_handoff" || classification.intent === "complaint") {
    return "已為您建立待處理工單，真人客服會接手確認。";
  }

  if (matchedFaq) {
    return `${matchedFaq.answer}\n若您還有其他細節需要確認，也可以繼續補充。`;
  }

  if (recommendedProducts?.length) {
    const names = recommendedProducts.map((product) => `${product.code} ${product.name_zh}`).join("、");
    return `依照您的需求，建議您先參考 ${names}。\n商品資訊與連結已放在本則訊息中。`;
  }

  if (classification.intent === "product_recommendation") {
    return "請您補充預算、用途或想找的品類，我才能幫您縮小商品範圍。";
  }

  if (classification.intent === "unclear" || classification.intent === "chitchat") {
    return "請您重新敘述您的問題，或直接描述需要協助的事項。";
  }

  return "目前我可以協助您查詢退換貨、付款、配送、保固，或協助您挑選商品。";
}

function normalizeClassification(raw, message) {
  const intent = [
    "faq",
    "return_request",
    "product_recommendation",
    "order_status",
    "complaint",
    "human_handoff",
    "conversation_end",
    "unclear",
    "out_of_scope",
    "chitchat"
  ].includes(raw?.intent)
    ? raw.intent
    : "out_of_scope";

  const result = {
    intent,
    confidence: clamp(Number(raw?.confidence ?? 0.6), 0, 1),
    summary: String(raw?.summary || message).slice(0, 160),
    tone: raw?.tone || "neutral",
    need_human: Boolean(raw?.need_human),
    budget: raw?.budget ?? null,
    category: raw?.category || "",
    use_case: raw?.use_case || "",
    order_no: raw?.order_no || raw?.orderNo || "",
    tracking_no: raw?.tracking_no || raw?.trackingNo || "",
    follow_up: raw?.follow_up || raw?.followUp || "",
    exclude_product_codes: Array.isArray(raw?.exclude_product_codes) ? raw.exclude_product_codes : [],
    missing_fields: Array.isArray(raw?.missing_fields) ? raw.missing_fields : [],
    keywords: Array.isArray(raw?.keywords) ? raw.keywords : []
  };

  return applyWorkflowGuardrails(applyMessageQualityGuardrail(result, message), message);
}

function applyWorkflowGuardrails(classification, message) {
  if (["human_handoff", "complaint"].includes(classification.intent)) {
    return classification;
  }

  if (isReturnRequestMessage(message)) {
    return {
      ...classification,
      intent: "return_request",
      confidence: Math.max(classification.confidence, 0.82),
      summary: classification.summary || "客戶提出退貨或退換貨申請",
      missing_fields: getMissingReturnFields({ intent: "return_request" }, message),
      keywords: [...new Set([...(classification.keywords || []), "退貨"])]
    };
  }

  const identifiers = extractOrderIdentifiersFromText(message);
  if (!looksLikeOrderStatus(message, identifiers)) {
    return classification;
  }

  const orderNo = classification.order_no || identifiers.orderNo;
  const trackingNo = classification.tracking_no || identifiers.trackingNo;

  return {
    ...classification,
    intent: "order_status",
    confidence: Math.max(classification.confidence, 0.82),
    summary: classification.summary || "客戶詢問訂單或物流貨態",
    order_no: orderNo,
    tracking_no: trackingNo,
    missing_fields: orderNo || trackingNo ? [] : ["order_identifier"],
    keywords: [...new Set([...(classification.keywords || []), "貨態"])]
  };
}

function looksLikeOrderStatus(message, identifiers = {}) {
  const text = String(message || "");
  if (identifiers.orderNo || identifiers.trackingNo) {
    return /查|貨態|物流|配送|出貨|到貨|包裹|訂單/.test(text);
  }

  return /查貨|貨態|物流單號|訂單編號|配送進度|包裹|出貨|到貨了嗎|到貨沒/.test(text);
}

function hasRecentProductContext(conversationHistory) {
  return conversationHistory.slice(-4).some((item) => {
    return /推薦|商品|產品|預算|用途|使用情境|品類|詳情連結|價格|P\d{3}/i.test(String(item.content || ""));
  });
}

function inferUseCase(text, conversationHistory = []) {
  if (/新手|入門/.test(text)) return "新手入門";
  if (/送禮|禮物/.test(text)) return "送禮";
  if (/自用/.test(text)) return "自用";
  if (/家用|居家/.test(text)) return "居家使用";
  if (/清潔/.test(text)) return "清潔";
  if (/保養/.test(text)) return "保養";
  if (/耳機|3c/i.test(text)) return "3C";

  const prior = conversationHistory.map((item) => item.content).join(" ");
  if (/新手|入門/.test(prior)) return "新手入門";
  if (/送禮|禮物/.test(prior)) return "送禮";
  return "";
}

function inferCategory(text) {
  if (/3c|耳機/i.test(text)) return "3C";
  if (/保養/.test(text)) return "保養";
  if (/清潔|杯|家用|居家/.test(text)) return "家用生活";
  return "";
}

function inferProductFollowUp(text, priorProductContext) {
  if (!priorProductContext) return "";
  if (/更便宜|便宜一點|低一點|價格低|預算低/.test(text)) return "cheaper";
  if (/其他|別的|還有嗎|還有其他|換一個|換款|不同|另一個|另.*選項/.test(text)) return "alternative";
  if (extractBudgetValue(text)) return "budget_refinement";
  return "";
}

function extractKeywords(text, candidates) {
  return candidates.filter((keyword) => new RegExp(keyword, "i").test(text));
}

function extractBudgetValue(text) {
  const normalized = String(text || "").replace(/\bP\d{3,}\b/gi, "").replace(/[,，]/g, "");
  const numericMatch = normalized.match(/(\d+)\s*(k|K|千|元|塊|以內|以下|左右)?/);
  if (numericMatch) {
    const value = Number(numericMatch[1]);
    const unit = numericMatch[2] || "";
    return /k|K|千/.test(unit) && value < 100 ? value * 1000 : value;
  }

  const chineseMatch = normalized.match(/([一二兩三四五六七八九十百千萬]+)\s*(元|塊|以內|以下|左右)?/);
  if (!chineseMatch) return null;
  const hasBudgetContext = /預算|價格|大概|差不多|左右|以內|以下|元|塊/.test(normalized);
  const hasLargeUnit = /百|千|萬/.test(chineseMatch[1]);
  return hasBudgetContext || hasLargeUnit ? parseChineseNumber(chineseMatch[1]) : null;
}

function parseChineseNumber(input) {
  const text = String(input || "");
  const digits = {
    零: 0,
    一: 1,
    二: 2,
    兩: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };
  const colloquialThousands = text.match(/^([一二兩三四五六七八九])千([一二兩三四五六七八九])$/);
  if (colloquialThousands) {
    return digits[colloquialThousands[1]] * 1000 + digits[colloquialThousands[2]] * 100;
  }

  const colloquialHundreds = text.match(/^([一二兩三四五六七八九])百([一二兩三四五六七八九])$/);
  if (colloquialHundreds) {
    return digits[colloquialHundreds[1]] * 100 + digits[colloquialHundreds[2]] * 10;
  }

  const units = { 十: 10, 百: 100, 千: 1000, 萬: 10000 };
  let total = 0;
  let section = 0;
  let number = 0;

  for (const char of text) {
    if (Object.prototype.hasOwnProperty.call(digits, char)) {
      number = digits[char];
      continue;
    }

    const unit = units[char];
    if (!unit) return null;
    if (unit === 10000) {
      section = (section + number) * unit;
      total += section;
      section = 0;
    } else {
      section += (number || 1) * unit;
    }
    number = 0;
  }

  const value = total + section + number;
  return value || null;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
