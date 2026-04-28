import { getConfig, hasGroqConfig } from "./config.js";
import { buildClassificationPrompt, buildReplyPrompt } from "./prompts.js";

export async function classifyMessage(message, options = {}) {
  const config = options.config || getConfig();
  if (!hasGroqConfig(config)) return classifyWithHeuristics(message);

  const content = await callGroq({
    messages: buildClassificationPrompt({ message }),
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

function classifyWithHeuristics(message) {
  const text = String(message || "");
  const angry = /爛|差|生氣|客訴|投訴|不滿|太誇張/.test(text);
  const wantsHuman = /真人|人工|客服|人員/.test(text);
  const product = /推薦|商品|預算|新手|送禮|耳機|保養|清潔|杯/.test(text);
  const faq = /退貨|換貨|付款|配送|到貨|保固|維修/.test(text);
  const budgetMatch = text.replace(/[,，]/g, "").match(/(\d+)\s*元?/);

  if (wantsHuman) {
    return normalizeClassification({
      intent: "human_handoff",
      confidence: 0.9,
      tone: angry ? "angry" : "neutral",
      need_human: true,
      summary: "使用者要求真人客服",
      keywords: ["真人客服"]
    }, message);
  }

  if (angry) {
    return normalizeClassification({
      intent: "complaint",
      confidence: 0.86,
      tone: "angry",
      need_human: true,
      summary: "使用者表達不滿",
      keywords: ["客訴"]
    }, message);
  }

  if (product) {
    return normalizeClassification({
      intent: "product_recommendation",
      confidence: 0.82,
      tone: "neutral",
      budget: budgetMatch ? Number(budgetMatch[1]) : null,
      category: text.includes("3C") || text.includes("耳機") ? "3C" : "",
      use_case: text.includes("新手") ? "新手入門" : text.includes("送禮") ? "送禮" : "",
      keywords: extractKeywords(text, ["新手", "送禮", "通勤", "清潔", "保養", "耳機", "生活"])
    }, message);
  }

  if (faq) {
    return normalizeClassification({
      intent: "faq",
      confidence: 0.78,
      tone: "neutral",
      summary: "使用者詢問常見問題",
      keywords: extractKeywords(text, ["退貨", "換貨", "付款", "配送", "到貨", "保固", "維修"])
    }, message);
  }

  return normalizeClassification({
    intent: text.length < 12 ? "chitchat" : "out_of_scope",
    confidence: 0.62,
    tone: "neutral",
    summary: "一般對話或範圍外問題",
    keywords: []
  }, message);
}

function fallbackReply({ classification, matchedFaq, recommendedProducts }) {
  if (classification.intent === "human_handoff" || classification.intent === "complaint") {
    return "我已經幫你建立待處理工單，真人客服會接手確認。";
  }

  if (matchedFaq) {
    return `${matchedFaq.answer} 如果你願意，也可以補充商品代號或訂單情境，我會再協助判斷。`;
  }

  if (recommendedProducts?.length) {
    const names = recommendedProducts.map((product) => `${product.code} ${product.name_zh}`).join("、");
    return `依照你的需求，我推薦 ${names}。下方卡片有價格、圖片、庫存與推薦理由，可以點進商品詳情查看。`;
  }

  if (classification.intent === "product_recommendation") {
    return "我可以幫你推薦商品。請補充預算與主要用途，例如「1000 元內、送禮」或「新手入門」。";
  }

  return "這個問題可能超出目前 demo 的服務範圍。你可以詢問退換貨、付款、配送、保固，或請我推薦商品。";
}

function normalizeClassification(raw, message) {
  const intent = [
    "faq",
    "product_recommendation",
    "order_status",
    "complaint",
    "human_handoff",
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

function extractKeywords(text, candidates) {
  return candidates.filter((keyword) => text.includes(keyword));
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
