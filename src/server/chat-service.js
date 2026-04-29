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

  const rawReply = await buildReply({
    message: cleanMessage,
    classification,
    matchedFaq,
    recommendedProducts,
    decision,
    missingProductFields,
    conversationHistory,
    conversationEnded,
    config: options.config
  });
  const reply = formatAssistantReply(appendContinuationPrompt(rawReply, {
    conversationEnded,
    classification,
    missingProductFields
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
  conversationHistory,
  conversationEnded,
  config
}) {
  if (conversationEnded) {
    return "謝謝您的使用。\n請為本次服務評分，您的回饋會協助我們調整後續回覆品質。";
  }

  if (decision.decision === "needs_review") {
    return "已為您建立待處理工單，真人客服會接手確認。您也可以補充更多細節，讓客服更快處理。";
  }

  if (classification.intent === "product_recommendation" && missingProductFields.length > 0) {
    return `請您再補充${formatMissingProductFields(missingProductFields)}。\n例如預算、用途、送禮或自用情境。`;
  }

  if (classification.intent === "product_recommendation" && recommendedProducts.length > 0) {
    return buildProductRecommendationReply(recommendedProducts, classification);
  }

  if (classification.intent === "product_recommendation") {
    return "目前沒有找到完全符合您條件的商品。\n請您調整預算、用途或品類後再試一次。";
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

export function isConversationEndMessage(message) {
  return /^(沒有|沒有了|沒了|沒問題|不用了|不需要了|好了|可以了|先這樣|ok|OK|謝謝|感謝|謝謝您|謝謝你|沒其他了|沒事了)[。！!.\s]*$/i.test(
    String(message || "").trim()
  );
}

function appendContinuationPrompt(reply, {
  conversationEnded,
  classification,
  missingProductFields
}) {
  if (conversationEnded) return reply;
  if (classification.intent === "product_recommendation" && missingProductFields.length > 0) return reply;
  if (/還有其他問題|還需要協助|其他問題需要協助/.test(reply)) return reply;

  return `${reply}\n\n請問您還有其他問題需要協助嗎？`;
}
