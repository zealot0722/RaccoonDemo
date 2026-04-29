import { decideNextAction } from "./decision.js";
import { findBestFaq } from "./faq.js";
import { classifyMessage, generateReply } from "./llm.js";
import {
  buildOrderStatusReply,
  formatMissingOrderFields,
  getMissingOrderFields,
  getOrderIdentifiers
} from "./order-status.js";
import { formatAssistantReply } from "./reply-format.js";
import {
  buildProductRecommendationReply,
  formatMissingProductFields,
  getMissingProductFields,
  recommendProducts
} from "./recommendation.js";
import { createRepository, generateTicketNo } from "./repository.js";

export async function handleChat({ message, sessionId }, options = {}) {
  const repo = options.repo || createRepository(options.config);
  const cleanMessage = String(message || "").trim();
  const customerId = sessionId || "web-demo";

  if (!cleanMessage) {
    const error = new Error("message is required");
    error.statusCode = 400;
    throw error;
  }

  const [faqArticles, products, conversationHistory] = await Promise.all([
    repo.listFaqArticles(),
    repo.listProducts(),
    repo.listRecentMessages ? repo.listRecentMessages(customerId, 10) : []
  ]);

  const explicitConversationEnd = isConversationEndMessage(cleanMessage);
  const classification = explicitConversationEnd
    ? {
        intent: "conversation_end",
        confidence: 0.98,
        summary: "客戶表示沒有其他問題",
        tone: "neutral",
        need_human: false,
        budget: null,
        category: "",
        use_case: "",
        missing_fields: [],
        keywords: ["conversation_end"]
      }
    : await classifyMessage(cleanMessage, {
        config: options.config,
        conversationHistory
      });
  const conversationEnded = explicitConversationEnd || classification.intent === "conversation_end";

  const missingProductFields = getMissingProductFields(classification);
  const missingOrderFields = getMissingOrderFields(classification, cleanMessage);
  const matchedFaq = classification.intent === "faq"
    ? findBestFaq(faqArticles, cleanMessage)
    : null;
  const recommendedProducts = classification.intent === "product_recommendation" &&
    missingProductFields.length === 0
    ? recommendProducts(products, classification)
    : [];

  const orderIdentifiers = getOrderIdentifiers(classification, cleanMessage);
  const orderStatus = classification.intent === "order_status" && missingOrderFields.length === 0
    ? await repo.findOrderStatus?.(orderIdentifiers)
    : null;

  const decision = decideNextAction({
    classification,
    matchedFaq,
    recommendedProducts,
    missingProductFields,
    orderStatus,
    missingOrderFields,
    replyGenerationOk: true
  });

  const supportSummary = buildSupportSummary({
    message: cleanMessage,
    classification,
    decision,
    orderIdentifiers,
    orderStatus,
    matchedFaq,
    recommendedProducts
  });

  const rawReply = await buildReply({
    message: cleanMessage,
    classification,
    matchedFaq,
    recommendedProducts,
    decision,
    missingProductFields,
    missingOrderFields,
    orderStatus,
    conversationHistory,
    conversationEnded,
    config: options.config
  });
  const reply = formatAssistantReply(appendContinuationPrompt(rawReply, {
    conversationEnded,
    classification,
    missingProductFields,
    missingOrderFields
  }));

  const ticket = await repo.createTicket({
    ticket_no: generateTicketNo(),
    customer_id: customerId,
    status: decision.decision === "needs_review" ? "needs_review" : "auto_replied",
    summary: supportSummary,
    intent: classification.intent,
    priority: decision.riskFlags.includes("angry_tone") ? "high" : "normal",
    handoff_reason: decision.handoffReason
  });

  const customerMessage = await repo.createMessage({
    ticket_id: ticket.id,
    role: "customer",
    content: cleanMessage
  });
  const aiMessage = await repo.createMessage({
    ticket_id: ticket.id,
    role: decision.decision === "needs_review" ? "system" : "ai",
    content: reply
  });
  const aiDecision = await repo.createAiDecision({
    ticket_id: ticket.id,
    intent: classification.intent,
    confidence: classification.confidence,
    tone: classification.tone,
    decision: decision.decision,
    reasons: decision.reasons,
    risk_flags: decision.riskFlags,
    matched_faq_code: matchedFaq?.code || null,
    recommended_product_codes: recommendedProducts.map((product) => product.code),
    handoff_reason: decision.handoffReason,
    raw_classification: {
      ...classification,
      order_identifiers: orderIdentifiers,
      order_status: orderStatus,
      support_summary: supportSummary,
      context_message_count: conversationHistory.length
    }
  });

  return {
    reply,
    ticket: {
      ...ticket,
      messages: [customerMessage, aiMessage],
      ai_decision: aiDecision
    },
    classification,
    decision,
    matchedFaq,
    recommendedProducts,
    missingProductFields,
    missingOrderFields,
    orderStatus,
    conversationEnded,
    mode: repo.mode
  };
}

