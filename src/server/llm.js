import { getConfig, hasGroqConfig } from "./config.js";
import { buildClassificationPrompt, buildReplyPrompt } from "./prompts.js";

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
  const wantsHuman = /真人|人工|客服|專人|轉人工|找人/.test(text);
  const faq = /退貨|退款|付款|配送|運送|保固|發票|換貨/.test(text);
  const product = /推薦|商品|預算|新手|送禮|禮物|耳機|保養|清潔|杯|入門|3c|家用/.test(normalized);
  const priorProductContext = hasRecentProductContext(conversationHistory);
  const looksLikeProductFollowup = /(\d+\s*(元|塊|以內|以下)?)|新手|送禮|禮物|自用|家用|入門|保養|清潔|耳機|杯/.test(text);
  const budgetMatch = text.replace(/[,，]/g, "").match(/(\d+)\s*(元|塊|以內|以下)?/);

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

  if (product || (priorProductContext && looksLikeProductFollowup)) {
    const useCase = inferUseCase(text, conversationHistory);
    const missingFields = [];
    if (!budgetMatch) missingFields.push("budget");
    if (!useCase) missingFields.push("use_case");

    return normalizeClassification({
      intent: "product_recommendation",
      confidence: priorProductContext && !product ? 0.76 : 0.84,
      tone: "neutral",
      budget: budgetMatch ? Number(budgetMatch[1]) : null,
      category: inferCategory(text),
      use_case: useCase,
      missing_fields: missingFields,
      keywords: extractKeywords(text, ["新手", "送禮", "禮物", "自用", "家用", "入門", "保養", "清潔", "耳機", "杯", "3C"])
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

  return "目前我可以協助您查詢退換貨、付款、配送、保固，或協助您挑選商品。";
}

function normalizeClassification(raw, message) {
  const intent = [
    "faq",
    "product_recommendation",
    "order_status",
    "complaint",
    "human_handoff",
    "conversation_end",
    "out_of_scope",
    "chitchat"
  ].includes(raw?.intent)
    ? raw.intent
    : "out_of_scope";

  return {
    intent,
    confidence: clamp(Number(raw?.confidence ?? 0.6), 0, 1),
    summary: String(raw?.summary || message).slice(0, 160),
    tone: raw?.tone || "neutral",
    need_human: Boolean(raw?.need_human),
    budget: raw?.budget ?? null,
    category: raw?.category || "",
    use_case: raw?.use_case || "",
    missing_fields: Array.isArray(raw?.missing_fields) ? raw.missing_fields : [],
    keywords: Array.isArray(raw?.keywords) ? raw.keywords : []
  };
}

function hasRecentProductContext(conversationHistory) {
  return conversationHistory.slice(-4).some((item) => {
    return /推薦|商品|預算|用途|使用情境|品類/.test(String(item.content || ""));
  });
}

function inferUseCase(text, conversationHistory = []) {
  if (/新手|入門/.test(text)) return "新手入門";
  if (/送禮|禮物/.test(text)) return "送禮";
  if (/自用/.test(text)) return "自用";
  if (/家用|居家/.test(text)) return "居家使用";
  if (/清潔/.test(text)) return "清潔";
  if (/保養/.test(text)) return "保養";
  if (/耳機|3c/i.test(text)) return "3C 使用";

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

function extractKeywords(text, candidates) {
  return candidates.filter((keyword) => new RegExp(keyword, "i").test(text));
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
