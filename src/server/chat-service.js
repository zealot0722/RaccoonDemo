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

const RETURN_POLICY_FAQ_CODE = "F001";
const RETURN_POLICY_FLOW_REPLY = "您可以參考以下流程：先確認商品狀態與訂單資料，再提供送貨貨號、姓名、電話號碼。若商品破損、瑕疵或少件，也可以上傳商品照片供客服參考。收到必要資料後，客服人員會協助確認退貨或換貨處理。";

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
  const activeIntents = getActiveIntents(classification);
  const unclearTurnCount = isLowValueSupportTurn(classification, messageForClassification)
    ? countRecentLowValueCustomerTurns(conversationHistory) + 1
    : 0;
  const autoCloseForUnclear = LOW_VALUE_INTENTS.has(classification.intent) && unclearTurnCount >= 3;
  const conversationEnded = explicitConversationEnd || classification.intent === "conversation_end" || autoCloseForUnclear;

  const missingProductFields = activeIntents.has("product_recommendation")
    ? getMissingProductFields(withIntent(classification, "product_recommendation"))
    : [];
  const missingOrderFields = activeIntents.has("order_status")
    ? getMissingOrderFields(withIntent(classification, "order_status"), cleanMessage)
    : [];
  const missingReturnFields = activeIntents.has("return_request")
    ? getMissingReturnFields(withIntent(classification, "return_request"), messageForClassification, conversationHistory)
    : [];
  const matchedFaq = activeIntents.has("faq")
    ? findBestFaq(faqArticles, cleanMessage)
    : null;
  const recommendedProducts = buildRecommendedProducts({
    products,
    classification,
    missingProductFields,
    activeIntents
  });

  const orderIdentifiers = getOrderIdentifiers(classification, cleanMessage);
  const orderStatus = activeIntents.has("order_status") && missingOrderFields.length === 0
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
    recommendedProducts,
    conversationHistory
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

  if (isProcessableMultiIntent(classification)) {
    return buildMultiIntentReply({
      classification,
      matchedFaq,
      recommendedProducts,
      decision,
      missingProductFields,
      missingOrderFields,
      missingReturnFields,
      orderStatus
    });
  }

  if (matchedFaq) {
    return buildFaqReply(matchedFaq);
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
    return buildUnclearReply();
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
  activeIntents = getActiveIntents(classification)
}) {
  if (activeIntents.has("product_recommendation") && missingProductFields.length === 0) {
    return recommendProducts(products, withIntent(classification, "product_recommendation"));
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

function buildFaqReply(matchedFaq) {
  if (matchedFaq.code === RETURN_POLICY_FAQ_CODE) {
    return RETURN_POLICY_FLOW_REPLY;
  }

  return matchedFaq.answer;
}

function buildMultiIntentReply({
  classification,
  matchedFaq,
  recommendedProducts,
  decision,
  missingProductFields,
  missingOrderFields,
  missingReturnFields,
  orderStatus
}) {
  const activeIntents = getActiveIntents(classification);
  const parts = [];

  if (activeIntents.has("order_status")) {
    if (missingOrderFields.length > 0) {
      parts.push(`可以，我先幫您查貨態。\n請問您方便提供${formatMissingOrderFields()}嗎？`);
    } else if (orderStatus?.found) {
      parts.push(buildOrderStatusReply(orderStatus));
    } else if (orderStatus && !orderStatus.found) {
      parts.push("十分抱歉，目前沒有查到這筆貨態。\n請稍後，客服人員將很快為您服務。");
    }
  }

  if (activeIntents.has("faq") && matchedFaq) {
    parts.push(buildFaqReply(matchedFaq));
  }

  if (activeIntents.has("return_request")) {
    if (missingReturnFields.length > 0) {
      parts.push(buildReturnInformationRequestReply());
    } else {
      parts.push("退貨資料已收到。\n請稍後，客服人員將很快為您服務。");
    }
  }

  if (activeIntents.has("product_recommendation")) {
    if (missingProductFields.length > 0) {
      parts.push(buildMissingProductReply(missingProductFields));
    } else if (recommendedProducts.length > 0) {
      parts.push(buildProductRecommendationReply(recommendedProducts, classification));
    } else {
      parts.push("十分抱歉，目前沒有找到完全符合您條件的商品。\n您可以調整預算、用途或品類，我再幫您重新篩選。");
    }
  }

  if (!parts.length && decision.decision === "needs_review") {
    return "請稍後，客服人員將很快為您服務。";
  }

  return [...new Set(parts)].join("\n\n");
}

function buildUnclearReply() {
  return "請您重新敘述您的問題，或補充需要協助的事項。\n我可以協助退換貨、付款、配送、保固、查貨態或商品推薦。";
}

function buildChitchatReply(turnCount) {
  if (turnCount >= 2) {
    return "請您重新敘述您的問題，或直接描述需要協助的事項。\n如果沒有待處理問題，我會在下一次無法辨識需求時結束本次對話。";
  }

  return "您好，請您重新敘述您的問題，或直接描述需要協助的事項。\n我可以協助退換貨、付款、配送、保固、查貨態或商品推薦。";
}

export function applyWorkflowRouting(classification, message, conversationHistory = []) {
  const multiIntent = detectMultiIntent(message, conversationHistory);
  if (multiIntent.length > 1) {
    return buildMultiIntentClassification(classification, message, conversationHistory, multiIntent);
  }

  if (["complaint", "conversation_end"].includes(classification.intent)) {
    return classification;
  }

  if (classification.intent === "human_handoff" && isExplicitHumanHandoff(message)) {
    return classification;
  }

  if (isReturnRequestMessage(message, conversationHistory)) {
    const routed = {
      ...classification,
      intent: "return_request",
      need_human: false,
      confidence: Math.max(Number(classification.confidence || 0), 0.82),
      summary: classification.summary || "客戶提出退貨或退換貨申請",
      missing_fields: getMissingReturnFields({ intent: "return_request" }, message, conversationHistory),
      keywords: [...new Set([...(classification.keywords || []), "退貨"])]
    };
    return routed;
  }

  const identifiers = getOrderIdentifiers({}, message);
  if (isDeliveryPolicyFaq(message, identifiers)) {
    return {
      ...classification,
      intent: "faq",
      need_human: false,
      confidence: Math.max(Number(classification.confidence || 0), 0.82),
      summary: classification.summary || "客戶詢問配送時間或運送政策",
      order_no: "",
      tracking_no: "",
      missing_fields: [],
      keywords: [...new Set([...(classification.keywords || []), "配送時間"])]
    };
  }

  if (!isOrderStatusRequest(message, identifiers, conversationHistory)) {
    return classification;
  }

  return {
    ...classification,
    intent: "order_status",
    need_human: false,
    confidence: Math.max(Number(classification.confidence || 0), 0.82),
    summary: classification.summary || "客戶詢問訂單或物流貨態",
    order_no: classification.order_no || identifiers.orderNo,
    tracking_no: classification.tracking_no || identifiers.trackingNo,
    missing_fields: identifiers.orderNo || identifiers.trackingNo ? [] : ["order_identifier"],
    keywords: [...new Set([...(classification.keywords || []), "貨態"])]
  };
}

function isOrderStatusRequest(message, identifiers = {}, conversationHistory = []) {
  const text = String(message || "");
  if (identifiers.orderNo || identifiers.trackingNo) {
    return hasRecentOrderContext(conversationHistory) ||
      /查|貨態|物流|配送|出貨|到貨|包裹|訂單|東西|在哪|哪裡|到哪|位置|進度/.test(text);
  }

  return /查貨|貨態|物流單號|訂單編號|配送進度|包裹|出貨|到貨了嗎|到貨沒|怎麼還沒到|還沒到|物流到哪|包裹在哪/.test(text);
}

function isDeliveryPolicyFaq(message, identifiers = {}) {
  if (identifiers.orderNo || identifiers.trackingNo) return false;

  const text = String(message || "");
  if (/查貨|貨態|物流單號|訂單編號|配送進度|包裹|訂單|出貨|到貨了嗎|到貨沒|怎麼還沒到|還沒到|物流到哪|包裹在哪|送到了嗎/.test(text)) {
    return false;
  }

  return /(配送|運送|到貨|收到)/.test(text) &&
    /(通常|一般|大概|多久|幾天|時間)/.test(text);
}

function hasRecentOrderContext(conversationHistory = []) {
  return conversationHistory.slice(-6).some((item) => {
    return /查貨|貨態|物流|配送|出貨|到貨|包裹|訂單編號|物流單號|訂單編號或物流單號/.test(String(item.content || ""));
  });
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
  if (classification.multi_intent?.length > 1) return reply;
  if (classification.intent === "faq") return reply;
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
  recommendedProducts,
  conversationHistory
}) {
  const intent = classification.intent || "-";
  const multiIntentSummary = formatMultiIntentSummary(classification, message);

  if (intent === "return_request") {
    const returnInfo = summarizeReturnInfo(message, attachments, conversationHistory);
    const status = missingReturnFields?.length
      ? `缺少：${formatMissingReturnFields(missingReturnFields)}`
      : "必要資料齊全";
    return [
      "客服摘要：退貨申請",
      multiIntentSummary,
      `狀態：${status}`,
      returnInfo ? `退貨資料：${returnInfo}` : "",
      `處理：${decision.decision === "needs_review" ? "轉人工判斷" : "等待客戶補資料"}`
    ].filter(Boolean).join("｜");
  }

  if (intent === "order_status") {
    return [
      "客服摘要：查貨態",
      multiIntentSummary,
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
      multiIntentSummary,
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
    multiIntentSummary,
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
    context_continuation: "延續上一輪商品推薦",
    product_reference: "詢問上一輪指定商品"
  };
  const excluded = classification.exclude_product_codes?.length
    ? `，排除前次商品：${classification.exclude_product_codes.join(", ")}`
    : "";
  return `上下文：${labels[classification.follow_up] || classification.follow_up}${excluded}`;
}

function detectMultiIntent(message = "", conversationHistory = []) {
  const text = String(message || "");
  const identifiers = getOrderIdentifiers({}, text);
  const intents = [];
  const orderLookupCue = /查貨|貨態|物流|配送進度|出貨|到貨|訂單|請查|幫我查|順便查|包裹.*(到哪|在哪|位置|進度|還沒到)|(到哪|在哪|位置|進度|還沒到).*包裹|東西.*(在哪|到哪|位置)|(在哪|到哪|位置).*東西/.test(text);

  if (isReturnRequestMessage(text, conversationHistory)) intents.push("return_request");
  if (orderLookupCue || ((identifiers.orderNo || identifiers.trackingNo) && hasRecentOrderContext(conversationHistory))) {
    intents.push("order_status");
  }
  if (/推薦|商品推薦|推薦商品|想找.*商品|想買|耳機|預算/.test(text)) {
    intents.push("product_recommendation");
  }
  if (isExplicitHumanHandoff(text)) intents.push("human_handoff");
  if (/保固|付款|發票|退貨規則|退貨流程|配送時間/.test(text)) intents.push("faq");

  return [...new Set(intents)];
}

function buildMultiIntentClassification(classification, message, conversationHistory, multiIntent) {
  const primaryIntent = multiIntent.includes("human_handoff")
    ? "human_handoff"
    : multiIntent.includes("order_status")
        ? "order_status"
        : multiIntent.includes("return_request")
          ? "return_request"
          : multiIntent.includes("product_recommendation")
            ? "product_recommendation"
            : multiIntent[0];
  const identifiers = getOrderIdentifiers(classification, message);
  const labels = multiIntent.map(formatIntentLabel);
  const next = {
    ...classification,
    intent: primaryIntent,
    confidence: Math.max(Number(classification.confidence || 0), 0.84),
    need_human: multiIntent.includes("human_handoff"),
    summary: `客戶同時提出：${labels.join("、")}。原始內容：${String(message || "").slice(0, 80)}`,
    multi_intent: multiIntent,
    multi_intent_labels: labels,
    order_no: classification.order_no || identifiers.orderNo,
    tracking_no: classification.tracking_no || identifiers.trackingNo,
    keywords: [...new Set([...(classification.keywords || []), ...labels])]
  };

  if (primaryIntent === "return_request") {
    next.missing_fields = getMissingReturnFields({ intent: "return_request" }, message, conversationHistory);
  } else if (primaryIntent === "order_status") {
    next.missing_fields = next.order_no || next.tracking_no ? [] : ["order_identifier"];
  }

  return next;
}

function isExplicitHumanHandoff(message = "") {
  return /真人|人工|專人|轉人工|客服人員|真人客服|人工客服|我要人處理|找人處理/.test(String(message || ""));
}

function formatIntentLabel(intent) {
  const labels = {
    return_request: "退貨",
    order_status: "貨態",
    product_recommendation: "商品推薦",
    human_handoff: "真人客服",
    faq: "保固/FAQ"
  };
  return labels[intent] || intent;
}

function formatMultiIntentSummary(classification = {}, message = "") {
  if (!classification.multi_intent?.length) return "";
  const labels = classification.multi_intent_labels?.length
    ? classification.multi_intent_labels.join("、")
    : classification.multi_intent.map(formatIntentLabel).join("、");
  return `多需求：${labels}｜原始內容：${String(message || "").slice(0, 80)}`;
}

function getActiveIntents(classification = {}) {
  const intents = classification.multi_intent || classification.multiIntent;
  if (Array.isArray(intents) && intents.length) return new Set(intents);
  return new Set([classification.intent].filter(Boolean));
}

function withIntent(classification = {}, intent) {
  return {
    ...classification,
    intent
  };
}

function isProcessableMultiIntent(classification = {}) {
  const activeIntents = getActiveIntents(classification);
  if (activeIntents.size <= 1) return false;
  if (activeIntents.has("human_handoff") || activeIntents.has("complaint")) return false;
  return true;
}