async function buildReply({
  message,
  classification,
  matchedFaq,
  recommendedProducts,
  decision,
  missingProductFields,
  missingOrderFields,
  orderStatus,
  conversationHistory,
  conversationEnded,
  config
}) {
  if (conversationEnded) {
    return "謝謝您願意使用 Raccoon 客服。\n若方便的話，請為這次服務留下評分，您的回饋會協助我們把回覆調整得更貼近需求。";
  }

  if (classification.intent === "order_status" && missingOrderFields.length > 0) {
    return `可以，我幫您查貨態。\n請問您方便提供${formatMissingOrderFields()}嗎？`;
  }

  if (classification.intent === "order_status" && orderStatus) {
    return buildOrderStatusReply(orderStatus);
  }

  if (classification.intent === "order_status" && decision.decision === "needs_review") {
    return "十分抱歉，我目前沒有查到這筆貨態。\n我已經把您提供的資料整理到客服後台，客服人員會協助確認。";
  }

  if (decision.decision === "needs_review") {
    return "十分抱歉讓您需要等候真人客服協助。\n我已經把您的問題摘要與目前對話紀錄整理到客服後台，客服人員會接手確認。\n您也可以再補充訂單編號、商品名稱或其他細節，讓客服更快處理。";
  }

  if (classification.intent === "product_recommendation" && missingProductFields.length > 0) {
    return buildMissingProductReply(missingProductFields);
  }

  if (classification.intent === "product_recommendation" && recommendedProducts.length > 0) {
    return buildProductRecommendationReply(recommendedProducts, classification);
  }

  if (classification.intent === "product_recommendation") {
    return "十分抱歉，目前沒有找到完全符合您條件的商品。\n您可以調整預算、用途或品類，我再幫您重新篩選。";
  }

  if (classification.intent === "out_of_scope") {
    return "十分抱歉，目前我能協助的範圍是退換貨、付款、配送、保固、查貨態，或商品推薦。\n您可以換個方式描述需求，我會再盡力協助。";
  }

  return generateReply({
    message,
    classification,
    matchedFaq,
    recommendedProducts,
    decision,
    conversationHistory
  }, { config });
}

export function isConversationEndMessage(message) {
  return /^(沒有|沒有了|沒了|沒問題|不用了|不需要了|好了|可以了|先這樣|ok|OK|謝謝|感謝|謝謝您|謝謝你|沒其他了|沒事了)[。！!.\s]*$/i.test(
    String(message || "").trim()
  );
}

function buildMissingProductReply(fields) {
  if (fields.includes("use_case")) {
    return "可以的，我先幫您縮小範圍。\n請問您要用來做什麼呢？如果方便，也可以一起告訴我大約預算或想找的品類。";
  }

  return `可以的，我先幫您縮小範圍。\n請問您方便補充${formatMissingProductFields(fields)}嗎？`;
}

function appendContinuationPrompt(reply, {
  conversationEnded,
  classification,
  missingProductFields,
  missingOrderFields
}) {
  if (conversationEnded) return reply;
  if (classification.intent === "product_recommendation" && missingProductFields.length > 0) return reply;
  if (classification.intent === "order_status" && missingOrderFields.length > 0) return reply;
  if (/還有其他問題|還需要協助|其他問題需要協助/.test(reply)) return reply;

  return `${reply}\n\n請問您還有其他問題需要協助嗎？`;
}

function buildSupportSummary({
  message,
  classification,
  decision,
  orderIdentifiers,
  orderStatus,
  matchedFaq,
  recommendedProducts
}) {
  const parts = [
    `客戶訊息：${message.slice(0, 80)}`,
    `AI 判斷：${classification.intent || "-"}`,
    `處理決策：${decision.decision || "-"}`,
    matchedFaq ? `命中 FAQ：${matchedFaq.code}` : "",
    recommendedProducts.length ? `推薦商品：${recommendedProducts.map((item) => item.code).join(", ")}` : "",
    orderIdentifiers.orderNo || orderIdentifiers.trackingNo
      ? `查詢資料：${orderIdentifiers.orderNo || orderIdentifiers.trackingNo}`
      : "",
    orderStatus?.found ? `貨態：${orderStatus.status_label || orderStatus.status}` : "",
    decision.handoffReason ? `轉人工原因：${decision.handoffReason}` : ""
  ].filter(Boolean);

  return parts.join(" | ");
}
