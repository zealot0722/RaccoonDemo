import { decideNextAction } from "./decision.js";
import { findBestFaq } from "./faq.js";
import { classifyMessage, generateReply } from "./llm.js";
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

  const classification = await classifyMessage(cleanMessage, {
    config: options.config,
    conversationHistory
  });
  const missingProductFields = getMissingProductFields(classification);
  const matchedFaq = classification.intent === "faq"
    ? findBestFaq(faqArticles, cleanMessage)
    : null;
  const recommendedProducts = classification.intent === "product_recommendation" &&
    missingProductFields.length === 0
    ? recommendProducts(products, classification)
    : [];

  const decision = decideNextAction({
    classification,
    matchedFaq,
    recommendedProducts,
    missingProductFields,
    replyGenerationOk: true
  });

  const reply = formatAssistantReply(await buildReply({
    message: cleanMessage,
    classification,
    matchedFaq,
    recommendedProducts,
    decision,
    missingProductFields,
    conversationHistory,
    config: options.config
  }));

  const ticket = await repo.createTicket({
    ticket_no: generateTicketNo(),
    customer_id: customerId,
    status: decision.decision === "needs_review" ? "needs_review" : "auto_replied",
    summary: classification.summary || cleanMessage.slice(0, 120),
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
  conversationHistory,
  config
}) {
  if (decision.decision === "needs_review") {
    return "已為您建立待處理工單，真人客服會接手確認。您也可以補充更多細節，讓客服更快處理。";
  }

  if (classification.intent === "product_recommendation" && missingProductFields.length > 0) {
    return `請您再補充${formatMissingProductFields(missingProductFields)}。\n例如預算、用途、送禮或自用情境。`;
  }

  if (classification.intent === "product_recommendation" && recommendedProducts.length > 0) {
    return buildProductRecommendationReply(recommendedProducts, classification);
  }

  if (classification.intent === "out_of_scope") {
    return "目前我可以協助您查詢退換貨、付款、配送、保固，或協助您挑選商品。";
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
