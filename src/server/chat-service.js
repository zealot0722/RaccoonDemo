import { decideNextAction } from "./decision.js";
import { findBestFaq } from "./faq.js";
import { classifyMessage, generateReply } from "./llm.js";
import {
  LOW_VALUE_INTENTS,
  applyMessageQualityGuardrail,
  countRecentLowValueCustomerTurns,
  isLowValueSupportTurn
} from "./message-quality.js";
import {
  buildOrderStatusReply,
  formatMissingOrderFields,
  getMissingOrderFields,
  getOrderIdentifiers
} from "./order-status.js";
import { formatAssistantReply } from "./reply-format.js";
import {
  buildProductRecommendationReply,
  enrichProductClassification,
  formatMissingProductFields,
  getMissingProductFields,
  recommendProducts
} from "./recommendation.js";
import {
  buildReturnInformationRequestReply,
  formatMissingReturnFields,
  getMissingReturnFields,
  isReturnRequestMessage,
  summarizeReturnInfo
} from "./return-request.js";
import { createRepository, generateTicketNo } from "./repository.js";

export async function handleChat({ message, sessionId, attachments = [] }, options = {}) {
  const repo = options.repo || createRepository(options.config);
  const cleanMessage = String(message || "").trim();
  const cleanAttachments = normalizeAttachments(attachments);
  const customerId = sessionId || "web-demo";

  if (!cleanMessage && cleanAttachments.length === 0) {
    const error = new Error("message is required");
    error.statusCode = 400;
    throw error;
  }

  const [faqArticles, products, conversationHistory] = await Promise.all([
    repo.listFaqArticles(),
    repo.listProducts(),
    repo.listRecentMessages ? repo.listRecentMessages(customerId, 10) : []
  ]);

  const messageForClassification = cleanMessage || "已上傳商品照片";
  const explicitConversationEnd = isConversationEndMessage(cleanMessage);
  const classificationResult = explicitConversationEnd
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
    : await classifyMessage(messageForClassification, {
        config: options.config,
        conversationHistory
      });
  const qualityClassification = applyMessageQualityGuardrail(classificationResult, messageForClassification);
  const routedClassification = applyWorkflowRouting(qualityClassification, messageForClassification, conversationHistory);
  const classification = explicitConversationEnd
    ? routedClassification
    : enrichProductClassification(routedClassification, messageForClassification, conversationHistory);
  const unclearTurnCount = isLowValueSupportTurn(classification, messageForClassification)
    ? countRecentLowValueCustomerTurns(conversationHistory) + 1
    : 0;
  const autoCloseForUnclear = LOW_VALUE_INTENTS.has(classification.intent) && unclearTurnCount >= 3;
  const conversationEnded = explicitConversationEnd || classification.intent === "conversation_end" || autoCloseForUnclear;

  const missingProductFields = getMissingProductFields(classification);
  const missingOrderFields = getMissingOrderFields(classification, cleanMessage);
  const missingReturnFields = getMissingReturnFields(classification, messageForClassification);
  const matchedFaq = classification.intent === "faq"
    ? findBestFaq(faqArticles, cleanMessage)
    : null;
  const recommendedProducts = buildRecommendedProducts({
    products,
    classification,
    missingProductFields,
    autoCloseForUnclear
  });

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
    missingReturnFields,
    replyGenerationOk: true
  });

  const supportSummary = buildSupportSummary({
    message: cleanMessage,
    classification,
    decision,
    orderIdentifiers,
    orderStatus,
    missingReturnFields,
    attachments: cleanAttachments,
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
    missingReturnFields,
    attachments: cleanAttachments,
    orderStatus,
    conversationHistory,
    conversationEnded,
    unclearTurnCount,
    autoCloseForUnclear,
    config: options.config
  });
  const reply = formatAssistantReply(appendContinuationPrompt(rawReply, {
    conversationEnded,
    decision,
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
    content: cleanMessage || "已上傳商品照片",
    attachments: cleanAttachments
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
      missing_return_fields: missingReturnFields,
      unclear_turn_count: unclearTurnCount,
      auto_closed_for_unclear: autoCloseForUnclear,
      attachments: cleanAttachments,
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
    missingReturnFields,
    orderStatus,
    conversationEnded,
    unclearTurnCount,
    autoClosed: autoCloseForUnclear,
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
  missingReturnFields,
  attachments,
  orderStatus,
  conversationHistory,
  conversationEnded,
  unclearTurnCount,
  autoCloseForUnclear,
  config
}) {
  if (autoCloseForUnclear) {
    return "請您重新敘述您的問題，或提供需要協助的事項。\n若您無待處理問題，本次對話將會關閉。\n若方便，請為這次服務留下評分。";
  }

  if (conversationEnded) {
    return "謝謝您願意使用 Raccoon 客服。\n若方便的話，請為這次服務留下評分，您的回饋會協助我們把回覆調整得更貼近需求。";
  }

  if (classification.intent === "order_status" && missingOrderFields.length > 0) {
    return `可以，我幫您查貨態。\n請問您方便提供${formatMissingOrderFields()}嗎？`;
  }

  if (classification.intent === "order_status" && orderStatus?.found) {
    return buildOrderStatusReply(orderStatus);
  }

  if (classification.intent === "return_request" && missingReturnFields.length > 0) {
    return buildReturnInformationRequestReply();
  }

  if (decision.decision === "needs_review") {
    return "請稍後，客服人員將很快為您服務。";
  }

  if (classification.intent === "unclear") {
    return buildUnclearReply(recommendedProducts);
  }

  if (classification.intent === "chitchat") {
    return buildChitchatReply(unclearTurnCount);
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

function buildRecommendedProducts({
  products,
  classification,
  missingProductFields,
  autoCloseForUnclear
}) {
  if (classification.intent === "product_recommendation" && missingProductFields.length === 0) {
    return recommendProducts(products, classification);
  }

  if (classification.intent === "unclear" && !autoCloseForUnclear) {
    return products.slice(0, 3);
  }

  return [];
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

function buildUnclearReply(products = []) {
  if (products.length) {
    return "請您重新敘述您的問題，或者您可以考慮下面產品。\n如果您有退換貨、付款、配送、保固或查貨態需求，也可以直接提供相關資料。";
  }

  return "請您重新敘述您的問題，或補充需要協助的事項。\n我可以協助退換貨、付款、配送、保固、查貨態或商品推薦。";
}

function buildChitchatReply(turnCount) {
  if (turnCount >= 2) {
    return "請您重新敘述您的問題，或直接描述需要協助的事項。\n如果沒有待處理問題，我會在下一次無法辨識需求時結束本次對話。";
  }

  return "您好，請您重新敘述您的問題，或直接描述需要協助的事項。\n我可以協助退換貨、付款、配送、保固、查貨態或商品推薦。";
}

function applyWorkflowRouting(classification, message, conversationHistory = []) {
  if (["human_handoff", "complaint", "conversation_end"].includes(classification.intent)) {
    return classification;
  }

  if (isReturnRequestMessage(message, conversationHistory)) {
    return {
      ...classification,
      intent: "return_request",
      confidence: Math.max(Number(classification.confidence || 0), 0.82),
      summary: classification.summary || "客戶提出退貨或退換貨申請",
      missing_fields: getMissingReturnFields({ intent: "return_request" }, message),
      keywords: [...new Set([...(classification.keywords || []), "退貨"])]
    };
  }

  const identifiers = getOrderIdentifiers({}, message);
  if (!isOrderStatusRequest(message, identifiers)) {
    return classification;
  }

  return {
    ...classification,
    intent: "order_status",
    confidence: Math.max(Number(classification.confidence || 0), 0.82),
    summary: classification.summary || "客戶詢問訂單或物流貨態",
    order_no: classification.order_no || identifiers.orderNo,
    tracking_no: classification.tracking_no || identifiers.trackingNo,
    missing_fields: identifiers.orderNo || identifiers.trackingNo ? [] : ["order_identifier"],
    keywords: [...new Set([...(classification.keywords || []), "貨態"])]
  };
}

function isOrderStatusRequest(message, identifiers = {}) {
  const text = String(message || "");
  if (identifiers.orderNo || identifiers.trackingNo) {
    return /查|貨態|物流|配送|出貨|到貨|包裹|訂單/.test(text);
  }

  return /查貨|貨態|物流單號|訂單編號|配送進度|包裹|出貨|到貨了嗎|到貨沒/.test(text);
}

function appendContinuationPrompt(reply, {
  conversationEnded,
  decision,
  classification,
  missingProductFields,
  missingOrderFields
}) {
  if (conversationEnded) return reply;
  if (decision?.decision === "needs_review") return reply;
  if (LOW_VALUE_INTENTS.has(classification.intent)) return reply;
  if (classification.intent === "product_recommendation" && missingProductFields.length > 0) return reply;
  if (classification.intent === "order_status" && missingOrderFields.length > 0) return reply;
  if (classification.intent === "return_request") return reply;
  if (/還有其他問題|還需要協助|其他問題需要協助/.test(reply)) return reply;

  return `${reply}\n\n請問您還有其他問題需要協助嗎？`;
}

function buildSupportSummary({
  message,
  classification,
  decision,
  orderIdentifiers,
  orderStatus,
  missingReturnFields,
  attachments,
  matchedFaq,
  recommendedProducts
}) {
  const intent = classification.intent || "-";

  if (intent === "return_request") {
    const returnInfo = summarizeReturnInfo(message, attachments);
    const status = missingReturnFields?.length
      ? `缺少：${formatMissingReturnFields(missingReturnFields)}`
      : "必要資料齊全";
    return [
      "客服摘要：退貨申請",
      `狀態：${status}`,
      returnInfo ? `退貨資料：${returnInfo}` : "",
      `處理：${decision.decision === "needs_review" ? "轉人工判斷" : "等待客戶補資料"}`
    ].filter(Boolean).join("｜");
  }

  if (intent === "order_status") {
    return [
      "客服摘要：查貨態",
      orderIdentifiers.orderNo || orderIdentifiers.trackingNo
        ? `查詢編號：${orderIdentifiers.orderNo || orderIdentifiers.trackingNo}`
        : "查詢編號：未提供",
      orderStatus?.found ? `貨態：${orderStatus.status_label || orderStatus.status}` : "",
      `處理：${decision.decision === "needs_review" ? "轉人工確認" : "自動回覆"}`
    ].filter(Boolean).join("｜");
  }

  if (intent === "product_recommendation") {
    return [
      "客服摘要：商品推薦",
      recommendedProducts.length ? `推薦商品：${recommendedProducts.map((item) => item.code).join(", ")}` : "推薦商品：尚未推薦",
      formatProductFollowUpSummary(classification),
      `處理：${decision.decision === "needs_review" ? "轉人工" : "自動回覆"}`
    ].filter(Boolean).join("｜");
  }

  if (LOW_VALUE_INTENTS.has(intent)) {
    return [
      `客服摘要：${intent === "unclear" ? "不明輸入" : "閒聊訊息"}`,
      message ? `內容：${message.slice(0, 40)}` : "",
      "處理：請客戶重新敘述問題"
    ].filter(Boolean).join("｜");
  }

  return [
    `客服摘要：${classification.summary || message.slice(0, 40) || intent}`,
    matchedFaq ? `FAQ：${matchedFaq.code}` : "",
    `處理：${decision.decision === "needs_review" ? "轉人工" : "自動回覆"}`,
    decision.handoffReason ? `原因：${decision.handoffReason}` : ""
  ].filter(Boolean).join("｜");
}

function normalizeAttachments(attachments = []) {
  if (!Array.isArray(attachments)) return [];

  return attachments
    .filter((item) => item && /^image\//.test(String(item.type || "")))
    .slice(0, 3)
    .map((item) => ({
      name: String(item.name || "photo").slice(0, 120),
      type: String(item.type || "image/jpeg").slice(0, 80),
      size: Number.isFinite(Number(item.size)) ? Number(item.size) : 0,
      dataUrl: String(item.dataUrl || item.data_url || "").slice(0, 2_000_000)
    }));
}

function formatProductFollowUpSummary(classification = {}) {
  if (!classification.follow_up) return "";

  const labels = {
    alternative: "追問其他品項",
    cheaper: "追問更低價品項",
    budget_refinement: "補充預算條件",
    need_refinement: "補充用途條件",
    context_continuation: "延續上一輪商品推薦"
  };
  const excluded = classification.exclude_product_codes?.length
    ? `，排除前次商品：${classification.exclude_product_codes.join(", ")}`
    : "";
  return `上下文：${labels[classification.follow_up] || classification.follow_up}${excluded}`;
}
